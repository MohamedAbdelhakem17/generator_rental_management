import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { resetTestDb, seedTestSettings, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { CustomerModel } from '../customers/customer.model.js';
import { RentalContractModel } from '../contracts/contract.model.js';
import { ProjectModel } from '../projects/project.model.js';
import { ExtractModel } from './extract.model.js';
import { ExtractService } from './extract.service.js';

const ACTOR_ID = '000000000000000000000001';

async function createCustomer(overrides: Record<string, unknown> = {}) {
  return CustomerModel.create({
    code: `CUST-${Math.random().toString(36).slice(2, 8)}`,
    companyName: 'Acme Construction',
    ...overrides,
  });
}

async function createProject(customerId: string, overrides: Record<string, unknown> = {}) {
  return ProjectModel.create({
    code: `PROJ-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Site A',
    customerId,
    startDate: new Date('2026-01-01'),
    ...overrides,
  });
}

async function createContract(customerId: string, projectId: string, overrides: Record<string, unknown> = {}) {
  return RentalContractModel.create({
    number: `CN-TEST-${Math.random().toString(36).slice(2, 8)}`,
    customerId,
    projectId,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    rentalMethod: 'monthly',
    status: 'Active',
    ...overrides,
  });
}

describe('ExtractService (TASK-020)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('rejects a nonexistent customer/project with 422', async () => {
    const customer = await createCustomer();
    const project = await createProject(String(customer._id));
    const contract = await createContract(String(customer._id), String(project._id));

    try {
      await ExtractService.create(
        {
          customerId: '000000000000000000000099',
          projectId: String(project._id),
          contractIds: [String(contract._id)],
          period: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
          lineItems: [],
        },
        ACTOR_ID,
      );
      expect.unreachable('expected create to throw');
    } catch (caught) {
      const error = caught as { statusCode: number; errors: { field?: string; message: string }[] };
      expect(error.statusCode).toBe(422);
      expect(error.errors[0]!.field).toBe('customerId');
    }
  });

  it('rejects a contract that belongs to a different customer/project', async () => {
    const customer = await createCustomer();
    const project = await createProject(String(customer._id));
    const otherCustomer = await createCustomer({ code: `CUST-OTHER-${Date.now()}` });
    const otherProject = await createProject(String(otherCustomer._id));
    const foreignContract = await createContract(String(otherCustomer._id), String(otherProject._id));

    try {
      await ExtractService.create(
        {
          customerId: String(customer._id),
          projectId: String(project._id),
          contractIds: [String(foreignContract._id)],
          period: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
          lineItems: [],
        },
        ACTOR_ID,
      );
      expect.unreachable('expected create to throw');
    } catch (caught) {
      const error = caught as { statusCode: number; errors: { field?: string; message: string }[] };
      expect(error.statusCode).toBe(422);
      expect(error.errors[0]!.field).toBe('contractIds');
    }
  });

  it('AC/Section 16: rejects discounts exceeding total work with a 422 naming the max allowed', async () => {
    const customer = await createCustomer();
    const project = await createProject(String(customer._id));
    const contract = await createContract(String(customer._id), String(project._id));

    try {
      await ExtractService.create(
        {
          customerId: String(customer._id),
          projectId: String(project._id),
          contractIds: [String(contract._id)],
          period: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
          lineItems: [{ type: 'rent', description: 'Rent', amount: 1000 }],
          discounts: 1000.01,
        },
        ACTOR_ID,
      );
      expect.unreachable('expected create to throw');
    } catch (caught) {
      const error = caught as { statusCode: number; errors: { field?: string; message: string }[] };
      expect(error.statusCode).toBe(422);
      expect(error.errors[0]!.message).toContain('1000.00');
    }
  });

  it('Section 16: submit-review requires at least one line item', async () => {
    const customer = await createCustomer();
    const project = await createProject(String(customer._id));
    const contract = await createContract(String(customer._id), String(project._id));
    const extract = await ExtractService.create(
      {
        customerId: String(customer._id),
        projectId: String(project._id),
        contractIds: [String(contract._id)],
        period: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
        lineItems: [],
      },
      ACTOR_ID,
    );

    await expect(ExtractService.submitReview(String(extract._id), ACTOR_ID)).rejects.toThrow(
      /at least one line item/i,
    );
  });

  it('AC/DoD — Business Rule 6.7 worked example, verbatim: rent 100,000 + transport 10,000 + services 5,000, discount 15,000, VAT 14% -> VAT 14,000, finalTotal 114,000', async () => {
    await seedTestSettings();
    const customer = await createCustomer();
    const project = await createProject(String(customer._id));
    const contract = await createContract(String(customer._id), String(project._id));

    const extract = await ExtractService.create(
      {
        customerId: String(customer._id),
        projectId: String(project._id),
        contractIds: [String(contract._id)],
        period: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
        lineItems: [
          { type: 'rent', description: 'Rent', amount: 100000 },
          { type: 'transport', description: 'Transport', amount: 10000 },
          { type: 'services', description: 'Services', amount: 5000 },
        ],
        discounts: 15000,
      },
      ACTOR_ID,
    );

    await ExtractService.submitReview(String(extract._id), ACTOR_ID);
    const approved = await ExtractService.approve(String(extract._id), ACTOR_ID);

    expect(approved.status).toBe('Approved');
    expect(approved.vatRateSnapshot).toBe(0.14);
    expect(approved.totalBeforeVat!.toString()).toBe('100000.00');
    expect(approved.vat!.toString()).toBe('14000.00');
    expect(approved.finalTotal!.toString()).toBe('114000.00');
    expect(approved.customerNameSnapshot).toBe('Acme Construction');
  });

  it('Section 19: approve is rejected with 409 when there are zero line items', async () => {
    await seedTestSettings();
    const customer = await createCustomer();
    const project = await createProject(String(customer._id));
    const contract = await createContract(String(customer._id), String(project._id));
    const extract = await ExtractModel.create({
      number: 'EXT-TEST-0001',
      customerId: customer._id,
      projectId: project._id,
      contractIds: [contract._id],
      period: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
      status: 'Under Review',
    });

    await expect(ExtractService.approve(String(extract._id), ACTOR_ID)).rejects.toThrow(/no line items/i);
  });

  it('FR-002: an Approved extract can never be directly edited (409, directs to cancel/reissue)', async () => {
    await seedTestSettings();
    const customer = await createCustomer();
    const project = await createProject(String(customer._id));
    const contract = await createContract(String(customer._id), String(project._id));
    const extract = await ExtractService.create(
      {
        customerId: String(customer._id),
        projectId: String(project._id),
        contractIds: [String(contract._id)],
        period: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
        lineItems: [{ type: 'rent', description: 'Rent', amount: 1000 }],
      },
      ACTOR_ID,
    );
    await ExtractService.submitReview(String(extract._id), ACTOR_ID);
    await ExtractService.approve(String(extract._id), ACTOR_ID);

    await expect(ExtractService.update(String(extract._id), { discounts: 10 }, ACTOR_ID)).rejects.toThrow(
      /cancel and reissue/i,
    );
  });

  it('Section 20/Edge Case: cancel is blocked once collectedAmount > 0', async () => {
    await seedTestSettings();
    const customer = await createCustomer();
    const project = await createProject(String(customer._id));
    const contract = await createContract(String(customer._id), String(project._id));
    const extract = await ExtractService.create(
      {
        customerId: String(customer._id),
        projectId: String(project._id),
        contractIds: [String(contract._id)],
        period: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
        lineItems: [{ type: 'rent', description: 'Rent', amount: 1000 }],
      },
      ACTOR_ID,
    );
    await ExtractService.submitReview(String(extract._id), ACTOR_ID);
    await ExtractService.approve(String(extract._id), ACTOR_ID);

    await ExtractModel.updateOne({ _id: extract._id }, { collectedAmount: '500' });

    await expect(ExtractService.cancel(String(extract._id), { reason: 'test' }, ACTOR_ID)).rejects.toThrow(
      /credit note/i,
    );
  });

  it('a Draft extract with zero collectedAmount can be cancelled directly', async () => {
    const customer = await createCustomer();
    const project = await createProject(String(customer._id));
    const contract = await createContract(String(customer._id), String(project._id));
    const extract = await ExtractService.create(
      {
        customerId: String(customer._id),
        projectId: String(project._id),
        contractIds: [String(contract._id)],
        period: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
        lineItems: [],
      },
      ACTOR_ID,
    );

    const cancelled = await ExtractService.cancel(String(extract._id), { reason: 'No longer needed' }, ACTOR_ID);
    expect(cancelled.status).toBe('Cancelled');
    expect(cancelled.cancelReason).toBe('No longer needed');
  });
});
