import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { resetTestDb, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { CreditNoteModel } from '../credit-notes/credit-note.model.js';
import { CustomerModel } from '../customers/customer.model.js';
import { ExtractModel } from '../extracts/extract.model.js';
import { ReceiptModel } from '../receipts/receipt.model.js';
import { CustomerLedgerService } from './service.js';

async function createCustomer() {
  return CustomerModel.create({
    code: `CUST-${Math.random().toString(36).slice(2, 8)}`,
    companyName: 'Acme Construction',
  });
}

describe('CustomerLedgerService (TASK-023)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('matches the golden balance example: 1,250,000 total approved extracts - 850,000 receipts - 50,000 credit notes = 350,000', async () => {
    const customer = await createCustomer();

    await ExtractModel.create({
      number: 'EXT-2026-0001',
      customerId: customer._id,
      projectId: '000000000000000000000001',
      contractIds: ['000000000000000000000002'],
      period: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
      lineItems: [{ type: 'rent', description: 'Rent', amount: '1250000.00' }],
      discounts: '0',
      vatRateSnapshot: 0.14,
      totalBeforeVat: '1250000.00',
      vat: '175000.00',
      finalTotal: '1250000.00',
      status: 'Approved',
      collectedAmount: '0',
      customerNameSnapshot: 'Acme Construction',
    });

    await ReceiptModel.create({
      number: 'RC-2026-0001',
      customerId: customer._id,
      date: new Date('2026-02-01'),
      amount: '850000.00',
      paymentMethod: 'BankTransfer',
      account: '001',
      transferNumber: 'TR-001',
      allocations: [{ extractId: '000000000000000000000002', amount: '850000.00' }],
      status: 'Confirmed',
    });

    await CreditNoteModel.create({
      number: 'CN-2026-0001',
      customerId: customer._id,
      amount: '50000.00',
      reason: 'Early settlement discount',
      status: 'Confirmed',
    });

    const balance = await CustomerLedgerService.getBalance(String(customer._id));
    expect(balance).toBe('350000.00');
  });

  it('TASK-034: getBalancesForCustomers (batched) matches getBalance (per-customer) for multiple customers, including one with zero activity', async () => {
    const customerA = await createCustomer();
    const customerB = await createCustomer();
    const customerC = await createCustomer();

    await ExtractModel.create({
      number: 'EXT-2026-0002',
      customerId: customerA._id,
      projectId: '000000000000000000000001',
      contractIds: ['000000000000000000000002'],
      period: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
      lineItems: [{ type: 'rent', description: 'Rent', amount: '100000.00' }],
      discounts: '0',
      vatRateSnapshot: 0.14,
      totalBeforeVat: '100000.00',
      vat: '14000.00',
      finalTotal: '100000.00',
      status: 'Approved',
      collectedAmount: '0',
      customerNameSnapshot: 'Acme Construction',
    });
    await ReceiptModel.create({
      number: 'RC-2026-0002',
      customerId: customerA._id,
      date: new Date('2026-02-01'),
      amount: '40000.00',
      paymentMethod: 'Cash',
      status: 'Confirmed',
    });

    await CreditNoteModel.create({
      number: 'CN-2026-0002',
      customerId: customerB._id,
      amount: '5000.00',
      reason: 'Goodwill adjustment',
      status: 'Confirmed',
    });

    const ids = [String(customerA._id), String(customerB._id), String(customerC._id)];
    const batched = await CustomerLedgerService.getBalancesForCustomers(ids);

    for (const id of ids) {
      const individual = await CustomerLedgerService.getBalance(id);
      expect(batched.get(id)).toBe(individual);
    }
    expect(batched.get(String(customerA._id))).toBe('60000.00');
    expect(batched.get(String(customerB._id))).toBe('-5000.00');
    expect(batched.get(String(customerC._id))).toBe('0.00');
  });

  it('TASK-034: getBalancesForCustomers returns an empty map for an empty input without querying', async () => {
    const result = await CustomerLedgerService.getBalancesForCustomers([]);
    expect(result.size).toBe(0);
  });

  describe('getOverdueSummaryForCustomers (TASK-026)', () => {
    const GRACE_DAYS = 30;
    const asOf = new Date('2026-06-01T00:00:00.000Z');

    async function createExtract(overrides: Record<string, unknown>) {
      return ExtractModel.create({
        number: `EXT-${Math.random().toString(36).slice(2, 10)}`,
        projectId: '000000000000000000000001',
        contractIds: ['000000000000000000000002'],
        lineItems: [{ type: 'rent', description: 'Rent', amount: '10000.00' }],
        discounts: '0',
        vatRateSnapshot: 0.14,
        totalBeforeVat: '10000.00',
        vat: '1400.00',
        finalTotal: '10000.00',
        collectedAmount: '0',
        customerNameSnapshot: 'Acme Construction',
        ...overrides,
      });
    }

    it('excludes an extract still inside the grace period', async () => {
      const customer = await createCustomer();
      // period.end 20 days before asOf, grace period 30 days -> not yet due
      await createExtract({
        customerId: customer._id,
        period: { start: new Date('2026-05-01'), end: new Date('2026-05-12') },
        status: 'Approved',
      });

      const result = await CustomerLedgerService.getOverdueSummaryForCustomers(
        [String(customer._id)],
        GRACE_DAYS,
        asOf,
      );
      expect(result.has(String(customer._id))).toBe(false);
    });

    it('flags an extract past the grace period as overdue with the correct day count', async () => {
      const customer = await createCustomer();
      // period.end 40 days before asOf; due date = period.end + 30 days = 10 days before asOf
      await createExtract({
        customerId: customer._id,
        period: { start: new Date('2026-04-01'), end: new Date('2026-04-22') },
        status: 'Approved',
      });

      const result = await CustomerLedgerService.getOverdueSummaryForCustomers(
        [String(customer._id)],
        GRACE_DAYS,
        asOf,
      );
      const summary = result.get(String(customer._id));
      expect(summary).toBeDefined();
      expect(summary?.overdueExtractCount).toBe(1);
      expect(summary?.overdueBalance).toBe('10000.00');
      expect(summary?.overdueDays).toBe(10);
    });

    it('never counts a fully Collected extract as overdue', async () => {
      const customer = await createCustomer();
      await createExtract({
        customerId: customer._id,
        period: { start: new Date('2026-01-01'), end: new Date('2026-01-10') },
        status: 'Collected',
        collectedAmount: '10000.00',
      });

      const result = await CustomerLedgerService.getOverdueSummaryForCustomers(
        [String(customer._id)],
        GRACE_DAYS,
        asOf,
      );
      expect(result.has(String(customer._id))).toBe(false);
    });

    it('excludes Draft/Under Review/Cancelled extracts even if their period.end is old', async () => {
      const customer = await createCustomer();
      await createExtract({
        customerId: customer._id,
        period: { start: new Date('2026-01-01'), end: new Date('2026-01-10') },
        status: 'Draft',
        finalTotal: null,
        totalBeforeVat: null,
        vat: null,
      });

      const result = await CustomerLedgerService.getOverdueSummaryForCustomers(
        [String(customer._id)],
        GRACE_DAYS,
        asOf,
      );
      expect(result.has(String(customer._id))).toBe(false);
    });

    it('is exactly on the grace-period boundary at 0 overdue days, not excluded or negative', async () => {
      const customer = await createCustomer();
      // due date = period.end + 30 days = exactly asOf
      await createExtract({
        customerId: customer._id,
        period: { start: new Date('2026-04-22'), end: new Date('2026-05-02') },
        status: 'Partially Collected',
      });

      const result = await CustomerLedgerService.getOverdueSummaryForCustomers(
        [String(customer._id)],
        GRACE_DAYS,
        asOf,
      );
      const summary = result.get(String(customer._id));
      expect(summary).toBeDefined();
      expect(summary?.overdueDays).toBe(0);
    });

    it('returns an empty map for an empty customer list', async () => {
      const result = await CustomerLedgerService.getOverdueSummaryForCustomers([], GRACE_DAYS, asOf);
      expect(result.size).toBe(0);
    });
  });
});
