import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { acknowledgeMaintenanceAlert, listMaintenanceAlerts } from './maintenance-alert.controller.js';

export const maintenanceAlertRouter = Router();

maintenanceAlertRouter.use('/maintenance-alerts', requireAuth);

maintenanceAlertRouter.get(
  '/maintenance-alerts',
  requirePermission('maintenance-alerts:read'),
  asyncHandler(listMaintenanceAlerts),
);
maintenanceAlertRouter.post(
  '/maintenance-alerts/:id/acknowledge',
  requirePermission('maintenance-alerts:acknowledge'),
  asyncHandler(acknowledgeMaintenanceAlert),
);
