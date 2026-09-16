import { AuditService } from '../audit/audit.service.js';
import { CustomerModel } from '../customers/customer.model.js';
import { ValidationError } from '../../utils/AppError.js';
import { toDecimal128 } from '../../services/money.js';
import { CreditNoteModel, type CreditNoteAttrs, type CreditNoteDocument } from './credit-note.model.js';
import type { CreateCreditNoteInput } from './credit-note.validation.js';

export const CreditNoteService = {
  async create(input: CreateCreditNoteInput, actorUserId: string): Promise<CreditNoteDocument> {
    const customerExists = await CustomerModel.findOne({ _id: input.customerId, isDeleted: { $ne: true } });
    if (!customerExists) {
      throw new ValidationError('Validation failed', [{ field: 'customerId', message: 'Customer does not exist' }]);
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
};
