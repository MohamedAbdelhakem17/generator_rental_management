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
  requirePermission('reports:revenue'),
  asyncHandler(getRevenueReport),
);
reportsRouter.get(
  '/reports/profit-expense-summary',
  requirePermission('reports:profitExpenseSummary'),
  asyncHandler(getProfitExpenseSummaryReport),
);
reportsRouter.get(
  '/reports/operations',
  requirePermission('reports:operations'),
  asyncHandler(getOperationsReport),
);
reportsRouter.get(
  '/reports/fuel-consumption',
  requirePermission('reports:fuelConsumption'),
  asyncHandler(getFuelConsumptionReport),
);
reportsRouter.get(
  '/reports/maintenance',
  requirePermission('reports:maintenance'),
  asyncHandler(getMaintenanceReport),
);
reportsRouter.get(
  '/reports/expenses',
  requirePermission('reports:expenses'),
  asyncHandler(getExpensesReport),
);
reportsRouter.get(
  '/reports/profitability',
  requirePermission('reports:profitability'),
  asyncHandler(getProfitabilityReport),
);
reportsRouter.get(
  '/reports/customer-statement',
  requirePermission('reports:customerStatement'),
  asyncHandler(getCustomerStatement),
);
reportsRouter.get(
  '/reports/uncollected-extracts',
  requirePermission('reports:uncollectedExtracts'),
  asyncHandler(getUncollectedExtracts),
);
