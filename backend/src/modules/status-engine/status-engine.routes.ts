import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recalculateAllStatuses } from './status-engine.controller.js';

export const statusEngineRouter = Router();

statusEngineRouter.post(
  '/admin/status-engine/recalculate',
  requireAuth,
  requirePermission('status-engine:recalculate'),
  asyncHandler(recalculateAllStatuses),
);
