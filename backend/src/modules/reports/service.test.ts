import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { resetTestDb, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { CustomerModel } from '../customers/customer.model.js';
import { ExtractModel } from '../extracts/extract.model.js';
import { ReportsService } from './service.js';

describe('ReportsService (TASK-028)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('returns paginated uncollected extracts with Decimal-safe balances', async () => {
    const customer = await CustomerModel.create({ code: 'RPT-001', companyName: 'Report Customer' });

    await ExtractModel.create({
      number: 'EX-RPT-001',
      customerId: customer._id,
      projectId: '000000000000000000000001',
      contractIds: ['000000000000000000000001'],
      period: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
      lineItems: [{ type: 'rent', description: 'Rent', amount: '100.00' }],
      discounts: '0',
      vatRateSnapshot: 0.14,
      vat: '14.00',
      totalBeforeVat: '100.00',
      finalTotal: '100.00',
      status: 'Partially Collected',
      collectedAmount: '35.50',
      customerNameSnapshot: 'Report Customer',
    });

    const result = await ReportsService.uncollectedExtracts({
      from: new Date('2026-01-01'),
      to: new Date('2026-01-31'),
      page: 1,
      limit: 20,
    });

    expect(result.meta.total).toBe(1);
    expect(result.items[0]).toEqual({
      extractNumber: 'EX-RPT-001',
      customer: 'Report Customer',
      total: '100.00',
      collected: '35.50',
      remaining: '64.50',
      status: 'Partially Collected',
    });
  });
});
