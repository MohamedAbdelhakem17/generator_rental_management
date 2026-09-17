import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { resetTestDb, seedTestSettings, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { CustomerModel } from '../customers/customer.model.js';
import { ExtractModel } from '../extracts/extract.model.js';
import { NotificationModel } from '../notification-engine/notification.model.js';
import { runOverdueCustomerAlertJob } from './overdue-customer-alert.job.js';

async function createOverdueCustomer() {
  const customer = await CustomerModel.create({
    code: `CUST-${Math.random().toString(36).slice(2, 8)}`,
    companyName: 'Overdue Co',
    active: true,
  });
  await ExtractModel.create({
    number: `EXT-${Math.random().toString(36).slice(2, 10)}`,
    customerId: customer._id,
    projectId: '000000000000000000000001',
    contractIds: ['000000000000000000000002'],
    period: { start: new Date('2026-01-01'), end: new Date('2026-01-10') },
    lineItems: [{ type: 'rent', description: 'Rent', amount: '10000.00' }],
    discounts: '0',
    vatRateSnapshot: 0.14,
    totalBeforeVat: '10000.00',
    vat: '1400.00',
    finalTotal: '10000.00',
    status: 'Approved',
    collectedAmount: '0',
    customerNameSnapshot: 'Overdue Co',
  });
  return customer;
}

describe('runOverdueCustomerAlertJob (TASK-026)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  const asOf = new Date('2026-06-01T00:00:00.000Z');

  it('creates one OverdueCustomer notification for a customer with an overdue extract', async () => {
    await seedTestSettings();
    const customer = await createOverdueCustomer();

    const result = await runOverdueCustomerAlertJob(asOf);

    expect(result.alerted).toBe(1);
    const notifications = await NotificationModel.find({
      type: 'OverdueCustomer',
      entityType: 'Customer',
      entityId: String(customer._id),
    });
    expect(notifications).toHaveLength(1);
  });

  it('does not alert a customer with no overdue extract', async () => {
    await seedTestSettings();
    await CustomerModel.create({
      code: `CUST-${Math.random().toString(36).slice(2, 8)}`,
      companyName: 'Fine Co',
      active: true,
    });

    const result = await runOverdueCustomerAlertJob(asOf);

    expect(result.alerted).toBe(0);
  });

  it('is idempotent: running the job twice does not create duplicate notifications', async () => {
    await seedTestSettings();
    const customer = await createOverdueCustomer();

    await runOverdueCustomerAlertJob(asOf);
    const secondResult = await runOverdueCustomerAlertJob(asOf);

    expect(secondResult.alerted).toBe(0);
    const notifications = await NotificationModel.find({
      type: 'OverdueCustomer',
      entityType: 'Customer',
      entityId: String(customer._id),
    });
    expect(notifications).toHaveLength(1);
  });
});
