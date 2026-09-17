import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { resetTestDb, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { runContractExpiryJob } from './expire-contracts.job.js';
import { RentalContractModel, type ContractStatus } from './contract.model.js';

let contractSeq = 0;

async function createContract(status: ContractStatus, endDate: Date, overrides: Record<string, unknown> = {}) {
  contractSeq += 1;
  return RentalContractModel.create({
    number: `CN-EXPIRE-TEST-${contractSeq}`,
    customerId: new Types.ObjectId(),
    projectId: new Types.ObjectId(),
    startDate: new Date('2026-01-01'),
    endDate,
    rentalMethod: 'monthly',
    status,
    ...overrides,
  });
}

function daysFromNow(days: number, base: Date = new Date()): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

describe('runContractExpiryJob (TASK-033 coverage: FR-006 retroactive Active -> Expired flip)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('transitions an Active contract past its endDate to Expired', async () => {
    const contract = await createContract('Active', daysFromNow(-1));

    const result = await runContractExpiryJob();

    expect(result.expired).toBe(1);
    const updated = await RentalContractModel.findById(contract._id);
    expect(updated?.status).toBe('Expired');
  });

  it('does not touch an Active contract not yet past its endDate', async () => {
    const contract = await createContract('Active', daysFromNow(5));

    const result = await runContractExpiryJob();

    expect(result.expired).toBe(0);
    const unchanged = await RentalContractModel.findById(contract._id);
    expect(unchanged?.status).toBe('Active');
  });

  it('does not touch a Cancelled contract even if its endDate has passed', async () => {
    const contract = await createContract('Cancelled', daysFromNow(-3), { cancelReason: 'no longer needed' });

    const result = await runContractExpiryJob();

    expect(result.expired).toBe(0);
    const unchanged = await RentalContractModel.findById(contract._id);
    expect(unchanged?.status).toBe('Cancelled');
  });

  it('is idempotent — running twice does not reprocess an already-Expired contract', async () => {
    await createContract('Active', daysFromNow(-2));

    const first = await runContractExpiryJob();
    const second = await runContractExpiryJob();

    expect(first.expired).toBe(1);
    expect(second.expired).toBe(0);
  });

  it('does not crash on a contract with a missing endDate', async () => {
    const contract = await createContract('Active', daysFromNow(-1));
    await RentalContractModel.collection.updateOne({ _id: contract._id }, { $unset: { endDate: '' } });

    await expect(runContractExpiryJob()).resolves.toEqual({ expired: 0 });
  });
});
