import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  correctOperationLog,
  createOperationLog,
  getOperationLog,
  listOperationLogs,
} from './operation-log.controller.js';
import './operation-log.registrations.js';

export const operationLogRouter = Router();

operationLogRouter.use('/operations', requireAuth);

operationLogRouter.get('/operations', requirePermission('operations:read'), asyncHandler(listOperationLogs));
operationLogRouter.get('/operations/:id', requirePermission('operations:read'), asyncHandler(getOperationLog));
operationLogRouter.post('/operations', requirePermission('operations:write'), asyncHandler(createOperationLog));
operationLogRouter.patch(
  '/operations/:id/correct',
  requirePermission('operations:correct'),
  asyncHandler(correctOperationLog),
);
