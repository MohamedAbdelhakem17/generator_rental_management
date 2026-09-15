import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  activateContract,
  cancelContract,
  createContract,
  getContract,
  listContracts,
  updateContract,
} from './contract.controller.js';
import './contract.registrations.js';

export const contractRouter = Router();

contractRouter.use('/contracts', requireAuth);

contractRouter.get('/contracts', requirePermission('contracts:read'), asyncHandler(listContracts));
contractRouter.get('/contracts/:id', requirePermission('contracts:read'), asyncHandler(getContract));
contractRouter.post('/contracts', requirePermission('contracts:write'), asyncHandler(createContract));
contractRouter.patch('/contracts/:id', requirePermission('contracts:write'), asyncHandler(updateContract));
contractRouter.post('/contracts/:id/activate', requirePermission('contracts:write'), asyncHandler(activateContract));
contractRouter.post('/contracts/:id/cancel', requirePermission('contracts:write'), asyncHandler(cancelContract));
