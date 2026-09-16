import { Decimal } from 'decimal.js';

import { NotFoundError, ValidationError } from '../../utils/AppError.js';
import { toDecimal, toDisplayString } from '../../services/money.js';
import { CustomerModel } from '../customers/customer.model.js';
import { CreditNoteModel } from '../credit-notes/credit-note.model.js';
import { ExtractModel } from '../extracts/extract.model.js';
import { ReceiptModel } from '../receipts/receipt.model.js';

export interface StatementQuery {
  from?: Date;
  to?: Date;
}

export interface StatementEntry {
  date: string;
  type: 'Extract' | 'Receipt' | 'Credit Note' | 'Cancelled Extract';
  reference: string;
  debit: string;
  credit: string;
  runningBalance: string;
}

export interface StatementResult {
  entries: StatementEntry[];
  closingBalance: string;
}

async function assertCustomerExists(customerId: string): Promise<void> {
  const customer = await CustomerModel.findOne({ _id: customerId, isDeleted: { $ne: true } });
  if (!customer) {
    throw new NotFoundError('Customer not found');
  }
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toMoneyString(value: Decimal): string {
  return toDisplayString(value);
}

export const CustomerLedgerService = {
  async getBalance(customerId: string): Promise<string> {
    await assertCustomerExists(customerId);

    const [approvedExtracts, receipts, creditNotes] = await Promise.all([
      ExtractModel.find({
        customerId,
        status: { $in: ['Approved', 'Partially Collected', 'Collected'] },
      }),
      ReceiptModel.find({ customerId, status: { $ne: 'Cancelled' } }),
      CreditNoteModel.find({ customerId, status: 'Confirmed' }),
    ]);

    const extractTotal = approvedExtracts.reduce(
      (sum, extract) => sum.plus(toDecimal(extract.finalTotal ?? '0')),
      new Decimal(0),
    );
    const receiptTotal = receipts.reduce((sum, receipt) => sum.plus(toDecimal(receipt.amount)), new Decimal(0));
    const creditNoteTotal = creditNotes.reduce(
      (sum, creditNote) => sum.plus(toDecimal(creditNote.amount)),
      new Decimal(0),
    );

    return toMoneyString(extractTotal.minus(receiptTotal).minus(creditNoteTotal));
  },

  async getStatement(customerId: string, query: StatementQuery = {}): Promise<StatementResult> {
    await assertCustomerExists(customerId);

    const from = query.from ?? null;
    const to = query.to ?? null;
    if (from && to && to.getTime() < from.getTime()) {
      throw new ValidationError('Validation failed', [{ field: 'to', message: 'to must be on or after from' }]);
    }

    const [extracts, receipts, creditNotes] = await Promise.all([
      ExtractModel.find({ customerId }),
      ReceiptModel.find({ customerId, status: { $ne: 'Cancelled' } }),
      CreditNoteModel.find({ customerId, status: 'Confirmed' }),
    ]);

    const acceptedExtracts = extracts.filter((extract) => {
      const date = extract.period?.end ? new Date(extract.period.end) : extract.updatedAt ?? new Date();
      const matchesFrom = !from || date >= from;
      const matchesTo = !to || date <= to;
      return matchesFrom && matchesTo;
    });

    const entries: Array<{ date: Date; type: StatementEntry['type']; reference: string; debit: Decimal; credit: Decimal }> = [];

    for (const extract of acceptedExtracts) {
      const extractDate = extract.period?.end ? new Date(extract.period.end) : extract.updatedAt ?? new Date();
      if (extract.status === 'Cancelled') {
        entries.push({
          date: extractDate,
          type: 'Cancelled Extract',
          reference: extract.number,
          debit: new Decimal(0),
          credit: toDecimal(extract.finalTotal ?? '0'),
        });
        continue;
      }

      if (['Approved', 'Partially Collected', 'Collected'].includes(extract.status)) {
        entries.push({
          date: extractDate,
          type: 'Extract',
          reference: extract.number,
          debit: toDecimal(extract.finalTotal ?? '0'),
          credit: new Decimal(0),
        });
      }
    }

    for (const receipt of receipts) {
      const date = receipt.date ? new Date(receipt.date) : receipt.createdAt ?? new Date();
      const matchesFrom = !from || date >= from;
      const matchesTo = !to || date <= to;
      if (matchesFrom && matchesTo) {
        entries.push({
          date,
          type: 'Receipt',
          reference: receipt.number,
          debit: new Decimal(0),
          credit: toDecimal(receipt.amount),
        });
      }
    }

    for (const creditNote of creditNotes) {
      const date = creditNote.createdAt ?? new Date();
      const matchesFrom = !from || date >= from;
      const matchesTo = !to || date <= to;
      if (matchesFrom && matchesTo) {
        entries.push({
          date,
          type: 'Credit Note',
          reference: creditNote.number,
          debit: new Decimal(0),
          credit: toDecimal(creditNote.amount),
        });
      }
    }

    entries.sort((a, b) => a.date.getTime() - b.date.getTime());

    let runningBalance = new Decimal(0);
    const mappedEntries: StatementEntry[] = entries.map((entry) => {
      runningBalance = runningBalance.plus(entry.debit).minus(entry.credit);
      return {
        date: toIsoDate(entry.date),
        type: entry.type,
        reference: entry.reference,
        debit: toMoneyString(entry.debit),
        credit: toMoneyString(entry.credit),
        runningBalance: toMoneyString(runningBalance),
      };
    });

    return {
      entries: mappedEntries,
      closingBalance: toMoneyString(runningBalance),
    };
  },
};
