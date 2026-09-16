import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  allocateExpense,
  createExpense,
  getExpense,
  listExpenses,
  updateExpense,
} from './expense.controller.js';

export const expenseRouter = Router();

expenseRouter.use('/expenses', requireAuth);
expenseRouter.get('/expenses', requirePermission('expenses:read'), asyncHandler(listExpenses));
expenseRouter.get('/expenses/:id', requirePermission('expenses:read'), asyncHandler(getExpense));
expenseRouter.post('/expenses', requirePermission('expenses:write'), asyncHandler(createExpense));
expenseRouter.patch(
  '/expenses/:id',
  requirePermission('expenses:write'),
  asyncHandler(updateExpense),
);
expenseRouter.post(
  '/expenses/:id/allocate',
  requirePermission('expenses:write'),
  asyncHandler(allocateExpense),
);
