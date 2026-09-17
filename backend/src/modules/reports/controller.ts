import type { Request, Response } from 'express';

import { successResponse } from '../../utils/responseEnvelope.js';
import { parseOrThrow } from '../../utils/validate.js';
import { ReportsService } from './service.js';
import { reportQuerySchema } from './validation.js';

export async function getUncollectedExtracts(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(reportQuerySchema, req.query);
  const result = await ReportsService.uncollectedExtracts(query);
  res.status(200).json(successResponse(result.items, null, result.meta));
}

export async function getCustomerStatement(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(reportQuerySchema, { ...req.query, customerId: req.query.customerId });
  if (!query.customerId) {
    res
      .status(422)
      .json({ success: false, data: null, message: 'customerId is required', errors: [] });
    return;
  }

  const result = await ReportsService.customerStatement({
    customerId: query.customerId,
    from: query.from,
    to: query.to,
    page: query.page,
    limit: query.limit,
  });
  res.status(200).json(successResponse(result));
}

export async function getProfitabilityReport(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(reportQuerySchema, req.query);
  const result = await ReportsService.profitability(query);
  res.status(200).json(successResponse(result));
}

export async function getOperationsReport(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(reportQuerySchema, req.query);
  const result = await ReportsService.operations(query);
  res.status(200).json(successResponse(result.items, null, result.meta));
}

export async function getRevenueReport(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(reportQuerySchema, req.query);
  const result = await ReportsService.revenue(query);
  res.status(200).json(successResponse(result.items, null, result.meta));
}

export async function getProfitExpenseSummaryReport(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(reportQuerySchema, req.query);
  res.status(200).json(successResponse(await ReportsService.profitExpenseSummary(query)));
}

export async function getFuelConsumptionReport(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(reportQuerySchema, req.query);
  const result = await ReportsService.fuelConsumption(query);
  res.status(200).json(successResponse(result.items, null, result.meta));
}

export async function getMaintenanceReport(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(reportQuerySchema, req.query);
  const result = await ReportsService.maintenance(query);
  res.status(200).json(successResponse(result.items, null, result.meta));
}

export async function getExpensesReport(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(reportQuerySchema, req.query);
  const result = await ReportsService.expenses(query);
  res.status(200).json(successResponse(result.items, null, result.meta));
}
