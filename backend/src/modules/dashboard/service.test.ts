import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { resetTestDb, seedTestSettings, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { RentalContractModel } from '../contracts/contract.model.js';
import { CustomerModel } from '../customers/customer.model.js';
import { ExtractModel } from '../extracts/extract.model.js';
import { FuelAlertModel } from '../fuel-alert-engine/fuel-alert.model.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { MaintenanceAlertModel } from '../maintenance-schedule-engine/maintenance-alert.model.js';
import { OperationLogModel } from '../operations/operation-log.model.js';
import { ProjectModel } from '../projects/project.model.js';
import { DashboardService } from './service.js';

describe('DashboardService (TASK-027)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('returns a composed dashboard summary for the selected period', async () => {
    await seedTestSettings();
    const customer = await CustomerModel.create({
      code: 'C-001',
      companyName: 'Dash Customer',
      contactPerson: 'Jane',
      phone: '123',
      taxNumber: 'TAX-1',
      address: 'Cairo',
      active: true,
    });

    const project = await ProjectModel.create({
      code: 'P-001',
      name: 'Dashboard Project',
      customerId: customer._id,
      location: 'Cairo',
      siteManager: 'Manager',
      startDate: new Date('2026-01-01'),
      status: 'Active',
    });

    await GeneratorModel.create({
      code: 'GEN-001',
      specifications: { kva: 200, brand: 'CAT', model: 'G1', serialNumber: 'SN-001' },
      currentMeter: 100,
      normalFuelConsumption: 10,
      maintenanceCycleHours: 250,
      status: 'Available',
      commercialStatus: 'Unassigned',
    });

    await ExtractModel.create({
      number: 'EX-001',
      customerId: customer._id,
      projectId: project._id,
      contractIds: ['000000000000000000000001'],
      period: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
      lineItems: [{ type: 'rent', description: 'Monthly rent', amount: '250000.00' }],
      discounts: '0',
      vatRateSnapshot: 0.14,
      vat: '35000.00',
      totalBeforeVat: '250000.00',
      finalTotal: '250000.00',
      status: 'Approved',
      collectedAmount: '0',
      customerNameSnapshot: 'Dash Customer',
    });

    const result = await DashboardService.getSummary({
      from: new Date('2026-01-01'),
      to: new Date('2026-12-31'),
    });

    expect(result.financial.revenue).toBe('250000.00');
    expect(result.fleet.total).toBeGreaterThanOrEqual(1);
    expect(result.alerts).toBeDefined();
  });

  it('cross-checks alert counts and operating hours against their owning engines (Section 28)', async () => {
    await seedTestSettings();
    const customer = await CustomerModel.create({
      code: 'C-002',
      companyName: 'Cross-Check Customer',
      contactPerson: 'Jane',
      phone: '123',
      taxNumber: 'TAX-2',
      address: 'Cairo',
      active: true,
    });

    const project = await ProjectModel.create({
      code: 'P-002',
      name: 'Cross-Check Project',
      customerId: customer._id,
      location: 'Cairo',
      siteManager: 'Manager',
      startDate: new Date('2026-01-01'),
      status: 'Active',
    });

    const generator = await GeneratorModel.create({
      code: 'GEN-002',
      specifications: { kva: 200, brand: 'CAT', model: 'G1', serialNumber: 'SN-002' },
      currentMeter: 500,
      normalFuelConsumption: 10,
      maintenanceCycleHours: 250,
      status: 'Available',
      commercialStatus: 'Unassigned',
    });

    await OperationLogModel.create({
      date: new Date('2026-01-10'),
      projectId: project._id,
      generatorId: generator._id,
      startMeter: 500,
      endMeter: 508,
      operatingHours: 8,
      status: 'Active',
    });

    await MaintenanceAlertModel.create({
      generatorId: generator._id,
      level: 'Overdue',
      status: 'Open',
      dueAtMeter: 480,
      currentMeterAtCreation: 500,
    });

    await FuelAlertModel.create({
      generatorId: generator._id,
      severity: 'Critical',
      status: 'Open',
      triggeringFuelLogId: new Types.ObjectId(),
    });

    await RentalContractModel.create({
      number: 'RC-2026-001',
      customerId: customer._id,
      projectId: project._id,
      startDate: new Date('2025-12-01'),
      endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      status: 'Active',
      rentalMethod: 'monthly',
    });

    const result = await DashboardService.getSummary({
      from: new Date('2026-01-01'),
      to: new Date('2026-01-31'),
    });

    expect(result.operations.operatingHours).toBe('8.00');
    expect(result.alerts.maintenance).toBe(1);
    expect(result.alerts.abnormalFuel).toBe(1);
    expect(result.alerts.expiringContracts).toBe(1);
    expect(result.charts.topGeneratorsUtilization).toEqual([
      { generatorCode: 'GEN-002', utilization: 8 },
    ]);
  });

  it('does not throw when overdue-aging and profitability-batch aggregations run against real Decimal128 data (manual-QA repro)', async () => {
    // Regression guard for a manually-reported "GET /api/dashboard 500" — reproduced against a
    // real (non-in-memory) MongoDB instance with an overdue Extract + a Generator with an
    // OperationLog, the two aggregation paths (CustomerLedgerService.getOverdueSummaryForCustomers
    // and ProfitabilityEngineService.calculateBatch) most recently rewritten in this codebase.
    // Manual re-verification against the live backend/Atlas DB with this exact data shape
    // returned HTTP 200 with correct values, so this test locks that in rather than merely
    // asserting "no throw."
    await seedTestSettings();
    const customer = await CustomerModel.create({
      code: 'C-003',
      companyName: 'Overdue Customer',
      contactPerson: 'Sam',
      phone: '123',
      taxNumber: 'TAX-3',
      address: 'Cairo',
      active: true,
    });

    const project = await ProjectModel.create({
      code: 'P-003',
      name: 'Overdue Project',
      customerId: customer._id,
      location: 'Cairo',
      siteManager: 'Manager',
      startDate: new Date('2026-01-01'),
      status: 'Active',
    });

    const generator = await GeneratorModel.create({
      code: 'GEN-003',
      specifications: { kva: 200, brand: 'CAT', model: 'G1', serialNumber: 'SN-003' },
      currentMeter: 100,
      normalFuelConsumption: 10,
      maintenanceCycleHours: 250,
      status: 'Rented',
      commercialStatus: 'Assigned',
    });

    await OperationLogModel.create({
      date: new Date(),
      projectId: project._id,
      generatorId: generator._id,
      startMeter: 100,
      endMeter: 108,
      operatingHours: 8,
      status: 'Active',
    });

    const oldEnd = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const oldStart = new Date(oldEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
    await ExtractModel.create({
      number: 'EX-003',
      customerId: customer._id,
      projectId: project._id,
      contractIds: ['000000000000000000000002'],
      period: { start: oldStart, end: oldEnd },
      lineItems: [{ type: 'rent', description: 'Monthly rent', amount: '15000.00' }],
      discounts: '0',
      vatRateSnapshot: 0.14,
      vat: '2100.00',
      totalBeforeVat: '15000.00',
      finalTotal: '17100.00',
      status: 'Approved',
      collectedAmount: '0',
      customerNameSnapshot: 'Overdue Customer',
    });

    const result = await DashboardService.getSummary({
      from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      to: new Date(),
    });

    expect(result.financial.outstanding).toBe('17100.00');
    expect(result.alerts.overdueCustomers).toBe(1);
    expect(result.fleet.total).toBeGreaterThanOrEqual(1);
    expect(result.charts.topGeneratorsUtilization).toEqual([
      { generatorCode: 'GEN-003', utilization: 8 },
    ]);
    expect(result.charts.topGeneratorsProfitability).toEqual([
      { generatorCode: 'GEN-003', netProfit: '0.00' },
    ]);
  });
});
