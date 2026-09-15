import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { resetTestDb, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { FuelLogModel } from '../fuel/fuel-log.model.js';
import { SINGLETON_KEY, SystemSettingModel } from '../settings/systemSetting.model.js';
import { FuelAlertModel } from './fuel-alert.model.js';
import { FuelAlertEngineService } from './service.js';

async function seedSettings() {
  await SystemSettingModel.create({
    key: SINGLETON_KEY,
    vatRatePercent: '14',
    currency: 'EGP',
    fuelTolerancePercent: '15',
    fuelCriticalTolerancePercent: '30',
  });
}

async function createGenerator(normalFuelConsumption = 10) {
  return GeneratorModel.create({
    code: `GEN-${Math.random().toString(36).slice(2, 8)}`,
    specifications: { kva: 300, brand: 'Cummins', model: 'C300D5', serialNumber: `SN-${Math.random()}` },
    currentMeter: 0,
    normalFuelConsumption,
    maintenanceCycleHours: 250,
    status: 'Available',
    commercialStatus: 'Unassigned',
  });
}

async function createFuelLog(generatorId: string, consumptionRate: number | null) {
  return FuelLogModel.create({
    date: new Date(),
    generatorId,
    projectId: '000000000000000000000001',
    liters: 100,
    pricePerLiter: '10',
    totalCost: '1000',
    operatingHoursRef: consumptionRate === null ? null : 10,
    consumptionRate,
  });
}

describe('FuelAlertEngineService.evaluate (TASK-017)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('within tolerance: no alert is created', async () => {
    await seedSettings();
    const generator = await createGenerator(10);
    const log = await createFuelLog(String(generator._id), 11); // +10%, within 15% warning band

    await FuelAlertEngineService.evaluate(String(log._id));

    expect(await FuelAlertModel.countDocuments({ generatorId: generator._id })).toBe(0);
  });

  it('AC: 20% above normal creates a Warning alert', async () => {
    await seedSettings();
    const generator = await createGenerator(10);
    const log = await createFuelLog(String(generator._id), 12); // +20%

    await FuelAlertEngineService.evaluate(String(log._id));

    const alert = await FuelAlertModel.findOne({ generatorId: generator._id });
    expect(alert).not.toBeNull();
    expect(alert!.severity).toBe('Warning');
    expect(alert!.status).toBe('Open');
    expect(alert!.occurrenceCount).toBe(1);
  });

  it('above 30% creates a Critical alert', async () => {
    await seedSettings();
    const generator = await createGenerator(10);
    const log = await createFuelLog(String(generator._id), 14); // +40%

    await FuelAlertEngineService.evaluate(String(log._id));

    const alert = await FuelAlertModel.findOne({ generatorId: generator._id });
    expect(alert!.severity).toBe('Critical');
  });

  it('Edge Case/FR-002: rapid repeated abnormal readings update the existing alert rather than creating a duplicate', async () => {
    await seedSettings();
    const generator = await createGenerator(10);

    const log1 = await createFuelLog(String(generator._id), 12);
    await FuelAlertEngineService.evaluate(String(log1._id));
    const log2 = await createFuelLog(String(generator._id), 13);
    await FuelAlertEngineService.evaluate(String(log2._id));

    expect(await FuelAlertModel.countDocuments({ generatorId: generator._id })).toBe(1);
    const alert = await FuelAlertModel.findOne({ generatorId: generator._id });
    expect(alert!.occurrenceCount).toBe(2);
    expect(String(alert!.triggeringFuelLogId)).toBe(String(log2._id));
  });

  it('FR-003: the next reading within tolerance auto-resolves the alert with the standard note', async () => {
    await seedSettings();
    const generator = await createGenerator(10);

    const abnormal = await createFuelLog(String(generator._id), 12);
    await FuelAlertEngineService.evaluate(String(abnormal._id));

    const normal = await createFuelLog(String(generator._id), 10.5);
    await FuelAlertEngineService.evaluate(String(normal._id));

    const alert = await FuelAlertModel.findOne({ generatorId: generator._id });
    expect(alert!.status).toBe('Resolved');
    expect(alert!.resolutionNote).toBe('auto-resolved: consumption returned to normal range');
    expect(alert!.resolvedBy).toBe('system');
  });

  it('Section 20 edge case: a new abnormal reading after a resolved alert creates a fresh alert, not reopening the old one', async () => {
    await seedSettings();
    const generator = await createGenerator(10);

    const first = await createFuelLog(String(generator._id), 12);
    await FuelAlertEngineService.evaluate(String(first._id));
    const back = await createFuelLog(String(generator._id), 10);
    await FuelAlertEngineService.evaluate(String(back._id));
    const second = await createFuelLog(String(generator._id), 13);
    await FuelAlertEngineService.evaluate(String(second._id));

    const alerts = await FuelAlertModel.find({ generatorId: generator._id }).sort({ createdAt: 1 });
    expect(alerts).toHaveLength(2);
    expect(alerts[0]!.status).toBe('Resolved');
    expect(alerts[1]!.status).toBe('Open');
  });

  it('a null consumptionRate (no operating hours) is skipped entirely', async () => {
    await seedSettings();
    const generator = await createGenerator(10);
    const log = await createFuelLog(String(generator._id), null);

    await FuelAlertEngineService.evaluate(String(log._id));

    expect(await FuelAlertModel.countDocuments({ generatorId: generator._id })).toBe(0);
  });

  it('DoD: the partial unique index blocks a second concurrent Open alert for the same generator', async () => {
    const generator = await createGenerator(10);
    const log1 = await FuelLogModel.create({
      date: new Date(),
      generatorId: generator._id,
      projectId: '000000000000000000000001',
      liters: 100,
      pricePerLiter: '10',
      totalCost: '1000',
      operatingHoursRef: 10,
      consumptionRate: 12,
    });
    await FuelAlertModel.create({ generatorId: generator._id, severity: 'Warning', triggeringFuelLogId: log1._id });

    await expect(
      FuelAlertModel.create({ generatorId: generator._id, severity: 'Warning', triggeringFuelLogId: log1._id }),
    ).rejects.toThrow();
  });
});
