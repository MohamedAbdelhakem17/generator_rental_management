import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { resetTestDb, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { CustomerModel } from '../customers/customer.model.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { ProjectModel } from '../projects/project.model.js';
import { ExpenseModel } from './expense.model.js';
import { ExpenseService } from './expense.service.js';

async function createCustomer() {
  return CustomerModel.create({
    code: `CUST-${Math.random().toString(36).slice(2, 8)}`,
    companyName: 'Expense Customer',
  });
}

async function createProject(customerId: string) {
  return ProjectModel.create({
    code: `PRJ-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Expense Project',
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

describe('ExpenseService (TASK-024)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('allocates an unallocated expense across two generators in a 60/40 split', async () => {
    const customer = await createCustomer();
    const project = await createProject(String(customer._id));
    const firstGenerator = await createGenerator();
    const secondGenerator = await createGenerator();

    const parent = await ExpenseModel.create({
      category: 'Transport',
      date: new Date('2026-03-01'),
      amount: '10000.00',
      projectId: project._id,
      description: 'Fleet shuttle',
      status: 'Confirmed',
    });

    const actorUserId = new Types.ObjectId().toString();

    await ExpenseService.allocate(
      String(parent._id),
      {
        splits: [
          { generatorId: String(firstGenerator._id), percentage: 60 },
          { generatorId: String(secondGenerator._id), percentage: 40 },
        ],
      },
      actorUserId,
    );

    const children = await ExpenseModel.find({ allocatedFrom: parent._id }).sort({ amount: 1 });
    expect(children).toHaveLength(2);
    expect(children.map((child) => child.amount.toString())).toEqual(['4000.00', '6000.00']);
    expect(children.every((child) => String(child.allocatedFrom) === String(parent._id))).toBe(
      true,
    );
  });

  it('rejects allocations whose percentages do not total 100%', async () => {
    const customer = await createCustomer();
    const project = await createProject(String(customer._id));
    const firstGenerator = await createGenerator();

    const parent = await ExpenseModel.create({
      category: 'Transport',
      date: new Date('2026-03-01'),
      amount: '10000.00',
      projectId: project._id,
      description: 'Fleet shuttle',
      status: 'Confirmed',
    });

    const actorUserId = new Types.ObjectId().toString();

    await expect(
      ExpenseService.allocate(
        String(parent._id),
        {
          splits: [
            { generatorId: String(firstGenerator._id), percentage: 60 },
            { generatorId: String(firstGenerator._id), percentage: 30 },
          ],
        },
        actorUserId,
      ),
    ).rejects.toThrow('Validation failed');
  });
});
