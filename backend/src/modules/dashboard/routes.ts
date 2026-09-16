import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getDashboardSummary } from './controller.js';

export const dashboardRouter = Router();

dashboardRouter.use('/dashboard', requireAuth);
dashboardRouter.get(
  '/dashboard',
  requirePermission('reports:read'),
  asyncHandler(getDashboardSummary),
);
