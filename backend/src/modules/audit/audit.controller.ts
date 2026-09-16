import type { Request, Response } from 'express';

import { successResponse } from '../../utils/responseEnvelope.js';
import { parseOrThrow } from '../../utils/validate.js';
import { AuditService } from './audit.service.js';
import { listAuditLogsQuerySchema } from './audit.validation.js';

export async function listAuditLogs(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(listAuditLogsQuerySchema, req.query);
  const result = await AuditService.list(query);
  res.status(200).json(successResponse(result.items, null, result.meta));
}
