import type { NextFunction, Request, Response } from 'express';

import { ACCESS_TOKEN_COOKIE } from '../modules/auth/cookies.js';
import { AuthError } from '../utils/AppError.js';
import { verifyAccessToken } from '../utils/jwt.js';

/**
 * Verifies the access-token cookie only — deliberately no DB round trip. Business Rule
 * (TASK-006 Section 9/20): a deactivated user's already-issued access token stays valid
 * for its remaining lifetime (max 15 min); `active` is re-checked on refresh instead.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[ACCESS_TOKEN_COOKIE];

  if (!token) {
    next(new AuthError('Authentication required'));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role, permissions: payload.permissions };
    next();
  } catch {
    next(new AuthError('Session expired'));
  }
}
