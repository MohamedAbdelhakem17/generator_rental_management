import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { resetTestDb, seedTestSettings, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { CustomerModel } from '../customers/customer.model.js';
import { ExtractModel } from '../extracts/extract.model.js';
import { ProjectModel } from '../projects/project.model.js';
import { ReceiptService } from './receipt.service.js';

const ACTOR_ID = '000000000000000000000001';

async function createCustomer() {
  return CustomerModel.create({
    code: `CUST-${Math.random().toString(36).slice(2, 8)}`,
    companyName: 'Acme Construction',
  });
}

async function createProject(customerId: string) {
  return ProjectModel.create({
    code: `PROJ-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Site A',
    customerId,
    startDate: new Date('2026-01-01'),
  });
}

describe('ReceiptService (TASK-022)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('creates a partial receipt and marks the extract as Partially Collected', async () => {
    await seedTestSettings();
    const customer = await createCustomer();
    const project = await createProject(String(customer._id));
    const contractId = new mongoose.Types.ObjectId();
    const extract = await ExtractModel.create({
      number: 'EXT-2026-0001',
      customerId: customer._id,
      projectId: project._id,
      contractIds: [contractId],
      period: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
      lineItems: [{ type: 'rent', description: 'Rent', amount: '114000.00' }],
      discounts: '0',
      vatRateSnapshot: 0.14,
      vat: '15960.00',
      totalBeforeVat: '114000.00',
      finalTotal: '114000.00',
      status: 'Approved',
      collectedAmount: '0',
      customerNameSnapshot: 'Acme Construction',
    });

    const receipt = await ReceiptService.create(
      {
        customerId: String(customer._id),
        date: new Date('2026-02-01'),
        amount: 50000,
        paymentMethod: 'BankTransfer',
        account: '0001',
        transferNumber: 'TR-001',
        allocations: [{ extractId: String(extract._id), amount: 50000 }],
      },
      ACTOR_ID,
    );

    expect(receipt.amount.toString()).toBe('50000.00');

    const updated = await ExtractModel.findById(extract._id);
    expect(updated!.status).toBe('Partially Collected');
    expect(updated!.collectedAmount.toString()).toBe('50000.00');
  });

  it('rejects an allocation that exceeds the extract remaining balance', async () => {
    const customer = await createCustomer();
    const project = await createProject(String(customer._id));
    const contractId = new mongoose.Types.ObjectId();
    const extract = await ExtractModel.create({
      number: 'EXT-2026-0002',
      customerId: customer._id,
      projectId: project._id,
      contractIds: [contractId],
      period: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
      lineItems: [{ type: 'rent', description: 'Rent', amount: '114000.00' }],
      discounts: '0',
      vatRateSnapshot: 0.14,
      vat: '15960.00',
      totalBeforeVat: '114000.00',
      finalTotal: '114000.00',
      status: 'Approved',
      collectedAmount: '50000',
      customerNameSnapshot: 'Acme Construction',
    });

    await expect(
      ReceiptService.create(
        {
          customerId: String(customer._id),
          date: new Date('2026-02-02'),
          amount: 70000,
          paymentMethod: 'Cash',
          account: '',
          transferNumber: '',
          allocations: [{ extractId: String(extract._id), amount: 70000 }],
        },
        ACTOR_ID,
      ),
    ).rejects.toThrow(/remaining balance/i);
  });

  it('reverses the allocation when a receipt is cancelled', async () => {
    const customer = await createCustomer();
    const project = await createProject(String(customer._id));
    const contractId = new mongoose.Types.ObjectId();
    const extract = await ExtractModel.create({
      number: 'EXT-2026-0003',
      customerId: customer._id,
      projectId: project._id,
      contractIds: [contractId],
      period: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
      lineItems: [{ type: 'rent', description: 'Rent', amount: '114000.00' }],
      discounts: '0',
      vatRateSnapshot: 0.14,
      vat: '15960.00',
      totalBeforeVat: '114000.00',
      finalTotal: '114000.00',
      status: 'Approved',
      collectedAmount: '0',
      customerNameSnapshot: 'Acme Construction',
    });

    const receipt = await ReceiptService.create(
      {
        customerId: String(customer._id),
        date: new Date('2026-02-03'),
        amount: 50000,
        paymentMethod: 'Card',
        account: '',
        transferNumber: '',
        allocations: [{ extractId: String(extract._id), amount: 50000 }],
      },
      ACTOR_ID,
    );

    await ReceiptService.cancel(
      String(receipt._id),
      { reason: 'Duplicate payment reversed' },
      ACTOR_ID,
    );

    const updated = await ExtractModel.findById(extract._id);
    expect(updated!.status).toBe('Approved');
    expect(updated!.collectedAmount.toString()).toBe('0.00');
  });
});
