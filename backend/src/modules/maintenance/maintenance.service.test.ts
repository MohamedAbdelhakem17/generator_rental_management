import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { resetTestDb, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { MaintenanceModel } from './maintenance.model.js';
import './maintenance.registrations.js';
import { MaintenanceService } from './maintenance.service.js';

async function createGenerator(overrides: Partial<{ currentMeter: number; maintenanceCycleHours: number }> = {}) {
  return GeneratorModel.create({
    code: `GEN-${Math.random().toString(36).slice(2, 8)}`,
    specifications: { kva: 300, brand: 'Cummins', model: 'C300D5', serialNumber: `SN-${Math.random()}` },
    currentMeter: overrides.currentMeter ?? 0,
    normalFuelConsumption: 10,
    maintenanceCycleHours: overrides.maintenanceCycleHours ?? 250,
    status: 'Available',
    commercialStatus: 'Unassigned',
  });
}

describe('MaintenanceService (TASK-018)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('FR-001/AC: totalCost = parts + oil + labor + transport', async () => {
    const generator = await createGenerator();
    const record = await MaintenanceService.open(
      {
        generatorId: String(generator._id),
        type: 'Preventive',
        date: new Date('2026-01-01'),
        meter: 100,
        partsCost: 1000,
        oilCost: 200,
        laborCost: 500,
        transportCost: 300,
      },
      '000000000000000000000001',
      'System Admin',
    );

    expect(record.totalCost.toString()).toBe('2000.00');
  });

  it('FR-002/AC: a second Open attempt for the same generator is rejected with 409 referencing the existing record', async () => {
    const generator = await createGenerator();
    const first = await MaintenanceService.open(
      { generatorId: String(generator._id), type: 'Preventive', date: new Date('2026-01-01'), meter: 100 },
      '000000000000000000000001',
      'System Admin',
    );

    try {
      await MaintenanceService.open(
        { generatorId: String(generator._id), type: 'Corrective', date: new Date('2026-01-02'), meter: 110 },
        '000000000000000000000001',
        'System Admin',
      );
      expect.unreachable('expected a second Open attempt to throw');
    } catch (caught) {
      const error = caught as { statusCode: number; errors: { field?: string; message: string }[] };
      expect(error.statusCode).toBe(409);
      expect(error.errors[0]!.message).toContain(String(first._id));
    }
  });

  it('a new Open record can be created once the previous one is Cancelled', async () => {
    const generator = await createGenerator();
    const first = await MaintenanceService.open(
      { generatorId: String(generator._id), type: 'Preventive', date: new Date('2026-01-01'), meter: 100 },
      '000000000000000000000001',
      'System Admin',
    );
    await MaintenanceService.cancel(String(first._id), { reason: 'Not needed' }, '000000000000000000000001');

    const second = await MaintenanceService.open(
      { generatorId: String(generator._id), type: 'Preventive', date: new Date('2026-01-05'), meter: 120 },
      '000000000000000000000001',
      'System Admin',
    );
    expect(second.status).toBe('Open');
  });

  it('AC: completing at meter 5000 with a 250-hour cycle sets nextMaintenanceMeter to 5250', async () => {
    const generator = await createGenerator({ currentMeter: 5000, maintenanceCycleHours: 250 });
    const record = await MaintenanceService.open(
      { generatorId: String(generator._id), type: 'Preventive', date: new Date('2026-01-01'), meter: 5000 },
      '000000000000000000000001',
      'System Admin',
    );

    const completed = await MaintenanceService.complete(String(record._id), '000000000000000000000001');
    expect(completed.nextMaintenanceMeter).toBe(5250);
    expect(completed.status).toBe('Completed');
  });

  it('a maintenanceCycleOverride replaces the generator default cycle', async () => {
    const generator = await createGenerator({ currentMeter: 5000, maintenanceCycleHours: 250 });
    const record = await MaintenanceService.open(
      {
        generatorId: String(generator._id),
        type: 'Preventive',
        date: new Date('2026-01-01'),
        meter: 5000,
        maintenanceCycleOverride: 100,
      },
      '000000000000000000000001',
      'System Admin',
    );

    const completed = await MaintenanceService.complete(String(record._id), '000000000000000000000001');
    expect(completed.nextMaintenanceMeter).toBe(5100);
  });

  it('Edge Case: cancelling an In Progress record does not compute a nextMaintenanceMeter', async () => {
    const generator = await createGenerator({ currentMeter: 5000 });
    const record = await MaintenanceService.open(
      { generatorId: String(generator._id), type: 'Preventive', date: new Date('2026-01-01'), meter: 5000 },
      '000000000000000000000001',
      'System Admin',
    );
    await MaintenanceService.start(String(record._id), '000000000000000000000001', 'System Admin');

    const cancelled = await MaintenanceService.cancel(String(record._id), { reason: 'Wrong part ordered' }, '000000000000000000000001');
    expect(cancelled.status).toBe('Cancelled');
    expect(cancelled.nextMaintenanceMeter).toBeNull();
    expect(cancelled.cancelReason).toBe('Wrong part ordered');
  });

  it('FR-003: opening a record recalculates the generator to Under Maintenance', async () => {
    const generator = await createGenerator();
    await MaintenanceService.open(
      { generatorId: String(generator._id), type: 'Preventive', date: new Date('2026-01-01'), meter: 0 },
      '000000000000000000000001',
      'System Admin',
    );

    const refreshed = await GeneratorModel.findById(generator._id);
    expect(refreshed!.status).toBe('Under Maintenance');
  });

  it('FR-004: completing a record recalculates the generator back to Available', async () => {
    const generator = await createGenerator();
    const record = await MaintenanceService.open(
      { generatorId: String(generator._id), type: 'Preventive', date: new Date('2026-01-01'), meter: 0 },
      '000000000000000000000001',
      'System Admin',
    );
    await MaintenanceService.complete(String(record._id), '000000000000000000000001');

    const refreshed = await GeneratorModel.findById(generator._id);
    expect(refreshed!.status).toBe('Available');
  });

  it('rejects a meter below the generator current meter', async () => {
    const generator = await createGenerator({ currentMeter: 500 });
    try {
      await MaintenanceService.open(
        { generatorId: String(generator._id), type: 'Preventive', date: new Date('2026-01-01'), meter: 100 },
        '000000000000000000000001',
        'System Admin',
      );
      expect.unreachable('expected a below-current-meter Open attempt to throw');
    } catch (caught) {
      const error = caught as { statusCode: number; errors: { field?: string; message: string }[] };
      expect(error.statusCode).toBe(422);
      expect(error.errors[0]!.message).toContain('current meter');
    }
  });

  it('DoD: the partial unique index blocks a second concurrent Open/In Progress record at the DB level', async () => {
    const generator = await createGenerator();
    await MaintenanceModel.create({
      generatorId: generator._id,
      type: 'Preventive',
      date: new Date('2026-01-01'),
      meter: 0,
      totalCost: '0',
    });

    await expect(
      MaintenanceModel.create({
        generatorId: generator._id,
        type: 'Corrective',
        status: 'In Progress',
        date: new Date('2026-01-02'),
        meter: 10,
        totalCost: '0',
      }),
    ).rejects.toThrow();
  });
});
