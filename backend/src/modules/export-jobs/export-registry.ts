import type { PermissionKey } from '../auth/permissions.js';
import type { ExportColumn } from '../../services/export/csvGenerator.js';
import { ReportsService } from '../reports/service.js';

export interface ExportFilters {
  from?: Date;
  to?: Date;
  customerId?: string;
  projectId?: string;
  generatorId?: string;
  category?: string;
  type?: string;
}

export interface ExportDefinition {
  permission: PermissionKey;
  columns: ExportColumn[];
  /** Fetches up to `maxLimit` matching rows (no pagination) for the export file. */
  fetchRows: (filters: ExportFilters, maxLimit: number) => Promise<Record<string, unknown>[]>;
}

async function rowsFrom<T>(
  result: Promise<{ items: T[] }>,
): Promise<Record<string, unknown>[]> {
  const { items } = await result;
  return items as unknown as Record<string, unknown>[];
}

/**
 * TASK-029 Section 11/23: every export delegates to the same TASK-028 report queries — no
 * parallel calculation. Scoped to the 9 Reports Center reports for this pass; exporting the
 * raw Extract/Receipt document lists (also referenced in Section 23) is a natural follow-up
 * that needs the same maxLimit plumbing added to those modules' own list services first.
 */
export const EXPORT_REGISTRY: Record<string, ExportDefinition> = {
  revenue: {
    permission: 'reports:revenue',
    columns: [
      { key: 'extractNumber', header: 'Extract Number' },
      { key: 'customer', header: 'Customer' },
      { key: 'project', header: 'Project' },
      { key: 'periodStart', header: 'Period Start' },
      { key: 'periodEnd', header: 'Period End' },
      { key: 'revenue', header: 'Revenue' },
    ],
    fetchRows: (filters, maxLimit) =>
      rowsFrom(ReportsService.revenue({ ...filters, page: 1, limit: maxLimit, maxLimit })),
  },
  profitability: {
    permission: 'reports:profitability',
    columns: [
      { key: 'revenue', header: 'Revenue' },
      { key: 'netProfit', header: 'Net Profit' },
    ],
    fetchRows: async (filters) => {
      const { items } = await ReportsService.profitability(filters);
      return items.map((item) => ({
        revenue: item.revenue,
        fuel: item.cost.fuel,
        maintenance: item.cost.maintenance,
        transport: item.cost.transport,
        labor: item.cost.labor,
        parts: item.cost.parts,
        unallocatedExpenses: item.unallocatedExpenses,
        netProfit: item.netProfit,
      }));
    },
  },
  operations: {
    permission: 'reports:operations',
    columns: [
      { key: 'date', header: 'Date' },
      { key: 'generator', header: 'Generator' },
      { key: 'project', header: 'Project' },
      { key: 'startMeter', header: 'Start Meter' },
      { key: 'endMeter', header: 'End Meter' },
      { key: 'operatingHours', header: 'Operating Hours' },
      { key: 'downtimeHours', header: 'Downtime Hours' },
    ],
    fetchRows: (filters, maxLimit) =>
      rowsFrom(ReportsService.operations({ ...filters, page: 1, limit: maxLimit, maxLimit })),
  },
  'fuel-consumption': {
    permission: 'reports:fuelConsumption',
    columns: [
      { key: 'date', header: 'Date' },
      { key: 'generator', header: 'Generator' },
      { key: 'liters', header: 'Liters' },
      { key: 'pricePerLiter', header: 'Price/Liter' },
      { key: 'totalCost', header: 'Total Cost' },
      { key: 'consumptionRate', header: 'Consumption Rate (L/h)' },
      { key: 'variancePercent', header: 'Variance From Normal (%)' },
    ],
    fetchRows: (filters, maxLimit) =>
      rowsFrom(ReportsService.fuelConsumption({ ...filters, page: 1, limit: maxLimit, maxLimit })),
  },
  maintenance: {
    permission: 'reports:maintenance',
    columns: [
      { key: 'date', header: 'Date' },
      { key: 'generator', header: 'Generator' },
      { key: 'type', header: 'Type' },
      { key: 'status', header: 'Status' },
      { key: 'partsCost', header: 'Parts Cost' },
      { key: 'oilCost', header: 'Oil Cost' },
      { key: 'laborCost', header: 'Labor Cost' },
      { key: 'transportCost', header: 'Transport Cost' },
      { key: 'totalCost', header: 'Total Cost' },
    ],
    fetchRows: (filters, maxLimit) =>
      rowsFrom(ReportsService.maintenance({ ...filters, page: 1, limit: maxLimit, maxLimit })),
  },
  'customer-statement': {
    permission: 'reports:customerStatement',
    columns: [
      { key: 'date', header: 'Date' },
      { key: 'type', header: 'Type' },
      { key: 'reference', header: 'Reference' },
      { key: 'debit', header: 'Debit' },
      { key: 'credit', header: 'Credit' },
      { key: 'runningBalance', header: 'Running Balance' },
    ],
    fetchRows: async (filters, maxLimit) => {
      if (!filters.customerId) return [];
      const result = await ReportsService.customerStatement({
        customerId: filters.customerId,
        from: filters.from,
        to: filters.to,
        page: 1,
        limit: maxLimit,
      });
      return result.items as unknown as Record<string, unknown>[];
    },
  },
  'uncollected-extracts': {
    permission: 'reports:uncollectedExtracts',
    columns: [
      { key: 'extractNumber', header: 'Extract Number' },
      { key: 'customer', header: 'Customer' },
      { key: 'total', header: 'Total' },
      { key: 'collected', header: 'Collected' },
      { key: 'remaining', header: 'Remaining' },
      { key: 'status', header: 'Status' },
    ],
    fetchRows: (filters, maxLimit) =>
      rowsFrom(
        ReportsService.uncollectedExtracts({ ...filters, page: 1, limit: maxLimit, maxLimit }),
      ),
  },
  expenses: {
    permission: 'reports:expenses',
    columns: [
      { key: 'date', header: 'Date' },
      { key: 'category', header: 'Category' },
      { key: 'description', header: 'Description' },
      { key: 'generator', header: 'Generator' },
      { key: 'project', header: 'Project' },
      { key: 'amount', header: 'Amount' },
    ],
    fetchRows: (filters, maxLimit) =>
      rowsFrom(ReportsService.expenses({ ...filters, page: 1, limit: maxLimit, maxLimit })),
  },
  'profit-expense-summary': {
    permission: 'reports:profitExpenseSummary',
    columns: [
      { key: 'revenue', header: 'Revenue' },
      { key: 'expenses', header: 'Expenses' },
      { key: 'netProfit', header: 'Net Profit' },
    ],
    fetchRows: (filters) => rowsFrom(ReportsService.profitExpenseSummary(filters)),
  },
};

export function isKnownReportType(reportType: string): boolean {
  return Object.prototype.hasOwnProperty.call(EXPORT_REGISTRY, reportType);
}
