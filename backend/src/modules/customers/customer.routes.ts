import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
} from './customer.controller.js';

export const customerRouter = Router();

customerRouter.use('/customers', requireAuth);

customerRouter.get('/customers', requirePermission('customers:read'), asyncHandler(listCustomers));
customerRouter.get('/customers/:id', requirePermission('customers:read'), asyncHandler(getCustomer));
customerRouter.post('/customers', requirePermission('customers:write'), asyncHandler(createCustomer));
customerRouter.patch('/customers/:id', requirePermission('customers:write'), asyncHandler(updateCustomer));
customerRouter.delete('/customers/:id', requirePermission('customers:delete'), asyncHandler(deleteCustomer));
