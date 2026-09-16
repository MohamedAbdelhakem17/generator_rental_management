import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { resetTestDb, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { ContractItemModel } from '../contracts/contract-item.model.js';
import { RentalContractModel } from '../contracts/contract.model.js';
import { CustomerModel } from '../customers/customer.model.js';
import { ExpenseModel } from '../expenses/expense.model.js';
import { ExtractModel } from '../extracts/extract.model.js';
import { FuelLogModel } from '../fuel/fuel-log.model.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { MaintenanceModel } from '../maintenance/maintenance.model.js';
import { ProjectModel } from '../projects/project.model.js';
import { ProfitabilityEngineService } from './service.js';

async function createCustomer() {
  return CustomerModel.create({
    code: `CUST-${Math.random().toString(36).slice(2, 8)}`,
    companyName: 'Profitability Customer',
  });
}

async function createProject(customerId: string) {
  return ProjectModel.create({
    code: `PRJ-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Profitability Project',
    customerId,
    location: 'Cairo',
    siteManager: 'Manager',
    startDate: new Date('2026-01-01'),
    status: 'Active',
  });
}

async function createGenerator() {
  return GeneratorModel.create({
    code: `GEN-${Math.random().toString(36).slice(2, 8)}`,
    specifications: {
      kva: 100,
      brand: 'CAT',
      model: '400',
      serialNumber: `SN-${Math.random().toString(36).slice(2, 8)}`,
    },
    currentMeter: 1000,
    location: 'Cairo',
    normalFuelConsumption: 6,
    maintenanceCycleHours: 250,
    status: 'Available',
    commercialStatus: 'Unassigned',
  });
}

describe('ProfitabilityEngineService.calculate (TASK-025)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('adds revenue and cost buckets correctly for a generator in a period', async () => {
    const customer = await createCustomer();
    const project = await createProject(String(customer._id));
    const generator = await createGenerator();

    const contract = await RentalContractModel.create({
      number: 'CT-2026-0001',
      customerId: customer._id,
      projectId: project._id,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      rentalMethod: 'monthly',
      status: 'Active',
      insurance: { provider: 'AIG', policyNumber: 'POL-1', amount: '5000.00' },
    });

    await ContractItemModel.create({
      contractId: contract._id,
      generatorId: generator._id,
      billingMethod: 'monthly',
      unitPrice: '1500.00',
      priceSnapshot: '1500.00',
      isSharedAssignmentException: false,
      sharedAssignmentJustification: '',
    });

    await ExtractModel.create({
      number: 'EX-2026-0001',
      customerId: customer._id,
      projectId: project._id,
      contractIds: [contract._id],
      period: { start: new Date('2026-01-01'), end: new Date('2026-01-31') },
      lineItems: [{ type: 'rent', description: 'Rent', amount: '250000.00' }],
      discounts: '0',
      vatRateSnapshot: 0.14,
      vat: '35000.00',
      totalBeforeVat: '250000.00',
      finalTotal: '250000.00',
      status: 'Approved',
      collectedAmount: '0',
      customerNameSnapshot: 'Profitability Customer',
    });

    await FuelLogModel.create({
      date: new Date('2026-02-01'),
      generatorId: generator._id,
      projectId: project._id,
      liters: 100,
      pricePerLiter: '40.00',
      totalCost: '4000.00',
      operatingHoursRef: null,
      consumptionRate: null,
    });

    await MaintenanceModel.create({
      generatorId: generator._id,
      type: 'Preventive',
      status: 'Completed',
      date: new Date('2026-02-15'),
      meter: 1500,
      partsCost: '6000.00',
      oilCost: '1000.00',
      laborCost: '7000.00',
      transportCost: '2000.00',
      totalCost: '16000.00',
      maintenanceCycleOverride: null,
      nextMaintenanceMeter: null,
      notes: 'Routine service',
      cancelReason: '',
    });

    await ExpenseModel.create({
      category: 'Transport',
      date: new Date('2026-03-01'),
      amount: '5000.00',
      generatorId: generator._id,
      projectId: project._id,
      description: 'Transport cost',
      status: 'Confirmed',
    });

    const result = await ProfitabilityEngineService.calculate({
      generatorId: String(generator._id),
      from: new Date('2026-01-01'),
      to: new Date('2026-12-31'),
    });

    expect(result.revenue).toBe('250000.00');
    expect(result.cost.fuel).toBe('4000.00');
    expect(result.cost.maintenance).toBe('16000.00');
    expect(result.cost.transport).toBe('5000.00');
    expect(result.cost.labor).toBe('0.00');
    expect(result.cost.parts).toBe('0.00');
    expect(result.netProfit).toBe('225000.00');
  });
});
