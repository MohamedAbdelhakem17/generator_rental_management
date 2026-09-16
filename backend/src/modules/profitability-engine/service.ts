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

export const ProfitabilityEngineService = {
  async calculate(query: ProfitabilityQuery): Promise<ProfitabilityResult> {
    if (query.to.getTime() < query.from.getTime()) {
      throw new ValidationError('Validation failed', [
        { field: 'to', message: 'to must be on or after from' },
      ]);
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
      extractQuery.contractIds = { $in: contractIds.length ? contractIds : ['__none__'] };
    }
    if (query.projectId) {
      extractQuery.projectId = query.projectId;
    }
    if (query.customerId) {
      extractQuery.customerId = query.customerId;
    }

    const [extracts, fuelLogs, maintenanceRecords, expenses] = await Promise.all([
      ExtractModel.find(extractQuery),
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
