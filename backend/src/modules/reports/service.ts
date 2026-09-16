import { Decimal } from 'decimal.js';

import { toDecimal, toDisplayString } from '../../services/money.js';
import { paginateQuery, type PaginatedResult } from '../../services/pagination.js';
import { CustomerLedgerService } from '../customer-ledger-engine/service.js';
import { ExpenseModel } from '../expenses/expense.model.js';
import { ContractItemModel } from '../contracts/contract-item.model.js';
import { ExtractModel, type ExtractAttrs } from '../extracts/extract.model.js';
import { FuelLogModel } from '../fuel/fuel-log.model.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { MaintenanceModel } from '../maintenance/maintenance.model.js';
import { OperationLogModel } from '../operations/operation-log.model.js';
import { ProfitabilityEngineService } from '../profitability-engine/service.js';
import { ProjectModel } from '../projects/project.model.js';

/** Read-time name enrichment (same join-not-store pattern as TASK-022's receipt customerName) —
 * report rows need human-readable codes, not raw ObjectIds, and none of these reports' owning
 * models snapshot a generator/project code at write time. */
async function generatorCodeMap(ids: unknown[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.map(String))];
  const generators = await GeneratorModel.find({ _id: { $in: unique } }).select('_id code');
  return new Map(generators.map((g) => [String(g._id), g.code]));
}

async function generatorInfoMap(
  ids: unknown[],
): Promise<Map<string, { code: string; normalFuelConsumption: number }>> {
  const unique = [...new Set(ids.map(String))];
  const generators = await GeneratorModel.find({ _id: { $in: unique } }).select(
    '_id code normalFuelConsumption',
  );
  return new Map(
    generators.map((g) => [
      String(g._id),
      { code: g.code, normalFuelConsumption: g.normalFuelConsumption },
    ]),
  );
}

async function projectNameMap(ids: unknown[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.map(String))];
  const projects = await ProjectModel.find({ _id: { $in: unique } }).select('_id code name');
  return new Map(projects.map((p) => [String(p._id), `${p.code} — ${p.name}`]));
}

export interface UncollectedExtractRow {
  extractNumber: string;
  customer: string;
  total: string;
  collected: string;
  remaining: string;
  status: string;
}

export interface UncollectedExtractQuery {
  from?: Date;
  to?: Date;
  customerId?: string;
  page?: number;
  limit?: number;
}

