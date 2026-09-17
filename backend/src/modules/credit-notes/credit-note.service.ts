import { toDecimal128 } from '../../services/money.js';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/AppError.js';
import { AuditService } from '../audit/audit.service.js';
import { CustomerModel } from '../customers/customer.model.js';
import { CreditNoteModel, type CreditNoteDocument } from './credit-note.model.js';
import type { CreateCreditNoteInput } from './credit-note.validation.js';

export const CreditNoteService = {
  async create(input: CreateCreditNoteInput, actorUserId: string): Promise<CreditNoteDocument> {
    const customerExists = await CustomerModel.findOne({
      _id: input.customerId,
      isDeleted: { $ne: true },
    });
    if (!customerExists) {
      throw new ValidationError('Validation failed', [
        { field: 'customerId', message: 'Customer does not exist' },
      ]);
    }

    const number = `CN-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const creditNote = await CreditNoteModel.create({
      number,
      customerId: input.customerId,
      amount: toDecimal128(input.amount),
      reason: input.reason,
      relatedExtractId: input.relatedExtractId ?? null,
      status: 'Confirmed',
    });

    await AuditService.record({
      action: 'credit-note.create',
      actorUserId,
      entityType: 'CreditNote',
      entityId: String(creditNote._id),
      metadata: { after: creditNote.toObject() },
    });

    return creditNote;
  },

  /** Section 21: "Credit Note create/cancel audited" — this was the missing half of that pair
   * (only `create` existed). The Ledger Engine already filters to `status: 'Confirmed'`, so
   * cancelling here removes the credit note's effect on the customer's balance without any
   * change needed on the ledger side. */
  async cancel(creditNoteId: string, actorUserId: string): Promise<CreditNoteDocument> {
    const creditNote = await CreditNoteModel.findById(creditNoteId);
    if (!creditNote) {
      throw new NotFoundError('Credit note not found');
    }
    if (creditNote.status === 'Cancelled') {
      throw new ConflictError('This credit note is already cancelled');
    }

    const before = { status: creditNote.status };
    creditNote.status = 'Cancelled';
    await creditNote.save();

    await AuditService.record({
      action: 'credit-note.cancel',
      actorUserId,
      entityType: 'CreditNote',
      entityId: String(creditNote._id),
      before,
      after: { status: creditNote.status },
    });

    return creditNote;
  },
};
