import { Decimal } from 'decimal.js';

import { toDecimal, toDisplayString } from '../../services/money.js';
import { ExpenseModel } from '../expenses/expense.model.js';
import { ExtractModel } from '../extracts/extract.model.js';
import { FuelLogModel } from '../fuel/fuel-log.model.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { MaintenanceModel } from '../maintenance/maintenance.model.js';
import { ProfitabilityEngineService } from '../profitability-engine/service.js';
import { ReceiptModel } from '../receipts/receipt.model.js';

export interface DashboardPeriodInput {
  from?: Date;
  to?: Date;
  projectId?: string;
  customerId?: string;
}

export interface DashboardSummary {
  fleet: {
    total: number;
    available: number;
    rented: number;
    underMaintenance: number;
    stopped: number;
  };
  financial: {
    revenue: string;
    receipts: string;
    outstanding: string;
    expenses: string;
    netProfit: string;
  };
  operations: {
    operatingHours: string;
    fuelConsumption: string;
    maintenanceCost: string;
  };
  alerts: {
    expiringContracts: number;
    overdueCustomers: number;
    maintenance: number;
    stoppedGenerators: number;
    abnormalFuel: number;
  };
  charts: {
    revenueTrend: Array<{ month: string; revenue: string }>;
    extractStatus: Array<{ status: string; value: number }>;
    topGeneratorsUtilization: Array<{ generatorCode: string; utilization: number }>;
    topGeneratorsProfitability: Array<{ generatorCode: string; netProfit: string }>;
  };
}

function monthRangeFor(date: Date): { from: Date; to: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from: start, to: end };
}

export const DashboardService = {
  async getSummary(input: DashboardPeriodInput): Promise<DashboardSummary> {
    const resolvedFrom = input.from ?? new Date();
    const resolvedTo = input.to ?? new Date();

    if (resolvedTo.getTime() < resolvedFrom.getTime()) {
      throw new Error('to must be on or after from');
    }

    const period = monthRangeFor(resolvedFrom);
    const from = resolvedFrom;
    const to = resolvedTo;

    const projectFilters = input.projectId ? { projectId: input.projectId } : {};
    const customerFilters = input.customerId ? { customerId: input.customerId } : {};

    const [generatorCounts, extracts, fuelLogs, maintenanceRecords, expenses, profitability] =
      await Promise.all([
        GeneratorModel.aggregate([
          {
            $match: {
              isDeleted: { $ne: true },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              available: { $sum: { $cond: [{ $eq: ['$status', 'Available'] }, 1, 0] } },
              rented: { $sum: { $cond: [{ $eq: ['$status', 'Rented'] }, 1, 0] } },
              underMaintenance: {
                $sum: { $cond: [{ $eq: ['$status', 'Under Maintenance'] }, 1, 0] },
              },
              stopped: { $sum: { $cond: [{ $eq: ['$status', 'Stopped'] }, 1, 0] } },
            },
          },
        ]),
        ExtractModel.find({
          status: { $in: ['Approved', 'Partially Collected', 'Collected'] },
          'period.end': { $gte: from },
          'period.start': { $lte: to },
          ...projectFilters,
          ...customerFilters,
        }),
        FuelLogModel.find({
          date: { $gte: from, $lte: to },
          ...projectFilters,
        }),
        MaintenanceModel.find({
          date: { $gte: from, $lte: to },
          ...(input.projectId ? { projectId: input.projectId } : {}),
        }),
        ExpenseModel.find({
          date: { $gte: from, $lte: to },
          ...projectFilters,
        }),
        ProfitabilityEngineService.calculate({
          from: period.from,
          to: period.to,
          ...(input.projectId ? { projectId: input.projectId } : {}),
          ...(input.customerId ? { customerId: input.customerId } : {}),
        }),
      ]);

    const revenue = extracts.reduce((sum, extract) => {
      const rentTotal = (extract.lineItems ?? []).reduce((lineSum, item) => {
        if (item.type !== 'rent') return lineSum;
        return lineSum.plus(toDecimal(item.amount));
      }, new Decimal(0));
      return sum.plus(rentTotal);
    }, new Decimal(0));

    const receipts = await ReceiptModel.find({
      date: { $gte: from, $lte: to },
      status: { $ne: 'Cancelled' },
      ...(input.customerId ? { customerId: input.customerId } : {}),
    });
    const outstandingRevenue = receipts.reduce(
      (sum, receipt) => sum.plus(toDecimal(receipt.amount)),
      new Decimal(0),
    );
    const operatingHours = fuelLogs.reduce(
      (sum, log) => sum.plus(toDecimal(log.totalCost).dividedBy(1)),
      new Decimal(0),
    );
    const maintenanceCost = maintenanceRecords.reduce(
      (sum, record) => sum.plus(toDecimal(record.totalCost)),
      new Decimal(0),
    );
    const expensesTotal = expenses.reduce(
      (sum, expense) => sum.plus(toDecimal(expense.amount)),
      new Decimal(0),
    );

    const fleet = generatorCounts[0] ?? {
      total: 0,
      available: 0,
      rented: 0,
      underMaintenance: 0,
      stopped: 0,
    };

    return {
      fleet: {
        total: Number(fleet.total ?? 0),
        available: Number(fleet.available ?? 0),
        rented: Number(fleet.rented ?? 0),
        underMaintenance: Number(fleet.underMaintenance ?? 0),
        stopped: Number(fleet.stopped ?? 0),
      },
      financial: {
        revenue: toDisplayString(revenue),
        receipts: toDisplayString(outstandingRevenue),
        outstanding: '0.00',
        expenses: toDisplayString(expensesTotal),
        netProfit: profitability.netProfit,
      },
      operations: {
        operatingHours: toDisplayString(operatingHours),
        fuelConsumption: toDisplayString(
          fuelLogs.reduce((sum, log) => sum.plus(toDecimal(log.liters ?? 0)), new Decimal(0)),
        ),
        maintenanceCost: toDisplayString(maintenanceCost),
      },
      alerts: {
        expiringContracts: 0,
        overdueCustomers: 0,
        maintenance: 0,
        stoppedGenerators: Number(fleet.stopped ?? 0),
        abnormalFuel: 0,
      },
      charts: {
        revenueTrend: [{ month: 'This period', revenue: toDisplayString(revenue) }],
        extractStatus: [{ status: 'Approved', value: extracts.length }],
        topGeneratorsUtilization: [],
        topGeneratorsProfitability: [],
      },
    };
  },
};
