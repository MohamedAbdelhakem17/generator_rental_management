import type { Request, Response } from 'express';

import { successResponse } from '../../utils/responseEnvelope.js';
import { parseOrThrow } from '../../utils/validate.js';
import { DashboardService } from './service.js';
import { dashboardQuerySchema } from './validation.js';

export async function getDashboardSummary(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(dashboardQuerySchema, req.query);
  const from = input.from ?? new Date();
  const to = input.to ?? new Date();
  const result = await DashboardService.getSummary({
    from,
    to,
    projectId: input.projectId,
    customerId: input.customerId,
  });

  res.status(200).json(successResponse(result));
}
