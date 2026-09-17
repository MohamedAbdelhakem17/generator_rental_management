/**
 * One-off performance benchmark: seeds ~500 generators and ~100,000 operational/financial
 * records into a throwaway MongoDB instance (mongodb-memory-server — no Docker available in
 * this environment) and measures the hot paths touched by the TASK-034 hardening pass:
 * ProfitabilityEngineService.calculateBatch(), DashboardService.getSummary(), and paginated
 * Generator/Extract list queries.
 *
 * Run via: `pnpm --filter backend exec tsx scripts/benchmark/seed-and-benchmark.ts`
 *
 * The database is entirely in-memory and is torn down at the end of the run — nothing is
 * persisted, no real dev/prod database is touched.
 */
import { performance } from 'node:perf_hooks';

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Types } from 'mongoose';

import { toDecimal128 } from '../../services/money.js';
import { CustomerModel } from '../../modules/customers/customer.model.js';
import { ProjectModel } from '../../modules/projects/project.model.js';
import { GeneratorModel } from '../../modules/generators/generator.model.js';
import { RentalContractModel } from '../../modules/contracts/contract.model.js';
import { ContractItemModel } from '../../modules/contracts/contract-item.model.js';
import { OperationLogModel } from '../../modules/operations/operation-log.model.js';
import { FuelLogModel } from '../../modules/fuel/fuel-log.model.js';
import { ExtractModel } from '../../modules/extracts/extract.model.js';
import { ExpenseModel } from '../../modules/expenses/expense.model.js';
import { SystemSettingModel, SINGLETON_KEY } from '../../modules/settings/systemSetting.model.js';
import { ProfitabilityEngineService } from '../../modules/profitability-engine/service.js';
import { DashboardService } from '../../modules/dashboard/service.js';
import { paginateQuery } from '../../services/pagination.js';

const GENERATOR_COUNT = 500;
const CUSTOMER_COUNT = 40;
const PROJECT_COUNT = 80;
const CONTRACT_COUNT = 500;
// Realistic proportions: operations logged ~daily per generator, fuel less frequently,
// extracts monthly per contract, expenses occasional — totalling ~100k records.
const OPERATION_LOG_COUNT = 60_000;
const FUEL_LOG_COUNT = 25_000;
const EXTRACT_COUNT = 10_000;
const EXPENSE_COUNT = 5_000;

const SLOW_QUERY_THRESHOLD_MS = 1500;

function randomOf<T>(arr: T[]): T {
  const item = arr[Math.floor(Math.random() * arr.length)];
  if (item === undefined) throw new Error('randomOf called on empty array');
  return item;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const elapsed = performance.now() - start;
  const flag = elapsed > SLOW_QUERY_THRESHOLD_MS ? '  <-- SLOW (>1.5s)' : '';
  console.log(`[benchmark] ${label}: ${elapsed.toFixed(1)}ms${flag}`);
  return result;
}

async function insertBatched<T>(
  label: string,
  total: number,
  batchSize: number,
  buildBatch: (batchIndex: number, size: number) => T[],
  insertMany: (docs: T[]) => Promise<unknown>,
): Promise<void> {
  const start = performance.now();
  let inserted = 0;
  let batchIndex = 0;
  while (inserted < total) {
    const size = Math.min(batchSize, total - inserted);
    const docs = buildBatch(batchIndex, size);
    await insertMany(docs);
    inserted += size;
    batchIndex += 1;
  }
  const elapsed = performance.now() - start;
  console.log(`[benchmark] seeded ${inserted} ${label} in ${elapsed.toFixed(0)}ms`);
}

