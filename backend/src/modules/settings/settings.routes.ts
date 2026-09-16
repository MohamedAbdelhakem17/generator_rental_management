import { Router, type NextFunction, type Request, type Response } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { AuthError, ForbiddenError } from '../../utils/AppError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getSettings, updateSetting } from './settings.controller.js';

/** Section 17: viewing/editing a setting requires either `settings:manage` (Admin, all keys)
 * or `settings:finance` (Finance Manager, Financial keys only — enforced in the service). Two
 * permission keys satisfying one route can't be expressed with the single-key
 * `requirePermission` middleware, so this route group gates on "has either" itself. */
function requireSettingsAccess(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new AuthError('Authentication required'));
    return;
  }
  if (req.user.permissions.includes('settings:manage') || req.user.permissions.includes('settings:finance')) {
    next();
    return;
  }
  next(new ForbiddenError('You do not have permission to view settings'));
}

export const settingsRouter = Router();

settingsRouter.use('/settings', requireAuth, requireSettingsAccess);
settingsRouter.get('/settings', asyncHandler(getSettings));
settingsRouter.patch('/settings/:key', asyncHandler(updateSetting));
