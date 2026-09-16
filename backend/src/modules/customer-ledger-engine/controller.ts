import type { Request, Response } from 'express';
import { z } from 'zod';

import { successResponse } from '../../utils/responseEnvelope.js';
import { parseOrThrow } from '../../utils/validate.js';
import { CustomerLedgerService } from './service.js';

const statementQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export async function getCustomerBalance(req: Request, res: Response): Promise<void> {
  const balance = await CustomerLedgerService.getBalance(req.params.id);
  res.status(200).json(successResponse(balance));
}

export async function getCustomerStatement(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(statementQuerySchema, req.query);
  const statement = await CustomerLedgerService.getStatement(req.params.id, {
    from: query.from,
    to: query.to,
  });
  res.status(200).json(successResponse(statement));
}
