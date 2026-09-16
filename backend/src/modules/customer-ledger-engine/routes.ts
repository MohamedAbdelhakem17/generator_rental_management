import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getCustomerBalance, getCustomerStatement } from './controller.js';

export const ledgerRouter = Router();

ledgerRouter.use('/customers', requireAuth);
ledgerRouter.get('/customers/:id/balance', requirePermission('customers:read'), asyncHandler(getCustomerBalance));
ledgerRouter.get('/customers/:id/statement', requirePermission('customers:read'), asyncHandler(getCustomerStatement));
