import type { Request, Response } from 'express';

import { toDisplayString, type MoneyInput } from '../../services/money.js';
import { successResponse } from '../../utils/responseEnvelope.js';
import { idParamSchema, parseOrThrow } from '../../utils/validate.js';
import { CreditNoteService } from './credit-note.service.js';
import { createCreditNoteSchema } from './credit-note.validation.js';

function toCreditNoteResponse(creditNote: {
  _id: { toString(): string };
  number: string;
  customerId: unknown;
  amount: MoneyInput;
  reason: string;
  relatedExtractId?: unknown | null;
  status: string;
  createdAt: Date;
}) {
  return {
    id: String(creditNote._id),
    number: creditNote.number,
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

export async function cancelCreditNote(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const creditNote = await CreditNoteService.cancel(id, req.user!.id);
  res.status(200).json(successResponse(toCreditNoteResponse(creditNote as never)));
}
