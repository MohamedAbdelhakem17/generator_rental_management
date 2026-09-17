import { Decimal } from 'decimal.js';

import { toDecimal, toDisplayString } from '../../services/money.js';
import { ValidationError } from '../../utils/AppError.js';
import { ContractItemModel } from '../contracts/contract-item.model.js';
import { ExpenseModel } from '../expenses/expense.model.js';
import { ExtractModel } from '../extracts/extract.model.js';
import { FuelLogModel } from '../fuel/fuel-log.model.js';
import { MaintenanceModel } from '../maintenance/maintenance.model.js';
import { ProjectModel } from '../projects/project.model.js';

export interface ProfitabilityQuery {
  generatorId?: string;
  projectId?: string;
  customerId?: string;
  from: Date;
  to: Date;
}

export interface ProfitabilityCostBreakdown {
  fuel: string;
  maintenance: string;
  transport: string;
  labor: string;
  parts: string;
}

export interface ProfitabilityResult {
  revenue: string;
  cost: ProfitabilityCostBreakdown;
  unallocatedExpenses: string;
  netProfit: string;
}

function toMoneyString(value: Decimal): string {
  return toDisplayString(value);
}

function categoryMatches(category: string, keywords: string[]): boolean {
  const normalized = category.trim().toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

const ZERO_RESULT: ProfitabilityResult = {
  revenue: toDisplayString(new Decimal(0)),
  cost: {
    fuel: toDisplayString(new Decimal(0)),
    maintenance: toDisplayString(new Decimal(0)),
    transport: toDisplayString(new Decimal(0)),
    labor: toDisplayString(new Decimal(0)),
    parts: toDisplayString(new Decimal(0)),
  },
  unallocatedExpenses: toDisplayString(new Decimal(0)),
  netProfit: toDisplayString(new Decimal(0)),
};

export interface ProfitabilityBatchQuery {
  generatorIds: string[];
  from: Date;
  to: Date;
}

export const ProfitabilityEngineService = {
  /**
   * Computes profitability for many generators in a bounded number of queries (one per
   * collection, filtered with $in), instead of the per-generator fan-out `calculate()` would
   * otherwise require when called in a loop. Semantics must stay identical to `calculate()`'s
   * generator-only branch: a generator "matches" an extract if any of the generator's own
   * contracts appears in that extract's `contractIds` (an extract can therefore contribute
   * revenue to more than one generator, same as the single-generator path).
   */
  async calculateBatch(query: ProfitabilityBatchQuery): Promise<Map<string, ProfitabilityResult>> {
    if (query.to.getTime() < query.from.getTime()) {
      throw new ValidationError('Validation failed', [
        { field: 'to', message: 'to must be on or after from' },
      ]);
    }

    const generatorIds = [...new Set(query.generatorIds)];
    const results = new Map<string, ProfitabilityResult>();
    if (generatorIds.length === 0) {
      return results;
    }

    const contractItems = await ContractItemModel.find({
      generatorId: { $in: generatorIds },
    }).select('generatorId contractId');

    const contractIdsByGenerator = new Map<string, Set<string>>();
    const allContractIds = new Set<string>();
    for (const item of contractItems) {
      const generatorId = String(item.generatorId);
      const contractId = String(item.contractId);
      if (!contractIdsByGenerator.has(generatorId)) {
        contractIdsByGenerator.set(generatorId, new Set());
      }
      contractIdsByGenerator.get(generatorId)?.add(contractId);
      allContractIds.add(contractId);
    }

    const [extracts, fuelLogs, maintenanceRecords, expenses] = await Promise.all([
      allContractIds.size === 0
        ? Promise.resolve([])
        : ExtractModel.find({
            status: { $in: ['Approved', 'Partially Collected', 'Collected'] },
            'period.end': { $gte: query.from },
            'period.start': { $lte: query.to },
            contractIds: { $in: [...allContractIds] },
          }),
      FuelLogModel.find({
        generatorId: { $in: generatorIds },
        date: { $gte: query.from, $lte: query.to },
      }),
      MaintenanceModel.find({
        generatorId: { $in: generatorIds },
        date: { $gte: query.from, $lte: query.to },
      }),
      ExpenseModel.find({
        generatorId: { $in: generatorIds },
        date: { $gte: query.from, $lte: query.to },
      }),
    ]);

    for (const generatorId of generatorIds) {
      const ownContractIds = contractIdsByGenerator.get(generatorId) ?? new Set<string>();

      const revenue = ownContractIds.size === 0
        ? new Decimal(0)
        : extracts
            .filter((extract) =>
              (extract.contractIds ?? []).some((contractId) =>
                ownContractIds.has(String(contractId)),
              ),
            )
            .reduce((sum, extract) => {
              const rentValue = (extract.lineItems ?? []).reduce((lineSum, item) => {
                if (item.type !== 'rent') return lineSum;
                return lineSum.plus(toDecimal(item.amount));
              }, new Decimal(0));
              return sum.plus(rentValue);
            }, new Decimal(0));

      const genFuelLogs = fuelLogs.filter((log) => String(log.generatorId) === generatorId);
      const genMaintenance = maintenanceRecords.filter(
        (record) => String(record.generatorId) === generatorId,
      );
      const genExpenses = expenses.filter((expense) => String(expense.generatorId) === generatorId);

      const fuelCost = genFuelLogs.reduce(
        (sum, log) => sum.plus(toDecimal(log.totalCost)),
        new Decimal(0),
      );
      const maintenanceCost = genMaintenance.reduce(
        (sum, record) => sum.plus(toDecimal(record.totalCost)),
        new Decimal(0),
      );
      const transportCost = genExpenses
        .filter((expense) => categoryMatches(expense.category, ['transport']))
        .reduce((sum, expense) => sum.plus(toDecimal(expense.amount)), new Decimal(0));
      const laborCost = genExpenses
        .filter((expense) => categoryMatches(expense.category, ['labor', 'labour']))
        .reduce((sum, expense) => sum.plus(toDecimal(expense.amount)), new Decimal(0));
      const partsCost = genExpenses
        .filter((expense) => categoryMatches(expense.category, ['part', 'spare', 'parts']))
        .reduce((sum, expense) => sum.plus(toDecimal(expense.amount)), new Decimal(0));

      // Every expense matched above already has this generatorId set, so — same as
      // calculate()'s generator-only branch — there is never an "unallocated" expense here.
      const totalCost = fuelCost
        .plus(maintenanceCost)
        .plus(transportCost)
        .plus(laborCost)
        .plus(partsCost);
      const netProfit = revenue.minus(totalCost);

      results.set(generatorId, {
        revenue: toMoneyString(revenue),
        cost: {
          fuel: toMoneyString(fuelCost),
          maintenance: toMoneyString(maintenanceCost),
          transport: toMoneyString(transportCost),
          labor: toMoneyString(laborCost),
          parts: toMoneyString(partsCost),
        },
        unallocatedExpenses: toMoneyString(new Decimal(0)),
        netProfit: toMoneyString(netProfit),
      });
    }

    return results;
  },

  async calculate(query: ProfitabilityQuery): Promise<ProfitabilityResult> {
    if (query.to.getTime() < query.from.getTime()) {
      throw new ValidationError('Validation failed', [
        { field: 'to', message: 'to must be on or after from' },
      ]);
    }

    // The generator-only filter shape is handled by the aggregation-batched path (also used,
    // at scale, by DashboardService's top-profitable-generators query) — delegate to it here so
    // there is exactly one implementation of the generator revenue/cost logic, not two that can
    // drift apart. Combined filters (generatorId+projectId/customerId) fall through to the
    // original per-query logic below, since calculateBatch is keyed purely by generatorId.
    if (query.generatorId && !query.projectId && !query.customerId) {
      const batch = await ProfitabilityEngineService.calculateBatch({
        generatorIds: [query.generatorId],
        from: query.from,
        to: query.to,
      });
      return batch.get(query.generatorId) ?? ZERO_RESULT;
    }

    const projectIdsForCustomer = query.customerId
      ? await ProjectModel.find({
          customerId: query.customerId,
          isDeleted: { $ne: true },
        }).distinct('_id')
      : [];

    const contractIds = query.generatorId
      ? await ContractItemModel.find({ generatorId: query.generatorId }).distinct('contractId')
      : [];

    const extractQuery: Record<string, unknown> = {
      status: { $in: ['Approved', 'Partially Collected', 'Collected'] },
      'period.end': { $gte: query.from },
      'period.start': { $lte: query.to },
    };
    if (query.generatorId) {
      extractQuery.contractIds = { $in: contractIds };
    }
    if (query.projectId) {
      extractQuery.projectId = query.projectId;
    }
    if (query.customerId) {
      extractQuery.customerId = query.customerId;
    }

    // A generator with no contract items has zero possible matching extracts — querying with
    // an empty $in is equivalent to "match nothing," so skip the round-trip entirely rather
    // than passing a placeholder string through an ObjectId field (which Mongoose can't cast).
    const skipExtracts = Boolean(query.generatorId) && contractIds.length === 0;

    const [extracts, fuelLogs, maintenanceRecords, expenses] = await Promise.all([
      skipExtracts ? Promise.resolve([]) : ExtractModel.find(extractQuery),
      FuelLogModel.find({
        ...(query.generatorId ? { generatorId: query.generatorId } : {}),
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.customerId ? { projectId: { $in: projectIdsForCustomer } } : {}),
        date: { $gte: query.from, $lte: query.to },
      }),
      MaintenanceModel.find({
        ...(query.generatorId ? { generatorId: query.generatorId } : {}),
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.customerId ? { generatorId: { $in: [] } } : {}),
        date: { $gte: query.from, $lte: query.to },
      }),
      ExpenseModel.find({
        ...(query.generatorId ? { generatorId: query.generatorId } : {}),
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.customerId ? { projectId: { $in: projectIdsForCustomer } } : {}),
        date: { $gte: query.from, $lte: query.to },
      }),
    ]);

    const revenue = extracts.reduce((sum, extract) => {
      const rentValue = (extract.lineItems ?? []).reduce((lineSum, item) => {
        if (item.type !== 'rent') return lineSum;
        return lineSum.plus(toDecimal(item.amount));
      }, new Decimal(0));
      return sum.plus(rentValue);
    }, new Decimal(0));

    const fuelCost = fuelLogs.reduce(
      (sum, log) => sum.plus(toDecimal(log.totalCost)),
      new Decimal(0),
    );
    const maintenanceCost = maintenanceRecords.reduce(
      (sum, record) => sum.plus(toDecimal(record.totalCost)),
      new Decimal(0),
    );

    const transportCost = expenses
      .filter((expense) => !query.generatorId || String(expense.generatorId) === query.generatorId)
      .filter((expense) => categoryMatches(expense.category, ['transport']))
      .reduce((sum, expense) => sum.plus(toDecimal(expense.amount)), new Decimal(0));
    const laborCost = expenses
      .filter((expense) => !query.generatorId || String(expense.generatorId) === query.generatorId)
      .filter((expense) => categoryMatches(expense.category, ['labor', 'labour']))
      .reduce((sum, expense) => sum.plus(toDecimal(expense.amount)), new Decimal(0));
    const partsCost = expenses
      .filter((expense) => !query.generatorId || String(expense.generatorId) === query.generatorId)
      .filter((expense) => categoryMatches(expense.category, ['part', 'spare', 'parts']))
      .reduce((sum, expense) => sum.plus(toDecimal(expense.amount)), new Decimal(0));

    const unallocatedExpenses = expenses
      .filter((expense) => !expense.generatorId && !expense.projectId)
      .reduce((sum, expense) => sum.plus(toDecimal(expense.amount)), new Decimal(0));

    const cost = {
      fuel: toMoneyString(fuelCost),
      maintenance: toMoneyString(maintenanceCost),
      transport: toMoneyString(transportCost),
      labor: toMoneyString(laborCost),
      parts: toMoneyString(partsCost),
    };

    const totalCost = fuelCost
      .plus(maintenanceCost)
      .plus(transportCost)
      .plus(laborCost)
      .plus(partsCost);
    const netProfit = revenue.minus(totalCost);

    return {
      revenue: toMoneyString(revenue),
      cost,
      unallocatedExpenses: toMoneyString(unallocatedExpenses),
      netProfit: toMoneyString(netProfit),
    };
  },
};
