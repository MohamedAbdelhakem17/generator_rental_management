import type { Request, Response } from 'express';

import { successResponse } from '../../utils/responseEnvelope.js';
import { idParamSchema, parseOrThrow } from '../../utils/validate.js';
import { runStatusReconciliation } from './status-engine.job.js';
import { StatusEngineService } from './status-engine.service.js';

export async function recalculateAllStatuses(_req: Request, res: Response): Promise<void> {
  const result = await runStatusReconciliation();
  res.status(200).json(successResponse(result));
}

export async function getGeneratorStatusHistory(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const entries = await StatusEngineService.getHistory(id);
  res.status(200).json(
    successResponse(
      entries.map((entry) => ({
        from: entry.from,
        to: entry.to,
        reason: entry.reason,
        triggeredBy: entry.triggeredBy,
        at: entry.at,
      })),
    ),
  );
}
