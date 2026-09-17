import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { resetTestDb, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { NotificationModel } from '../notification-engine/notification.model.js';
import { CONTRACT_EXPIRY_WINDOW_DAYS, runContractExpiryAlertJob } from './contract-expiry-alert.job.js';
import { RentalContractModel, type ContractStatus } from './contract.model.js';

let contractSeq = 0;

async function createContract(status: ContractStatus, endDate: Date, overrides: Record<string, unknown> = {}) {
  contractSeq += 1;
  return RentalContractModel.create({
    number: `CN-TEST-${contractSeq}`,
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

describe('runContractExpiryAlertJob (TASK-026)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('alerts for an Active contract expiring within the window', async () => {
    const contract = await createContract('Active', daysFromNow(3));

    const result = await runContractExpiryAlertJob();

    expect(result.alerted).toBe(1);
    const notification = await NotificationModel.findOne({ entityId: String(contract._id) });
    expect(notification).not.toBeNull();
    expect(notification?.type).toBe('ContractExpiry');
    expect(notification?.severity).toBe('warning');
  });

  it('does not alert for a contract expiring outside the window', async () => {
    await createContract('Active', daysFromNow(CONTRACT_EXPIRY_WINDOW_DAYS + 10));

    const result = await runContractExpiryAlertJob();

    expect(result.alerted).toBe(0);
    expect(await NotificationModel.countDocuments()).toBe(0);
  });

  it('does not alert for an already-expired contract', async () => {
    await createContract('Active', daysFromNow(-5));

    const result = await runContractExpiryAlertJob();

    expect(result.alerted).toBe(0);
  });

  it('does not alert for Cancelled/Draft contracts even within the window', async () => {
    await createContract('Cancelled', daysFromNow(2), { cancelReason: 'no longer needed' });
    await createContract('Draft', daysFromNow(2));

    const result = await runContractExpiryAlertJob();

    expect(result.alerted).toBe(0);
  });

  it('is idempotent — running twice does not create a duplicate notification', async () => {
    await createContract('Active', daysFromNow(1));

    const first = await runContractExpiryAlertJob();
    const second = await runContractExpiryAlertJob();

    expect(first.alerted).toBe(1);
    expect(second.alerted).toBe(0);
    expect(await NotificationModel.countDocuments()).toBe(1);
  });

  it('alerts exactly at the window boundary (endDate == now + window days)', async () => {
    const now = new Date();
    await createContract('Active', daysFromNow(CONTRACT_EXPIRY_WINDOW_DAYS, now));

    const result = await runContractExpiryAlertJob(now);

    expect(result.alerted).toBe(1);
  });

  it('does not alert exactly at now - 1 day (already past, handled by the expiry job instead)', async () => {
    const now = new Date();
    await createContract('Active', daysFromNow(-1, now));

    const result = await runContractExpiryAlertJob(now);

    expect(result.alerted).toBe(0);
  });

  it('skips a contract with a missing/invalid endDate without crashing', async () => {
    const contract = await createContract('Active', daysFromNow(2));
    await RentalContractModel.collection.updateOne({ _id: contract._id }, { $unset: { endDate: '' } });

    await expect(runContractExpiryAlertJob()).resolves.toEqual({ alerted: 0 });
  });
});
