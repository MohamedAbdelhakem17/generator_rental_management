import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { createFuelLog, getFuelLog, listFuelLogs } from './fuel-log.controller.js';

export const fuelLogRouter = Router();

fuelLogRouter.use('/fuel', requireAuth);

fuelLogRouter.get('/fuel', requirePermission('fuel:read'), asyncHandler(listFuelLogs));
fuelLogRouter.get('/fuel/:id', requirePermission('fuel:read'), asyncHandler(getFuelLog));
fuelLogRouter.post('/fuel', requirePermission('fuel:write'), asyncHandler(createFuelLog));
