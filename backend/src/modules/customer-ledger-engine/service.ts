import { Decimal } from 'decimal.js';
import { Types, type Model } from 'mongoose';

import { toDecimal, toDisplayString } from '../../services/money.js';
import { NotFoundError, ValidationError } from '../../utils/AppError.js';
import { CreditNoteModel } from '../credit-notes/credit-note.model.js';
import { CustomerModel } from '../customers/customer.model.js';
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
  referenceId: string;
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

/** Runs one `$group` sum per collection across every given customer, instead of N separate
 * per-customer queries — used where a caller needs many customers' balances at once (the
 * Dashboard's "Outstanding Receivables"/"Overdue Customers" KPIs). Same three-collection
 * formula as `getBalance`, just batched (TASK-034: this was a 3N-query fan-out per dashboard
 * load with no cap on active-customer count). */
async function sumByCustomer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>,
  match: Record<string, unknown>,
  sumField: string,
  customerIds: string[],
): Promise<Map<string, Decimal>> {
  const rows: { _id: unknown; total: unknown }[] = await model.aggregate([
    { $match: { ...match, customerId: { $in: customerIds.map((id) => new Types.ObjectId(id)) } } },
    { $group: { _id: '$customerId', total: { $sum: `$${sumField}` } } },
  ]);
  const result = new Map<string, Decimal>();
  for (const row of rows) {
    result.set(String(row._id), toDecimal(row.total as never));
  }
  return result;
}

export interface CustomerOverdueSummary {
  overdueBalance: string;
  overdueDays: number;
  overdueExtractCount: number;
}

export const CustomerLedgerService = {
  /**
   * Real aging, not "any positive balance": an Extract counts as overdue once it is
   * Approved/Partially Collected (not yet fully collected, not Draft/Under Review/Cancelled)
   * and its `period.end` is more than `overdueGracePeriodDays` (Settings, TASK-030) in the
   * past. `overdueDays` is measured from the OLDEST overdue extract's due date (period.end +
   * grace period) to `asOf`, per customer. Single aggregation across all given customers —
   * no per-customer fan-out (same batching precedent as `getBalancesForCustomers`, TASK-034).
   */
  async getOverdueSummaryForCustomers(
    customerIds: string[],
    graceDays: number,
    asOf: Date = new Date(),
  ): Promise<Map<string, CustomerOverdueSummary>> {
    if (customerIds.length === 0) return new Map();

    const dueCutoff = new Date(asOf.getTime() - graceDays * 24 * 60 * 60 * 1000);

    const rows: {
      _id: unknown;
      overdueBalance: unknown;
      overdueExtractCount: number;
      oldestPeriodEnd: Date;
    }[] = await ExtractModel.aggregate([
      {
        $match: {
          customerId: { $in: customerIds.map((id) => new Types.ObjectId(id)) },
          status: { $in: ['Approved', 'Partially Collected'] },
          'period.end': { $lte: dueCutoff },
        },
      },
      {
        $group: {
          _id: '$customerId',
          overdueBalance: { $sum: '$finalTotal' },
          overdueExtractCount: { $sum: 1 },
          oldestPeriodEnd: { $min: '$period.end' },
        },
      },
    ]);

    const result = new Map<string, CustomerOverdueSummary>();
    const msPerDay = 24 * 60 * 60 * 1000;
    for (const row of rows) {
      const dueDate = new Date(new Date(row.oldestPeriodEnd).getTime() + graceDays * msPerDay);
      const overdueDays = Math.max(0, Math.floor((asOf.getTime() - dueDate.getTime()) / msPerDay));
      result.set(String(row._id), {
        overdueBalance: toMoneyString(toDecimal(row.overdueBalance as never)),
        overdueDays,
        overdueExtractCount: row.overdueExtractCount,
      });
    }
    return result;
  },

  async getBalancesForCustomers(customerIds: string[]): Promise<Map<string, string>> {
    if (customerIds.length === 0) return new Map();

    const [extractTotals, receiptTotals, creditNoteTotals] = await Promise.all([
      sumByCustomer(
        ExtractModel,
        { status: { $in: ['Approved', 'Partially Collected', 'Collected'] } },
        'finalTotal',
        customerIds,
      ),
      sumByCustomer(ReceiptModel, { status: { $ne: 'Cancelled' } }, 'amount', customerIds),
      sumByCustomer(CreditNoteModel, { status: 'Confirmed' }, 'amount', customerIds),
    ]);

    const balances = new Map<string, string>();
    for (const customerId of customerIds) {
      const balance = (extractTotals.get(customerId) ?? new Decimal(0))
        .minus(receiptTotals.get(customerId) ?? new Decimal(0))
        .minus(creditNoteTotals.get(customerId) ?? new Decimal(0));
      balances.set(customerId, toMoneyString(balance));
    }
    return balances;
  },

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
    const receiptTotal = receipts.reduce(
      (sum, receipt) => sum.plus(toDecimal(receipt.amount)),
      new Decimal(0),
    );
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
      throw new ValidationError('Validation failed', [
        { field: 'to', message: 'to must be on or after from' },
      ]);
    }

    const [extracts, receipts, creditNotes] = await Promise.all([
      ExtractModel.find({ customerId }),
      ReceiptModel.find({ customerId, status: { $ne: 'Cancelled' } }),
      CreditNoteModel.find({ customerId, status: 'Confirmed' }),
    ]);

    const acceptedExtracts = extracts.filter((extract) => {
      const date = extract.period?.end
        ? new Date(extract.period.end)
        : (extract.updatedAt ?? new Date());
      const matchesFrom = !from || date >= from;
      const matchesTo = !to || date <= to;
      return matchesFrom && matchesTo;
    });

    const entries: Array<{
      date: Date;
      type: StatementEntry['type'];
      reference: string;
      referenceId: string;
      debit: Decimal;
      credit: Decimal;
    }> = [];

    for (const extract of acceptedExtracts) {
      const extractDate = extract.period?.end
        ? new Date(extract.period.end)
        : (extract.updatedAt ?? new Date());
      if (extract.status === 'Cancelled') {
        entries.push({
          date: extractDate,
          type: 'Cancelled Extract',
          reference: extract.number,
          referenceId: String(extract._id),
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
          referenceId: String(extract._id),
          debit: toDecimal(extract.finalTotal ?? '0'),
          credit: new Decimal(0),
        });
      }
    }

    for (const receipt of receipts) {
      const date = receipt.date ? new Date(receipt.date) : (receipt.createdAt ?? new Date());
      const matchesFrom = !from || date >= from;
      const matchesTo = !to || date <= to;
      if (matchesFrom && matchesTo) {
        entries.push({
          date,
          type: 'Receipt',
          reference: receipt.number,
          referenceId: String(receipt._id),
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
          referenceId: String(creditNote._id),
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
        referenceId: entry.referenceId,
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
