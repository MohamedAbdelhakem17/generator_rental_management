import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { resetTestDb, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { StatusChangeLogModel } from './status-change-log.model.js';
import { ACTIVE_CONTRACT_CHECKS, OPEN_MAINTENANCE_CHECKS } from './status-engine.types.js';
import { computeStatus, StatusEngineService } from './status-engine.service.js';

const specifications = { kva: 500, brand: 'Cummins', model: 'C500D5', serialNumber: 'SN-0001' };

async function createGenerator(overrides: Partial<{ manualStatus: 'Stopped' | null }> = {}) {
  return GeneratorModel.create({
    code: 'GEN-001',
    specifications,
    currentMeter: 0,
    location: '',
    normalFuelConsumption: 25,
    maintenanceCycleHours: 250,
    manualStatus: overrides.manualStatus ?? null,
    status: 'Available',
    commercialStatus: 'Unassigned',
  });
}

describe('computeStatus (Section 6.1 truth table)', () => {
  it.each([
    [null, false, false, 'Available', 'Unassigned'],
    [null, false, true, 'Under Maintenance', 'Unassigned'],
    [null, true, false, 'Rented', 'Assigned'],
    [null, true, true, 'Rented', 'Assigned'],
    ['Stopped', false, false, 'Stopped', 'Unassigned'],
    ['Stopped', true, false, 'Stopped', 'Assigned'],
    ['Stopped', false, true, 'Stopped', 'Unassigned'],
    ['Stopped', true, true, 'Stopped', 'Assigned'],
  ] as const)(
    'manualStatus=%s activeContract=%s openMaintenance=%s -> %s/%s',
    (manualStatus, activeContract, openMaintenance, expectedStatus, expectedCommercial) => {
      const result = computeStatus(manualStatus, activeContract, openMaintenance);
      expect(result.status).toBe(expectedStatus);
      expect(result.commercialStatus).toBe(expectedCommercial);
    },
  );
});

describe('StatusEngineService.recalculate (TASK-009)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
    ACTIVE_CONTRACT_CHECKS.length = 0;
    OPEN_MAINTENANCE_CHECKS.length = 0;
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('FR-001: is idempotent — a second call with no underlying change reports changed=false', async () => {
    const generator = await createGenerator();

    const first = await StatusEngineService.recalculate(String(generator._id), { triggeredBy: 'system' });
    expect(first.changed).toBe(false);
    expect(first.status).toBe('Available');

    const second = await StatusEngineService.recalculate(String(generator._id), { triggeredBy: 'system' });
    expect(second.changed).toBe(false);
    expect(second.status).toBe('Available');

    const logCount = await StatusChangeLogModel.countDocuments({ generatorId: generator._id });
    expect(logCount).toBe(0);
  });

  it('flips to Rented when an active-contract check reports true, and logs the transition', async () => {
    const generator = await createGenerator();
    ACTIVE_CONTRACT_CHECKS.push(async () => true);

    const result = await StatusEngineService.recalculate(String(generator._id), {
      reason: 'contract activated',
      triggeredBy: 'system',
    });

    expect(result.changed).toBe(true);
    expect(result.status).toBe('Rented');
    expect(result.commercialStatus).toBe('Assigned');

    const entries = await StatusChangeLogModel.find({ generatorId: generator._id });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ from: 'Available', to: 'Rented', reason: 'contract activated', triggeredBy: 'system' });
  });

  it('manual Stopped override wins even while an active-contract check reports true', async () => {
    const generator = await createGenerator({ manualStatus: 'Stopped' });
    await StatusEngineService.recalculate(String(generator._id), { triggeredBy: 'system' });
    ACTIVE_CONTRACT_CHECKS.push(async () => true);

    const result = await StatusEngineService.recalculate(String(generator._id), { triggeredBy: 'system' });

    expect(result.status).toBe('Stopped');
    expect(result.commercialStatus).toBe('Assigned');
  });

  it('throws NotFoundError for a missing or soft-deleted generator', async () => {
    const generator = await createGenerator();
    generator.isDeleted = true;
    await generator.save();

    await expect(StatusEngineService.recalculate(String(generator._id), { triggeredBy: 'system' })).rejects.toThrow(
      'Generator not found',
    );
  });
});
