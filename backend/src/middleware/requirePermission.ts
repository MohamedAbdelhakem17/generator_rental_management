import type { NextFunction, Request, Response } from 'express';

import type { PermissionKey } from '../modules/auth/permissions.js';
import { AuthError, ForbiddenError } from '../utils/AppError.js';

/**
 * The single authorization check every mutating (and permission-gated read) route uses
 * (Constitution Article V.1). Must run after `requireAuth` so `req.user` is populated.
 */
export function requirePermission(key: PermissionKey) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthError('Authentication required'));
      return;
    }

    if (!req.user.permissions.includes(key)) {
      next(new ForbiddenError('You do not have permission to perform this action'));
      return;
    }

    next();
  };
}
