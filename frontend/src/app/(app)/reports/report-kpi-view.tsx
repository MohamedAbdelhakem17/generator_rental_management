'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { cn } from '@/lib/utils';
import type { KpiReportDefinition } from './report-definitions';
import { ReportFilters, type ReportFilterState } from './report-filters';

interface ProfitabilityResult {
  revenue: string;
  cost: { fuel: string; maintenance: string; transport: string; labor: string; parts: string };
  unallocatedExpenses: string;
  netProfit: string;
}

interface ProfitExpenseSummaryResult {
  revenue: string;
  expenses: string;
  netProfit: string;
}

function KpiCard({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className="flex flex-col justify-between gap-1.5 rounded-lg border border-border bg-surface p-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className={cn('tabular-data text-2xl font-semibold', tone === 'danger' ? 'text-destructive' : 'text-foreground')}>
        {value}
      </span>
    </div>
  );
}

export function ReportKpiView({ definition }: { definition: KpiReportDefinition }) {
  const { t } = useLocale();
  const [filters, setFilters] = useState<ReportFilterState>({});

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reports', definition.id, filters],
    queryFn: ({ signal }) =>
      apiClient.get<{ items: (ProfitabilityResult | ProfitExpenseSummaryResult)[] }>(
        definition.endpoint,
        {
          from: filters.from,
          to: filters.to,
          projectId: filters.projectId,
          generatorId: filters.generatorId,
        },
        signal,
      ),
  });

  const item = data?.items[0];

  return (
    <div className="flex flex-col gap-4">
      <ReportFilters kinds={definition.filters} value={filters} onChange={setFilters} />

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : isError || !item ? (
        isError ? (
          <ErrorState title={t('reports.loadFailedTitle')} onRetry={refetch} />
        ) : (
          <EmptyState title={t('reports.emptyTitle')} description={t('reports.emptyDescription')} />
        )
      ) : definition.kind === 'profitability' ? (
        <ProfitabilityCards item={item as ProfitabilityResult} />
      ) : (
        <ProfitExpenseSummaryCards item={item as ProfitExpenseSummaryResult} />
      )}
    </div>
  );
}

function ProfitabilityCards({ item }: { item: ProfitabilityResult }) {
  const { t } = useLocale();
  const isLoss = Number(item.netProfit) < 0;
  return (
    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <KpiCard label={t('reports.kpiRevenue')} value={item.revenue} />
      <KpiCard label={t('reports.kpiFuelCost')} value={item.cost.fuel} />
      <KpiCard label={t('reports.kpiMaintenanceCost')} value={item.cost.maintenance} />
      <KpiCard label={t('reports.kpiTransportCost')} value={item.cost.transport} />
      <KpiCard label={t('reports.kpiLaborCost')} value={item.cost.labor} />
      <KpiCard label={t('reports.kpiPartsCost')} value={item.cost.parts} />
      <KpiCard label={t('reports.kpiUnallocatedExpenses')} value={item.unallocatedExpenses} />
      <KpiCard label={t('reports.kpiNetProfit')} value={item.netProfit} tone={isLoss ? 'danger' : undefined} />
    </div>
  );
}

function ProfitExpenseSummaryCards({ item }: { item: ProfitExpenseSummaryResult }) {
  const { t } = useLocale();
  const isLoss = Number(item.netProfit) < 0;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <KpiCard label={t('reports.kpiRevenue')} value={item.revenue} />
      <KpiCard label={t('reports.kpiExpenses')} value={item.expenses} />
      <KpiCard label={t('reports.kpiNetProfit')} value={item.netProfit} tone={isLoss ? 'danger' : undefined} />
    </div>
  );
}
