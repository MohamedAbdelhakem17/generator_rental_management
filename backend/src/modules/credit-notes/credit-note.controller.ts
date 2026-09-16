import type { Request, Response } from 'express';

import { successResponse } from '../../utils/responseEnvelope.js';
import { parseOrThrow } from '../../utils/validate.js';
import { toDisplayString } from '../../services/money.js';
import { CreditNoteService } from './credit-note.service.js';
import { createCreditNoteSchema } from './credit-note.validation.js';

function toCreditNoteResponse(creditNote: { _id: { toString(): string }; customerId: unknown; amount: unknown; reason: string; relatedExtractId?: unknown | null; status: string; createdAt: Date }) {
  return {
    id: String(creditNote._id),
    customerId: String(creditNote.customerId),
    amount: toDisplayString(creditNote.amount),
    reason: creditNote.reason,
    relatedExtractId: creditNote.relatedExtractId ? String(creditNote.relatedExtractId) : null,
    status: creditNote.status,
    createdAt: creditNote.createdAt,
  };
}

export async function createCreditNote(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(createCreditNoteSchema, req.body);
  const creditNote = await CreditNoteService.create(input, req.user!.id);
  res.status(201).json(successResponse(toCreditNoteResponse(creditNote as never)));
}
