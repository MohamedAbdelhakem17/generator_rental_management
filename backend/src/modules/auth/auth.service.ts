import { randomUUID } from 'node:crypto';

import { AuditService } from '../audit/audit.service.js';
import type { RoleDocument } from '../roles/role.model.js';
import { UserModel, type UserDocument } from '../users/user.model.js';
import { AuthError, ForbiddenError } from '../../utils/AppError.js';
import {
  REFRESH_TOKEN_TTL_SECONDS,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../utils/jwt.js';
import { verifyPassword } from '../../utils/password.js';
import type { PermissionKey } from './permissions.js';
import { RefreshTokenModel } from './refreshToken.model.js';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: PermissionKey[];
}

type PopulatedUser = Omit<UserDocument, 'role'> & { role: RoleDocument };

function toAuthenticatedUser(user: PopulatedUser): AuthenticatedUser {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role.name,
    permissions: user.role.permissions as PermissionKey[],
  };
}

async function issueTokenPair(user: PopulatedUser): Promise<SessionTokens> {
  const accessToken = signAccessToken({
    sub: String(user._id),
    role: user.role.name,
    permissions: user.role.permissions as PermissionKey[],
  });

  const tokenId = randomUUID();
  const refreshToken = signRefreshToken({ sub: String(user._id), tokenId });

  await RefreshTokenModel.create({
    user: user._id,
    tokenId,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
  });

  return { accessToken, refreshToken };
}

async function findActiveUserByEmail(email: string): Promise<PopulatedUser | null> {
  const user = await UserModel.findOne({ email: email.toLowerCase(), isDeleted: { $ne: true } })
    .select('+passwordHash')
    .populate<{ role: RoleDocument }>('role')
    .exec();
  return user as PopulatedUser | null;
}

export const AuthService = {
  async login(email: string, password: string): Promise<{ user: AuthenticatedUser; tokens: SessionTokens }> {
    const user = await findActiveUserByEmail(email);

    // FR-002: identical generic error whether the email doesn't exist or the password is wrong.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      await AuditService.record({
        action: 'auth.login.failure',
        actorUserId: user ? String(user._id) : null,
        metadata: { email },
      });
      throw new AuthError('Invalid email or password');
    }

    if (!user.active) {
      await AuditService.record({ action: 'auth.login.blocked', actorUserId: String(user._id), metadata: { email } });
      throw new ForbiddenError('This account has been disabled');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const tokens = await issueTokenPair(user);
    await AuditService.record({ action: 'auth.login.success', actorUserId: String(user._id) });

    return { user: toAuthenticatedUser(user), tokens };
  },

  async refresh(rawRefreshToken: string): Promise<{ user: AuthenticatedUser; tokens: SessionTokens }> {
    let payload;
    try {
      payload = verifyRefreshToken(rawRefreshToken);
    } catch {
      throw new AuthError('Session expired, please sign in again');
    }

    const stored = await RefreshTokenModel.findOne({ tokenId: payload.tokenId });

    if (!stored || stored.revokedAt) {
      if (stored) {
        // Section 19: reuse of an already-rotated refresh token revokes the whole session family.
        await RefreshTokenModel.updateMany(
          { user: stored.user, revokedAt: null },
          { $set: { revokedAt: new Date() } },
        );
        await AuditService.record({
          action: 'auth.refresh.reuse_detected',
          actorUserId: String(stored.user),
        });
      }
      throw new AuthError('Session expired, please sign in again');
    }

    const user = (await UserModel.findOne({ _id: stored.user, isDeleted: { $ne: true } })
      .populate<{ role: RoleDocument }>('role')
      .exec()) as PopulatedUser | null;

    if (!user || !user.active) {
      throw new AuthError('Session expired, please sign in again');
    }

    stored.revokedAt = new Date();
    await stored.save();

    const tokens = await issueTokenPair(user);
    return { user: toAuthenticatedUser(user), tokens };
  },

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;

    try {
      const payload = verifyRefreshToken(rawRefreshToken);
      await RefreshTokenModel.updateOne({ tokenId: payload.tokenId }, { $set: { revokedAt: new Date() } });
      await AuditService.record({ action: 'auth.logout', actorUserId: payload.sub });
    } catch {
      // An already-invalid/expired refresh token on logout is a no-op, not an error.
    }
  },

  async getCurrentUser(userId: string): Promise<AuthenticatedUser> {
    const user = (await UserModel.findOne({ _id: userId, isDeleted: { $ne: true } })
      .populate<{ role: RoleDocument }>('role')
      .exec()) as PopulatedUser | null;

    if (!user || !user.active) {
      throw new AuthError('Session expired, please sign in again');
    }

    return toAuthenticatedUser(user);
  },
};
