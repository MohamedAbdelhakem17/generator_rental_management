import type { Request, Response } from 'express';
import { z } from 'zod';

import { successResponse } from '../../utils/responseEnvelope.js';
import { idParamSchema, parseOrThrow } from '../../utils/validate.js';
import { CustomerLedgerService } from './service.js';

const statementQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export async function getCustomerBalance(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const balance = await CustomerLedgerService.getBalance(id);
  res.status(200).json(successResponse(balance));
}

export async function getCustomerStatement(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const query = parseOrThrow(statementQuerySchema, req.query);
  const statement = await CustomerLedgerService.getStatement(id, {
    from: query.from,
    to: query.to,
  });
  res.status(200).json(successResponse(statement));
}
