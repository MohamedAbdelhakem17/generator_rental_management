import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import type { PermissionKey } from '../modules/auth/permissions.js';

export interface AccessTokenPayload {
  sub: string;
  role: string;
  permissions: PermissionKey[];
}

export interface RefreshTokenPayload {
  sub: string;
  tokenId: string;
}

/** FR-005: access tokens expire in 15 minutes. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
/** Not specified by the PRD beyond "longer-lived" (FR-001); 7 days is the chosen default. */
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as unknown as AccessTokenPayload;
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_TTL_SECONDS });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as unknown as RefreshTokenPayload;
}