async function main() {
  console.log('[benchmark] starting mongodb-memory-server (no Docker available in this sandbox)...');
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  console.log(`[benchmark] connected to in-memory MongoDB at ${mongod.getUri()}`);

  try {
    await SystemSettingModel.create({
      key: SINGLETON_KEY,
      vatRatePercent: '14',
      currency: 'EGP',
      fuelTolerancePercent: '15',
      fuelCriticalTolerancePercent: '30',
      overdueGracePeriodDays: 30,
    });

    console.log(`[benchmark] seeding ${GENERATOR_COUNT} generators, ${CUSTOMER_COUNT} customers, ${PROJECT_COUNT} projects, ${CONTRACT_COUNT} contracts, ~${OPERATION_LOG_COUNT + FUEL_LOG_COUNT + EXTRACT_COUNT + EXPENSE_COUNT} log/financial records...`);
    const seedStart = performance.now();

    const customers = await CustomerModel.insertMany(
      Array.from({ length: CUSTOMER_COUNT }, (_, i) => ({
        code: `CUST-${String(i + 1).padStart(4, '0')}`,
        companyName: `Benchmark Customer ${i + 1}`,
        contactPerson: 'Test Contact',
        phone: '0100000000',
        taxNumber: `TAX-${i + 1}`,
        address: 'Benchmark Address',
        active: true,
      })),
    );

    const projects = await ProjectModel.insertMany(
      Array.from({ length: PROJECT_COUNT }, (_, i) => ({
        code: `PRJ-${String(i + 1).padStart(4, '0')}`,
        name: `Benchmark Project ${i + 1}`,
        customerId: randomOf(customers)._id,
        location: 'Site',
        siteManager: 'Manager',
        startDate: daysAgo(180),
        endDate: null,
        status: 'Active',
      })),
    );

    const generators = await GeneratorModel.insertMany(
      Array.from({ length: GENERATOR_COUNT }, (_, i) => ({
        code: `GEN-${String(i + 1).padStart(4, '0')}`,
        specifications: {
          kva: 100 + (i % 20) * 10,
          brand: 'BenchmarkBrand',
          model: `Model-${i % 15}`,
          serialNumber: `SN-${i + 1}`,
        },
        currentMeter: 1000 + i,
        location: 'Warehouse',
        normalFuelConsumption: 12.5,
        maintenanceCycleHours: 250,
        status: 'Rented',
        commercialStatus: 'Assigned',
      })),
    );

    const contracts = await RentalContractModel.insertMany(
      Array.from({ length: CONTRACT_COUNT }, (_, i) => {
        const project = randomOf(projects);
        return {
          number: `CT-${String(i + 1).padStart(5, '0')}`,
          customerId: project.customerId,
          projectId: project._id,
          startDate: daysAgo(150),
          endDate: daysAgo(-30),
          rentalMethod: 'monthly',
          status: 'Active',
          insurance: { provider: '', policyNumber: '', amount: toDecimal128(0) },
          cancelReason: '',
        };
      }),
    );

    // Each contract carries one contract item pinning a generator (drives Profitability's
    // generator -> contract -> extract join).
    await ContractItemModel.insertMany(
      contracts.map((contract, i) => ({
        contractId: contract._id,
        generatorId: generators[i % generators.length]!._id,
        billingMethod: 'monthly',
        unitPrice: toDecimal128(50000),
      })),
    );

    await insertBatched(
      'operation logs',
      OPERATION_LOG_COUNT,
      2000,
      (batchIndex, size) =>
        Array.from({ length: size }, (_, j) => {
          const idx = batchIndex * 2000 + j;
          const generator = generators[idx % generators.length]!;
          const project = projects[idx % projects.length]!;
          return {
            date: daysAgo(idx % 150),
            projectId: project._id,
            generatorId: generator._id,
            startMeter: 1000,
            endMeter: 1020,
            operatingHours: 20,
            downtimeHours: 0,
            notes: '',
            status: 'Active',
            correctionOf: null,
            correctionReason: '',
          };
        }),
      (docs) => OperationLogModel.insertMany(docs),
    );

    await insertBatched(
      'fuel logs',
      FUEL_LOG_COUNT,
      2000,
      (batchIndex, size) =>
        Array.from({ length: size }, (_, j) => {
          const idx = batchIndex * 2000 + j;
          const generator = generators[idx % generators.length]!;
          const project = projects[idx % projects.length]!;
          return {
            date: daysAgo(idx % 150),
            generatorId: generator._id,
            projectId: project._id,
            liters: 50,
            pricePerLiter: toDecimal128(15),
            totalCost: toDecimal128(750),
            operatingHoursRef: 20,
            consumptionRate: 2.5,
          };
        }),
      (docs) => FuelLogModel.insertMany(docs),
    );

    await insertBatched(
      'extracts',
      EXTRACT_COUNT,
      1000,
      (batchIndex, size) =>
        Array.from({ length: size }, (_, j) => {
          const idx = batchIndex * 1000 + j;
          const contract = contracts[idx % contracts.length]!;
          return {
            number: `EXT-${String(idx + 1).padStart(6, '0')}`,
            customerId: contract.customerId,
            projectId: contract.projectId,
            contractIds: [contract._id],
            period: { start: daysAgo(60 + (idx % 30)), end: daysAgo(30 + (idx % 30)) },
            lineItems: [{ type: 'rent', description: 'Monthly rent', amount: toDecimal128(50000) }],
            discounts: toDecimal128(0),
            vatRateSnapshot: 0.14,
            vat: toDecimal128(7000),
            totalBeforeVat: toDecimal128(50000),
            finalTotal: toDecimal128(57000),
            status: idx % 3 === 0 ? 'Collected' : 'Approved',
            collectedAmount: idx % 3 === 0 ? toDecimal128(57000) : toDecimal128(0),
            cancelReason: '',
            customerNameSnapshot: 'Benchmark Customer',
          };
        }),
      (docs) => ExtractModel.insertMany(docs),
    );

    await insertBatched(
      'expenses',
      EXPENSE_COUNT,
      1000,
      (batchIndex, size) =>
        Array.from({ length: size }, (_, j) => {
          const idx = batchIndex * 1000 + j;
          const generator = generators[idx % generators.length]!;
          return {
            category: 'Maintenance',
            date: daysAgo(idx % 120),
            amount: toDecimal128(1000),
            generatorId: generator._id,
            projectId: null,
            description: 'Benchmark expense',
            allocatedFrom: null,
            status: 'Confirmed',
          };
        }),
      (docs) => ExpenseModel.insertMany(docs),
    );

    console.log(`[benchmark] seeding complete in ${(performance.now() - seedStart).toFixed(0)}ms`);
    console.log('');
    console.log('=== Benchmark results ===');

    const candidateIds = generators.slice(0, 20).map((g) => g._id.toString());
    await timed('ProfitabilityEngineService.calculateBatch (20 generators)', async () => {
      const result = await ProfitabilityEngineService.calculateBatch({
        generatorIds: candidateIds,
        from: daysAgo(365),
        to: new Date(),
      });
      console.log(`  -> returned ${result.size} generator results`);
      return result;
    });

    await timed('DashboardService.getSummary (full fleet, no filters)', () =>
      DashboardService.getSummary({}),
    );

    await timed('Paginated Generator list (page 1, 20/page)', () =>
      paginateQuery(
        GeneratorModel,
        {},
        { page: 1, limit: 20, sort: '-createdAt', allowedSortFields: ['createdAt'] },
      ),
    );

    await timed('Paginated Extract list (page 1, 20/page, status filter)', () =>
      paginateQuery(
        ExtractModel,
        { status: 'Approved' },
        { page: 1, limit: 20, sort: '-createdAt', allowedSortFields: ['createdAt'] },
      ),
    );

    console.log('');
    console.log('=== Query plan check (calculateBatch driving queries) ===');
    const explainResult: unknown = await ContractItemModel.find({
      generatorId: { $in: candidateIds.map((id) => new Types.ObjectId(id)) },
    }).explain('executionStats');
    const plan = (Array.isArray(explainResult) ? explainResult[0] : explainResult) as {
      executionStats?: {
        executionTimeMillis?: number;
        totalDocsExamined?: number;
        executionStages?: { stage?: string };
      };
    };
    console.log(
      `  ContractItem $in query: executionTimeMillis=${plan.executionStats?.executionTimeMillis}, totalDocsExamined=${plan.executionStats?.totalDocsExamined}, stage=${plan.executionStats?.executionStages?.stage}`,
    );
  } finally {
    console.log('');
    console.log('[benchmark] tearing down in-memory database...');
    await mongoose.disconnect();
    await mongod.stop();
    console.log('[benchmark] done — no data persisted.');
  }
}

main().catch((error) => {
  console.error('[benchmark] failed', error);
  process.exit(1);
});
