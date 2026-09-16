import type { PermissionKey } from '@/lib/permissions/permission-keys';
import type { TranslationKey } from '@/lib/i18n/dictionary';
import type { ReportColumn } from './types';

export type FilterKind = 'dateRange' | 'project' | 'generator' | 'customer' | 'category' | 'maintenanceType';

export interface TableReportDefinition {
  kind: 'table';
  id: string;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  permission: PermissionKey;
  endpoint: string;
  filters: FilterKind[];
  columns: ReportColumn[];
}

export interface KpiReportDefinition {
  kind: 'profitability' | 'profitExpenseSummary';
  id: string;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  permission: PermissionKey;
  endpoint: string;
  filters: FilterKind[];
}

export interface StatementReportDefinition {
  kind: 'customerStatement';
  id: string;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  permission: PermissionKey;
  endpoint: string;
  filters: FilterKind[];
}

export type ReportDefinition = TableReportDefinition | KpiReportDefinition | StatementReportDefinition;

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    kind: 'table',
    id: 'revenue',
    titleKey: 'reports.revenueTitle',
    descriptionKey: 'reports.revenueDescription',
    permission: 'reports:revenue',
    endpoint: '/api/reports/revenue',
    filters: ['dateRange', 'generator', 'project'],
    columns: [
      { key: 'extractNumber', labelKey: 'reports.colExtractNumber' },
      { key: 'customer', labelKey: 'reports.colCustomer' },
      { key: 'project', labelKey: 'reports.colProject' },
      { key: 'periodStart', labelKey: 'reports.colPeriodStart', format: 'date' },
      { key: 'periodEnd', labelKey: 'reports.colPeriodEnd', format: 'date' },
      { key: 'revenue', labelKey: 'reports.colRevenue', format: 'money', align: 'end' },
    ],
  },
  {
    kind: 'profitability',
    id: 'profitability',
    titleKey: 'reports.profitabilityTitle',
    descriptionKey: 'reports.profitabilityDescription',
    permission: 'reports:profitability',
    endpoint: '/api/reports/profitability',
    filters: ['dateRange', 'generator', 'project'],
  },
  {
    kind: 'table',
    id: 'operations',
    titleKey: 'reports.operationsTitle',
    descriptionKey: 'reports.operationsDescription',
    permission: 'reports:operations',
    endpoint: '/api/reports/operations',
    filters: ['dateRange', 'project', 'generator'],
    columns: [
      { key: 'date', labelKey: 'reports.colDate', format: 'date' },
      { key: 'generator', labelKey: 'reports.colGenerator' },
      { key: 'project', labelKey: 'reports.colProject' },
      { key: 'startMeter', labelKey: 'reports.colStartMeter', format: 'number', align: 'end' },
      { key: 'endMeter', labelKey: 'reports.colEndMeter', format: 'number', align: 'end' },
      { key: 'operatingHours', labelKey: 'reports.colOperatingHours', format: 'number', align: 'end' },
      { key: 'downtimeHours', labelKey: 'reports.colDowntimeHours', format: 'number', align: 'end' },
    ],
  },
  {
    kind: 'table',
    id: 'fuel-consumption',
    titleKey: 'reports.fuelConsumptionTitle',
    descriptionKey: 'reports.fuelConsumptionDescription',
    permission: 'reports:fuelConsumption',
    endpoint: '/api/reports/fuel-consumption',
    filters: ['dateRange', 'generator'],
    columns: [
      { key: 'date', labelKey: 'reports.colDate', format: 'date' },
      { key: 'generator', labelKey: 'reports.colGenerator' },
      { key: 'liters', labelKey: 'reports.colLiters', format: 'number', align: 'end' },
      { key: 'pricePerLiter', labelKey: 'reports.colPricePerLiter', format: 'money', align: 'end' },
      { key: 'totalCost', labelKey: 'reports.colTotalCost', format: 'money', align: 'end' },
      { key: 'consumptionRate', labelKey: 'reports.colConsumptionRate', format: 'number', align: 'end' },
      { key: 'variancePercent', labelKey: 'reports.colVariancePercent', format: 'percent', align: 'end' },
    ],
  },
  {
    kind: 'table',
    id: 'maintenance',
    titleKey: 'reports.maintenanceTitle',
    descriptionKey: 'reports.maintenanceDescription',
    permission: 'reports:maintenance',
    endpoint: '/api/reports/maintenance',
    filters: ['dateRange', 'generator', 'maintenanceType'],
    columns: [
      { key: 'date', labelKey: 'reports.colDate', format: 'date' },
      { key: 'generator', labelKey: 'reports.colGenerator' },
      { key: 'type', labelKey: 'reports.colType' },
      { key: 'status', labelKey: 'reports.colStatus' },
      { key: 'partsCost', labelKey: 'reports.colPartsCost', format: 'money', align: 'end' },
      { key: 'oilCost', labelKey: 'reports.colOilCost', format: 'money', align: 'end' },
      { key: 'laborCost', labelKey: 'reports.colLaborCost', format: 'money', align: 'end' },
      { key: 'transportCost', labelKey: 'reports.colTransportCost', format: 'money', align: 'end' },
      { key: 'totalCost', labelKey: 'reports.colTotalCost', format: 'money', align: 'end' },
    ],
  },
  {
    kind: 'customerStatement',
    id: 'customer-statement',
    titleKey: 'reports.customerStatementTitle',
    descriptionKey: 'reports.customerStatementDescription',
    permission: 'reports:customerStatement',
    endpoint: '/api/reports/customer-statement',
    filters: ['customer', 'dateRange'],
  },
  {
    kind: 'table',
    id: 'uncollected-extracts',
    titleKey: 'reports.uncollectedExtractsTitle',
    descriptionKey: 'reports.uncollectedExtractsDescription',
    permission: 'reports:uncollectedExtracts',
    endpoint: '/api/reports/uncollected-extracts',
    filters: ['customer', 'dateRange'],
    columns: [
      { key: 'extractNumber', labelKey: 'reports.colExtractNumber' },
      { key: 'customer', labelKey: 'reports.colCustomer' },
      { key: 'total', labelKey: 'reports.colTotal', format: 'money', align: 'end' },
      { key: 'collected', labelKey: 'reports.colCollected', format: 'money', align: 'end' },
      { key: 'remaining', labelKey: 'reports.colRemaining', format: 'money', align: 'end' },
      { key: 'status', labelKey: 'reports.colStatus' },
    ],
  },
  {
    kind: 'table',
    id: 'expenses',
    titleKey: 'reports.expensesTitle',
    descriptionKey: 'reports.expensesDescription',
    permission: 'reports:expenses',
    endpoint: '/api/reports/expenses',
    filters: ['dateRange', 'category', 'project', 'generator'],
    columns: [
      { key: 'date', labelKey: 'reports.colDate', format: 'date' },
      { key: 'category', labelKey: 'reports.colCategory' },
      { key: 'description', labelKey: 'reports.colDescription' },
      { key: 'generator', labelKey: 'reports.colGenerator' },
      { key: 'project', labelKey: 'reports.colProject' },
      { key: 'amount', labelKey: 'reports.colAmount', format: 'money', align: 'end' },
    ],
  },
  {
    kind: 'profitExpenseSummary',
    id: 'profit-expense-summary',
    titleKey: 'reports.profitExpenseSummaryTitle',
    descriptionKey: 'reports.profitExpenseSummaryDescription',
    permission: 'reports:profitExpenseSummary',
    endpoint: '/api/reports/profit-expense-summary',
    filters: ['dateRange', 'generator', 'project'],
  },
];
