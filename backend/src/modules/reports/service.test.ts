import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { resetTestDb, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { CustomerModel } from '../customers/customer.model.js';
import { ExtractModel } from '../extracts/extract.model.js';
import { FuelLogModel } from '../fuel/fuel-log.model.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { MaintenanceModel } from '../maintenance/maintenance.model.js';
import { OperationLogModel } from '../operations/operation-log.model.js';
import { ProjectModel } from '../projects/project.model.js';
import { ReportsService } from './service.js';

describe('ReportsService (TASK-028)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('returns paginated uncollected extracts with Decimal-safe balances', async () => {
    const customer = await CustomerModel.create({
      code: 'RPT-001',
      companyName: 'Report Customer',
    });

    await ExtractModel.create({
      number: 'EX-RPT-001',
      customerId: customer._id,
      projectId: '000000000000000000000001',
      contractIds: ['000000000000000000000001'],
      period: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
      lineItems: [{ type: 'rent', description: 'Rent', amount: '100.00' }],
      discounts: '0',
      vatRateSnapshot: 0.14,
      vat: '14.00',
      totalBeforeVat: '100.00',
      finalTotal: '100.00',
      status: 'Partially Collected',
      collectedAmount: '35.50',
      customerNameSnapshot: 'Report Customer',
    });

    const result = await ReportsService.uncollectedExtracts({
      from: new Date('2026-01-01'),
      to: new Date('2026-01-31'),
      page: 1,
      limit: 20,
    });

    expect(result.meta.total).toBe(1);
    expect(result.items[0]).toEqual({
      extractNumber: 'EX-RPT-001',
      customer: 'Report Customer',
      total: '100.00',
      collected: '35.50',
      remaining: '64.50',
      status: 'Partially Collected',
    });
  });

  it('resolves generator/project names instead of raw ids for operations, fuel, and maintenance reports', async () => {
    const customer = await CustomerModel.create({
      code: 'RPT-002',
      companyName: 'Report Customer 2',
    });
    const project = await ProjectModel.create({
      code: 'P-RPT-001',
      name: 'Report Project',
      customerId: customer._id,
      location: 'Cairo',
      siteManager: 'Manager',
      startDate: new Date('2026-01-01'),
      status: 'Active',
    });
    const generator = await GeneratorModel.create({
      code: 'GEN-RPT-001',
      specifications: { kva: 200, brand: 'CAT', model: 'G1', serialNumber: 'SN-RPT-001' },
      currentMeter: 100,
      normalFuelConsumption: 10,
      maintenanceCycleHours: 250,
      status: 'Available',
      commercialStatus: 'Unassigned',
    });

    await OperationLogModel.create({
      date: new Date('2026-01-05'),
      projectId: project._id,
      generatorId: generator._id,
      startMeter: 100,
      endMeter: 108,
      operatingHours: 8,
      status: 'Active',
    });

    await FuelLogModel.create({
      date: new Date('2026-01-05'),
      generatorId: generator._id,
      projectId: project._id,
      liters: 100,
      pricePerLiter: '5.00',
      totalCost: '500.00',
      consumptionRate: 12.5,
    });

    await MaintenanceModel.create({
      generatorId: generator._id,
      type: 'Preventive',
      status: 'Completed',
      date: new Date('2026-01-05'),
      meter: 105,
      partsCost: '100.00',
      oilCost: '50.00',
      laborCost: '200.00',
      transportCost: '30.00',
      totalCost: '380.00',
    });

    const operations = await ReportsService.operations({ page: 1, limit: 20 });
    expect(operations.items[0]).toMatchObject({ generator: 'GEN-RPT-001', project: 'P-RPT-001 — Report Project' });

    const fuel = await ReportsService.fuelConsumption({ page: 1, limit: 20 });
    expect(fuel.items[0]).toMatchObject({ generator: 'GEN-RPT-001', variancePercent: 25 });

    const maintenance = await ReportsService.maintenance({ page: 1, limit: 20 });
    expect(maintenance.items[0]).toMatchObject({ generator: 'GEN-RPT-001', type: 'Preventive' });
  });
});