export interface CustomerStatementQuery {
  customerId: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

export interface ProfitabilityReportQuery {
  from?: Date;
  to?: Date;
  generatorId?: string;
  projectId?: string;
  page?: number;
  limit?: number;
}

const statuses = ['Approved', 'Partially Collected'] as const;

export const ReportsService = {
  async revenue(query: UncollectedExtractQuery & { projectId?: string; generatorId?: string }) {
    const filters: Record<string, unknown> = {
      status: { $in: ['Approved', 'Partially Collected', 'Collected'] },
    };
    if (query.projectId) filters.projectId = query.projectId;
    if (query.from || query.to) {
      filters['period.end'] = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }
    if (query.generatorId) {
      // Extract has no direct generatorId — it's linked via ContractItem, same join
      // ProfitabilityEngineService uses (Section 6: "Generator Revenue ... filters: ... generator").
      const contractIds = await ContractItemModel.find({
        generatorId: query.generatorId,
      }).distinct('contractId');
      filters.contractIds = { $in: contractIds };
    }
    const result = await paginateQuery(ExtractModel, filters, {
      page: query.page,
      limit: query.limit,
      sort: '-period.end',
      allowedSortFields: ['period.end', 'number', 'createdAt'],
    });
    const projectNames = await projectNameMap(result.items.map((e) => e.projectId));
    return {
      items: result.items.map((extract) => ({
        extractNumber: extract.number,
        customer: extract.customerNameSnapshot,
        project: projectNames.get(String(extract.projectId)) ?? String(extract.projectId),
        revenue: toDisplayString(extract.finalTotal ?? '0'),
        periodStart: extract.period.start,
        periodEnd: extract.period.end,
      })),
      meta: result.meta,
    };
  },

  async profitExpenseSummary(query: ProfitabilityReportQuery) {
    const result = await ReportsService.profitability(query);
    const item = result.items[0];
    if (!item) {
      return { items: [], meta: result.meta };
    }
    const expenses = new Decimal(item.cost.fuel)
      .plus(item.cost.maintenance)
      .plus(item.cost.transport)
      .plus(item.cost.labor)
      .plus(item.cost.parts)
      .plus(item.unallocatedExpenses);
    return {
      items: [
        { revenue: item.revenue, expenses: toDisplayString(expenses), netProfit: item.netProfit },
      ],
      meta: result.meta,
    };
  },

  async operations(query: UncollectedExtractQuery & { projectId?: string; generatorId?: string }) {
    const filters: Record<string, unknown> = { status: 'Active' };
    if (query.projectId) filters.projectId = query.projectId;
    if (query.generatorId) filters.generatorId = query.generatorId;
    if (query.from || query.to) {
      filters.date = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }
    const result = await paginateQuery(OperationLogModel, filters, {
      page: query.page,
      limit: query.limit,
      sort: '-date',
      allowedSortFields: ['date', 'createdAt'],
    });
    const generatorCodes = await generatorCodeMap(result.items.map((log) => log.generatorId));
    const projectNames = await projectNameMap(result.items.map((log) => log.projectId));
    return {
      items: result.items.map((log) => ({
        date: log.date,
        generator: generatorCodes.get(String(log.generatorId)) ?? String(log.generatorId),
        project: projectNames.get(String(log.projectId)) ?? String(log.projectId),
        startMeter: log.startMeter,
        endMeter: log.endMeter,
        operatingHours: log.operatingHours,
        downtimeHours: log.downtimeHours,
      })),
      meta: result.meta,
    };
  },

  async fuelConsumption(query: UncollectedExtractQuery & { generatorId?: string }) {
    const filters: Record<string, unknown> = {};
    if (query.generatorId) filters.generatorId = query.generatorId;
    if (query.from || query.to) {
      filters.date = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }
    const result = await paginateQuery(FuelLogModel, filters, {
      page: query.page,
      limit: query.limit,
      sort: '-date',
      allowedSortFields: ['date', 'createdAt'],
    });
    const generators = await generatorInfoMap(result.items.map((log) => log.generatorId));
    return {
      items: result.items.map((log) => {
        const generator = generators.get(String(log.generatorId));
        const normal = generator?.normalFuelConsumption ?? 0;
        const variancePercent =
          log.consumptionRate !== null && normal > 0
            ? ((log.consumptionRate - normal) / normal) * 100
            : null;
        return {
          date: log.date,
          generator: generator?.code ?? String(log.generatorId),
          liters: log.liters,
          pricePerLiter: toDisplayString(log.pricePerLiter),
          totalCost: toDisplayString(log.totalCost),
          consumptionRate: log.consumptionRate,
          variancePercent,
        };
      }),
      meta: result.meta,
    };
  },

  async maintenance(query: UncollectedExtractQuery & { generatorId?: string; type?: string }) {
    const filters: Record<string, unknown> = {};
    if (query.generatorId) filters.generatorId = query.generatorId;
    if (query.type) filters.type = query.type;
    if (query.from || query.to) {
      filters.date = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }
    const result = await paginateQuery(MaintenanceModel, filters, {
      page: query.page,
      limit: query.limit,
      sort: '-date',
      allowedSortFields: ['date', 'createdAt'],
    });
    const generatorCodes = await generatorCodeMap(result.items.map((record) => record.generatorId));
    return {
      items: result.items.map((record) => ({
        date: record.date,
        generator: generatorCodes.get(String(record.generatorId)) ?? String(record.generatorId),
        type: record.type,
        status: record.status,
        partsCost: toDisplayString(record.partsCost),
        oilCost: toDisplayString(record.oilCost),
        laborCost: toDisplayString(record.laborCost),
        transportCost: toDisplayString(record.transportCost),
        totalCost: toDisplayString(record.totalCost),
      })),
      meta: result.meta,
    };
  },

  async expenses(
    query: UncollectedExtractQuery & {
      projectId?: string;
      generatorId?: string;
      category?: string;
    },
  ) {
    const filters: Record<string, unknown> = { status: 'Confirmed' };
    if (query.projectId) filters.projectId = query.projectId;
    if (query.generatorId) filters.generatorId = query.generatorId;
    if (query.category) filters.category = query.category;
    if (query.from || query.to) {
      filters.date = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }
    const result = await paginateQuery(ExpenseModel, filters, {
      page: query.page,
      limit: query.limit,
      sort: '-date',
      allowedSortFields: ['date', 'category', 'createdAt'],
    });
    const generatorCodes = await generatorCodeMap(
      result.items.filter((e) => e.generatorId).map((e) => e.generatorId),
    );
    const projectNames = await projectNameMap(
      result.items.filter((e) => e.projectId).map((e) => e.projectId),
    );
    return {
      items: result.items.map((expense) => ({
        date: expense.date,
        category: expense.category,
        description: expense.description,
        generator: expense.generatorId
          ? (generatorCodes.get(String(expense.generatorId)) ?? String(expense.generatorId))
          : null,
        project: expense.projectId
          ? (projectNames.get(String(expense.projectId)) ?? String(expense.projectId))
          : null,
        amount: toDisplayString(expense.amount),
      })),
      meta: result.meta,
    };
  },

  async profitability(query: ProfitabilityReportQuery) {
    const now = new Date();
    const from = query.from ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const to = query.to ?? now;
    const result = await ProfitabilityEngineService.calculate({
      from,
      to,
      generatorId: query.generatorId,
      projectId: query.projectId,
    });
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    return {
      items: [result],
      meta: { page, limit, total: 1, totalPages: 1 },
    };
  },

  async customerStatement(query: CustomerStatementQuery) {
    const statement = await CustomerLedgerService.getStatement(query.customerId, {
      from: query.from,
      to: query.to,
    });
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const start = (page - 1) * limit;
    const entries = statement.entries.slice(start, start + limit);

    return {
      items: entries,
      closingBalance: statement.closingBalance,
      meta: {
        page,
        limit,
        total: statement.entries.length,
        totalPages: Math.ceil(statement.entries.length / limit),
      },
    };
  },

  async uncollectedExtracts(
    query: UncollectedExtractQuery,
  ): Promise<PaginatedResult<UncollectedExtractRow>> {
    const filters: Record<string, unknown> = {
      status: { $in: statuses },
    };
    if (query.customerId) filters.customerId = query.customerId;
    if (query.from || query.to) {
      filters['period.end'] = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }

    const result = await paginateQuery<ExtractAttrs>(ExtractModel, filters, {
      page: query.page,
      limit: query.limit,
      sort: '-period.end',
      allowedSortFields: ['period.end', 'number', 'createdAt'],
    });

    return {
      items: result.items.map((extract) => {
        const total = toDecimal(extract.finalTotal ?? '0');
        const collected = toDecimal(extract.collectedAmount ?? '0');
        const remaining = Decimal.max(total.minus(collected), 0);
        return {
          extractNumber: extract.number,
          customer: extract.customerNameSnapshot,
          total: toDisplayString(total),
          collected: toDisplayString(collected),
          remaining: toDisplayString(remaining),
          status: extract.status,
        };
      }),
      meta: result.meta,
    };
  },
};
