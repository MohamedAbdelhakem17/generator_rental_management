import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  getCustomerStatement,
  getExpensesReport,
  getFuelConsumptionReport,
  getMaintenanceReport,
  getOperationsReport,
  getProfitExpenseSummaryReport,
  getProfitabilityReport,
  getRevenueReport,
  getUncollectedExtracts,
} from './controller.js';

export const reportsRouter = Router();

reportsRouter.use('/reports', requireAuth);
reportsRouter.get(
  '/reports/revenue',
  requirePermission('reports:read'),
  asyncHandler(getRevenueReport),
);
reportsRouter.get(
  '/reports/profit-expense-summary',
  requirePermission('reports:read'),
  asyncHandler(getProfitExpenseSummaryReport),
);
reportsRouter.get(
  '/reports/operations',
  requirePermission('reports:read'),
  asyncHandler(getOperationsReport),
);
reportsRouter.get(
  '/reports/fuel-consumption',
  requirePermission('reports:read'),
  asyncHandler(getFuelConsumptionReport),
);
reportsRouter.get(
  '/reports/maintenance',
  requirePermission('reports:read'),
  asyncHandler(getMaintenanceReport),
);
reportsRouter.get(
  '/reports/expenses',
  requirePermission('reports:read'),
  asyncHandler(getExpensesReport),
);
reportsRouter.get(
  '/reports/profitability',
  requirePermission('reports:read'),
  asyncHandler(getProfitabilityReport),
);
reportsRouter.get(
  '/reports/customer-statement',
  requirePermission('reports:read'),
  asyncHandler(getCustomerStatement),
);
reportsRouter.get(
  '/reports/uncollected-extracts',
  requirePermission('reports:read'),
  asyncHandler(getUncollectedExtracts),
);
