import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { acknowledgeFuelAlert, listFuelAlerts, resolveFuelAlert } from './fuel-alert.controller.js';

export const fuelAlertRouter = Router();

fuelAlertRouter.use('/fuel-alerts', requireAuth);

fuelAlertRouter.get('/fuel-alerts', requirePermission('fuel-alerts:read'), asyncHandler(listFuelAlerts));
fuelAlertRouter.post(
  '/fuel-alerts/:id/acknowledge',
  requirePermission('fuel-alerts:acknowledge'),
  asyncHandler(acknowledgeFuelAlert),
);
fuelAlertRouter.post(
  '/fuel-alerts/:id/resolve',
  requirePermission('fuel-alerts:resolve'),
  asyncHandler(resolveFuelAlert),
);
