import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  cancelMaintenance,
  completeMaintenance,
  getMaintenance,
  listMaintenance,
  openMaintenance,
  startMaintenance,
  updateMaintenance,
} from './maintenance.controller.js';
import './maintenance.registrations.js';

export const maintenanceRouter = Router();

maintenanceRouter.use('/maintenance', requireAuth);

maintenanceRouter.get('/maintenance', requirePermission('maintenance:read'), asyncHandler(listMaintenance));
maintenanceRouter.get('/maintenance/:id', requirePermission('maintenance:read'), asyncHandler(getMaintenance));
maintenanceRouter.post('/maintenance', requirePermission('maintenance:write'), asyncHandler(openMaintenance));
maintenanceRouter.patch('/maintenance/:id', requirePermission('maintenance:write'), asyncHandler(updateMaintenance));
maintenanceRouter.post('/maintenance/:id/start', requirePermission('maintenance:write'), asyncHandler(startMaintenance));
maintenanceRouter.post(
  '/maintenance/:id/complete',
  requirePermission('maintenance:complete'),
  asyncHandler(completeMaintenance),
);
maintenanceRouter.post(
  '/maintenance/:id/cancel',
  requirePermission('maintenance:complete'),
  asyncHandler(cancelMaintenance),
);
