import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { resetTestDb, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { ContractItemModel } from '../contracts/contract-item.model.js';
import { RentalContractModel, type ContractStatus } from '../contracts/contract.model.js';
import { ConflictEngineService } from './service.js';

async function createGenerator() {
  return GeneratorModel.create({
    code: `GEN-${Math.random().toString(36).slice(2, 8)}`,
    specifications: { kva: 500, brand: 'Cummins', model: 'C500D5', serialNumber: `SN-${Math.random()}` },
    currentMeter: 0,
    normalFuelConsumption: 25,
    maintenanceCycleHours: 250,
    status: 'Available',
    commercialStatus: 'Unassigned',
  });
}

async function createContract(
  generatorId: string,
  startDate: string,
  endDate: string,
  status: ContractStatus = 'Active',
) {
  const contract = await RentalContractModel.create({
    number: `CN-TEST-${Math.random().toString(36).slice(2, 8)}`,
    customerId: '000000000000000000000001',
    projectId: '000000000000000000000002',
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    rentalMethod: 'monthly',
    status,
    cancelReason: status === 'Cancelled' ? 'Test cancellation' : '',
  });
  await ContractItemModel.create({
    contractId: contract._id,
    generatorId,
    billingMethod: 'monthly',
    unitPrice: '15000',
  });
  return contract;
}

describe('ConflictEngineService (TASK-013)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('Section 24 truth table: fully-inside is a conflict', async () => {
    const generator = await createGenerator();
    await createContract(String(generator._id), '2026-01-01', '2026-01-31');

    const conflicts = await ConflictEngineService.checkGenerator(String(generator._id), new Date('2026-01-10'), new Date('2026-01-20'));
    expect(conflicts).toHaveLength(1);
  });

  it('Section 24 truth table: partial-overlap-start is a conflict', async () => {
    const generator = await createGenerator();
    await createContract(String(generator._id), '2026-01-10', '2026-01-31');

    const conflicts = await ConflictEngineService.checkGenerator(String(generator._id), new Date('2026-01-01'), new Date('2026-01-15'));
    expect(conflicts).toHaveLength(1);
  });

  it('Section 24 truth table: partial-overlap-end is a conflict', async () => {
    const generator = await createGenerator();
    await createContract(String(generator._id), '2026-01-01', '2026-01-20');

    const conflicts = await ConflictEngineService.checkGenerator(String(generator._id), new Date('2026-01-15'), new Date('2026-01-31'));
    expect(conflicts).toHaveLength(1);
  });

  it('Section 24 truth table: exact-match is a conflict', async () => {
    const generator = await createGenerator();
    await createContract(String(generator._id), '2026-01-01', '2026-01-31');

    const conflicts = await ConflictEngineService.checkGenerator(String(generator._id), new Date('2026-01-01'), new Date('2026-01-31'));
    expect(conflicts).toHaveLength(1);
  });

  it('Section 20 edge case: adjacent same-day boundary is a conflict (inclusive)', async () => {
    const generator = await createGenerator();
    await createContract(String(generator._id), '2026-01-01', '2026-01-15');

    const conflicts = await ConflictEngineService.checkGenerator(String(generator._id), new Date('2026-01-15'), new Date('2026-01-31'));
    expect(conflicts).toHaveLength(1);
  });

  it('Section 24 truth table: no-overlap is not a conflict', async () => {
    const generator = await createGenerator();
    await createContract(String(generator._id), '2026-01-01', '2026-01-10');

    const conflicts = await ConflictEngineService.checkGenerator(String(generator._id), new Date('2026-01-20'), new Date('2026-01-31'));
    expect(conflicts).toHaveLength(0);
  });

  it('FR-003: the excluded contract is ignored', async () => {
    const generator = await createGenerator();
    const existing = await createContract(String(generator._id), '2026-01-01', '2026-01-31');

    const conflicts = await ConflictEngineService.checkGenerator(String(generator._id), new Date('2026-01-01'), new Date('2026-01-31'), {
      excludeContractId: String(existing._id),
    });
    expect(conflicts).toHaveLength(0);
  });

  it('Section 20 edge case: Cancelled and Expired contracts never contribute conflicts', async () => {
    const generator = await createGenerator();
    await createContract(String(generator._id), '2026-01-01', '2026-01-31', 'Cancelled');
    await createContract(String(generator._id), '2026-01-01', '2026-01-31', 'Expired');

    const conflicts = await ConflictEngineService.checkGenerator(String(generator._id), new Date('2026-01-01'), new Date('2026-01-31'));
    expect(conflicts).toHaveLength(0);
  });

  it('FR-001: Draft contracts are excluded from the hard check but included in the soft (includeDraft) check', async () => {
    const generator = await createGenerator();
    await createContract(String(generator._id), '2026-01-01', '2026-01-31', 'Draft');

    const hard = await ConflictEngineService.checkGenerator(String(generator._id), new Date('2026-01-01'), new Date('2026-01-31'));
    expect(hard).toHaveLength(0);

    const soft = await ConflictEngineService.checkGenerator(String(generator._id), new Date('2026-01-01'), new Date('2026-01-31'), {
      includeDraft: true,
    });
    expect(soft).toHaveLength(1);
    expect(soft[0]!.status).toBe('Draft');
  });

  it('checkContract skips items with an approved Shared Assignment exception', async () => {
    const generator = await createGenerator();
    await createContract(String(generator._id), '2026-01-01', '2026-01-31');

    const newContract = await RentalContractModel.create({
      number: 'CN-TEST-NEW',
      customerId: '000000000000000000000001',
      projectId: '000000000000000000000002',
      startDate: new Date('2026-01-15'),
      endDate: new Date('2026-02-15'),
      rentalMethod: 'monthly',
      status: 'Draft',
    });
    const item = await ContractItemModel.create({
      contractId: newContract._id,
      generatorId: generator._id,
      billingMethod: 'monthly',
      unitPrice: '15000',
    });

    const beforeOverride = await ConflictEngineService.checkContract(String(newContract._id));
    expect(beforeOverride).toHaveLength(1);

    item.isSharedAssignmentException = true;
    item.sharedAssignmentJustification = 'Approved emergency shared use';
    await item.save();

    const afterOverride = await ConflictEngineService.checkContract(String(newContract._id));
    expect(afterOverride).toHaveLength(0);
  });
});
