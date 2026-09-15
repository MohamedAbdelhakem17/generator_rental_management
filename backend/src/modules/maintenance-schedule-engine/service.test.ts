import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { resetTestDb, seedTestSettings, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { MaintenanceModel } from '../maintenance/maintenance.model.js';
import { MaintenanceAlertModel } from './maintenance-alert.model.js';
import { MaintenanceScheduleEngineService } from './service.js';

async function createGenerator(currentMeter = 0) {
  return GeneratorModel.create({
    code: `GEN-${Math.random().toString(36).slice(2, 8)}`,
    specifications: { kva: 300, brand: 'Cummins', model: 'C300D5', serialNumber: `SN-${Math.random()}` },
    currentMeter,
    normalFuelConsumption: 10,
    maintenanceCycleHours: 250,
    status: 'Available',
    commercialStatus: 'Unassigned',
  });
}

async function createCompletedMaintenance(generatorId: string, nextMaintenanceMeter: number) {
  return MaintenanceModel.create({
    generatorId,
    type: 'Preventive',
    status: 'Completed',
    date: new Date('2026-01-01'),
    meter: nextMaintenanceMeter - 250,
    totalCost: '0',
    nextMaintenanceMeter,
  });
}

describe('MaintenanceScheduleEngineService (TASK-019)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('AC/FR-001: completing at meter 5000 with a 250-hour cycle sets nextMaintenanceMeter to 5250', async () => {
    const generator = await createGenerator(5000);
    const record = await MaintenanceModel.create({
      generatorId: generator._id,
      type: 'Preventive',
      status: 'In Progress',
      date: new Date('2026-01-01'),
      meter: 5000,
      totalCost: '0',
    });

    const next = await MaintenanceScheduleEngineService.computeNext(String(record._id));
    expect(next).toBe(5250);
  });

  it('no completed maintenance history: no alert is created', async () => {
    await seedTestSettings();
    const generator = await createGenerator(300);

    await MaintenanceScheduleEngineService.evaluateGenerator(String(generator._id));

    expect(await MaintenanceAlertModel.countDocuments({ generatorId: generator._id })).toBe(0);
  });

  it('below the buffer: no alert is created', async () => {
    await seedTestSettings();
    const generator = await createGenerator(5100); // dueAtMeter 5250, buffer 50 -> threshold 5200
    await createCompletedMaintenance(String(generator._id), 5250);

    await MaintenanceScheduleEngineService.evaluateGenerator(String(generator._id));

    expect(await MaintenanceAlertModel.countDocuments({ generatorId: generator._id })).toBe(0);
  });

  it('AC: within the buffer creates an Upcoming alert', async () => {
    await seedTestSettings();
    const generator = await createGenerator(5210); // within 50 of 5250
    await createCompletedMaintenance(String(generator._id), 5250);

    await MaintenanceScheduleEngineService.evaluateGenerator(String(generator._id));

    const alert = await MaintenanceAlertModel.findOne({ generatorId: generator._id });
    expect(alert).not.toBeNull();
    expect(alert!.level).toBe('Upcoming');
    expect(alert!.status).toBe('Open');
    expect(alert!.dueAtMeter).toBe(5250);
  });

  it('AC: meter at or past due creates an Overdue alert', async () => {
    await seedTestSettings();
    const generator = await createGenerator(5260);
    await createCompletedMaintenance(String(generator._id), 5250);

    await MaintenanceScheduleEngineService.evaluateGenerator(String(generator._id));

    const alert = await MaintenanceAlertModel.findOne({ generatorId: generator._id });
    expect(alert!.level).toBe('Overdue');
  });

  it('FR-003: an existing Upcoming alert upgrades to Overdue in place rather than duplicating', async () => {
    await seedTestSettings();
    const generator = await createGenerator(5210);
    await createCompletedMaintenance(String(generator._id), 5250);
    await MaintenanceScheduleEngineService.evaluateGenerator(String(generator._id));

    generator.currentMeter = 5260;
    await generator.save();
    await MaintenanceScheduleEngineService.evaluateGenerator(String(generator._id));

    const alerts = await MaintenanceAlertModel.find({ generatorId: generator._id });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.level).toBe('Overdue');
  });

  it('AC: opening a new Maintenance record for a generator with an open schedule alert auto-resolves it', async () => {
    await seedTestSettings();
    const generator = await createGenerator(5260);
    await createCompletedMaintenance(String(generator._id), 5250);
    await MaintenanceScheduleEngineService.evaluateGenerator(String(generator._id));

    const alert = await MaintenanceAlertModel.findOne({ generatorId: generator._id });
    await MaintenanceScheduleEngineService.autoResolveForGenerator(String(generator._id), '000000000000000000000001');

    const refreshed = await MaintenanceAlertModel.findById(alert!._id);
    expect(refreshed!.status).toBe('Resolved');
    expect(refreshed!.resolvedBy).toBe('system');
  });

  it('DoD: the partial unique index blocks a second concurrent Open/Acknowledged alert for the same generator', async () => {
    const generator = await createGenerator(5260);
    await MaintenanceAlertModel.create({ generatorId: generator._id, level: 'Overdue', dueAtMeter: 5250, currentMeterAtCreation: 5260 });

    await expect(
      MaintenanceAlertModel.create({ generatorId: generator._id, level: 'Upcoming', dueAtMeter: 5250, currentMeterAtCreation: 5260 }),
    ).rejects.toThrow();
  });
});
