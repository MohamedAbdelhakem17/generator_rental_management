import type { Request, Response } from 'express';

import { successResponse } from '../../utils/responseEnvelope.js';
import { parseOrThrow } from '../../utils/validate.js';
import { ProfitabilityEngineService } from './service.js';
import { profitabilityQuerySchema } from './validation.js';

export async function getProfitability(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(profitabilityQuerySchema, req.query);
  const result = await ProfitabilityEngineService.calculate({
    generatorId: input.generatorId,
    projectId: input.projectId,
    customerId: input.customerId,
    from: input.from,
    to: input.to,
  });

  res.status(200).json(successResponse(result));
}
