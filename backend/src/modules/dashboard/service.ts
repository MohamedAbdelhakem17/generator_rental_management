import { Decimal } from 'decimal.js';

import { toDecimal, toDisplayString } from '../../services/money.js';
import { ValidationError } from '../../utils/AppError.js';
import { CustomerModel } from '../customers/customer.model.js';
import { CustomerLedgerService } from '../customer-ledger-engine/service.js';
import { RentalContractModel } from '../contracts/contract.model.js';
import { ExpenseModel } from '../expenses/expense.model.js';
import { ExtractModel } from '../extracts/extract.model.js';
import { FuelAlertModel } from '../fuel-alert-engine/fuel-alert.model.js';
import { FuelLogModel } from '../fuel/fuel-log.model.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { MaintenanceAlertModel } from '../maintenance-schedule-engine/maintenance-alert.model.js';
import { MaintenanceModel } from '../maintenance/maintenance.model.js';
import { OperationLogModel } from '../operations/operation-log.model.js';
import { ProfitabilityEngineService } from '../profitability-engine/service.js';
import { ReceiptModel } from '../receipts/receipt.model.js';
import { SettingsService } from '../settings/settings.service.js';

const EXPIRING_CONTRACT_WINDOW_DAYS = 30;
const TOP_GENERATORS_LIMIT = 5;
/** Bounds the per-generator ProfitabilityEngineService.calculate() fan-out for the "top profitable" chart. */
const PROFITABILITY_CANDIDATE_LIMIT = 20;

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
      throw new ValidationError('Validation failed', [
        { field: 'to', message: 'to must be on or after from' },
      ]);
    }

    const period = monthRangeFor(resolvedFrom);
    const from = resolvedFrom;
    const to = resolvedTo;

    const projectFilters = input.projectId ? { projectId: input.projectId } : {};
    const customerFilters = input.customerId ? { customerId: input.customerId } : {};

    const [
      generatorCounts,
      extracts,
      fuelLogs,
      maintenanceRecords,
      expenses,
      profitability,
      operationLogs,
      openMaintenanceAlerts,
      openFuelAlerts,
      expiringContracts,
    ] = await Promise.all([
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
      OperationLogModel.find({
        date: { $gte: from, $lte: to },
        status: 'Active',
        ...projectFilters,
      }),
      MaintenanceAlertModel.countDocuments({ status: { $in: ['Open', 'Acknowledged'] } }),
      FuelAlertModel.countDocuments({ status: { $in: ['Open', 'Acknowledged'] } }),
      RentalContractModel.countDocuments({
        status: 'Active',
        endDate: {
          $gte: new Date(),
          $lte: new Date(Date.now() + EXPIRING_CONTRACT_WINDOW_DAYS * 24 * 60 * 60 * 1000),
        },
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
    const operatingHours = operationLogs.reduce(
      (sum, log) => sum.plus(log.operatingHours),
      new Decimal(0),
    );

    // Business Rule 6.8: Σ positive customer balances (Ledger Engine) for total receivables.
    // "Overdue" is a real aging calculation (Extract past its period.end + the configured
    // grace period, not yet fully collected) via getOverdueSummaryForCustomers — a customer
    // with a positive balance but no extract past its grace period is NOT counted as overdue.
    const customerFilterForBalances = input.customerId ? { _id: input.customerId } : {};
    const activeCustomers = await CustomerModel.find({
      active: true,
      isDeleted: { $ne: true },
      ...customerFilterForBalances,
    }).select('_id');
    const activeCustomerIds = activeCustomers.map((customer) => String(customer._id));
    // TASK-034: batched into 3 grouped queries total (one per collection) instead of fanning
    // out getBalance's 3 queries per customer with no cap on active-customer count.
    const overdueGraceDays = await SettingsService.getOverdueGracePeriodDays();
    const [balancesByCustomer, overdueByCustomer] = await Promise.all([
      CustomerLedgerService.getBalancesForCustomers(activeCustomerIds),
      CustomerLedgerService.getOverdueSummaryForCustomers(activeCustomerIds, overdueGraceDays),
    ]);
    const positiveBalances = [...balancesByCustomer.values()]
      .map((balance) => toDecimal(balance))
      .filter((b) => b.gt(0));
    const outstandingReceivables = positiveBalances.reduce(
      (sum, balance) => sum.plus(balance),
      new Decimal(0),
    );
    const overdueCustomersCount = overdueByCustomer.size;

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

    const revenueByMonth = new Map<string, Decimal>();
    for (const extract of extracts) {
      const rentTotal = (extract.lineItems ?? []).reduce((lineSum, item) => {
        if (item.type !== 'rent') return lineSum;
        return lineSum.plus(toDecimal(item.amount));
      }, new Decimal(0));
      const monthKey = extract.period.start.toISOString().slice(0, 7);
      revenueByMonth.set(monthKey, (revenueByMonth.get(monthKey) ?? new Decimal(0)).plus(rentTotal));
    }
    const revenueTrend = [...revenueByMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, monthRevenue]) => ({ month, revenue: toDisplayString(monthRevenue) }));

    const extractStatusCounts = new Map<string, number>();
    for (const extract of extracts) {
      extractStatusCounts.set(extract.status, (extractStatusCounts.get(extract.status) ?? 0) + 1);
    }
    const extractStatus = [...extractStatusCounts.entries()].map(([status, value]) => ({
      status,
      value,
    }));

    const utilizationByGenerator = new Map<string, number>();
    for (const log of operationLogs) {
      const key = String(log.generatorId);
      utilizationByGenerator.set(key, (utilizationByGenerator.get(key) ?? 0) + log.operatingHours);
    }
    const generatorCodeById = new Map(
      (await GeneratorModel.find({ isDeleted: { $ne: true } }).select('_id code')).map((g) => [
        String(g._id),
        g.code,
      ]),
    );
    const topGeneratorsUtilization = [...utilizationByGenerator.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, TOP_GENERATORS_LIMIT)
      .map(([generatorId, hours]) => ({
        generatorCode: generatorCodeById.get(generatorId) ?? generatorId,
        utilization: hours,
      }));

    const profitabilityCandidateIds = [...utilizationByGenerator.keys()].slice(
      0,
      PROFITABILITY_CANDIDATE_LIMIT,
    );
    const profitabilityByGeneratorId = await ProfitabilityEngineService.calculateBatch({
      generatorIds: profitabilityCandidateIds,
      from: period.from,
      to: period.to,
    });
    const topGeneratorsProfitability = [...profitabilityByGeneratorId.entries()]
      .sort(([, a], [, b]) => Number(b.netProfit) - Number(a.netProfit))
      .slice(0, TOP_GENERATORS_LIMIT)
      .map(([generatorId, result]) => ({
        generatorCode: generatorCodeById.get(generatorId) ?? generatorId,
        netProfit: result.netProfit,
      }));

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
        outstanding: toDisplayString(outstandingReceivables),
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
        expiringContracts,
        overdueCustomers: overdueCustomersCount,
        maintenance: openMaintenanceAlerts,
        stoppedGenerators: Number(fleet.stopped ?? 0),
        abnormalFuel: openFuelAlerts,
      },
      charts: {
        revenueTrend,
        extractStatus,
        topGeneratorsUtilization,
        topGeneratorsProfitability,
      },
    };
  },
};
