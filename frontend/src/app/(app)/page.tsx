'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Link from 'next/link';
import { Suspense, useState } from 'react';

import { DateRangeFilter, type DateRangeValue } from '@/components/data-table/filters/date-range-filter';
import { SelectFilter } from '@/components/data-table/filters/select-filter';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { PageHeader } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { cn } from '@/lib/utils';
import type { DashboardSummary } from './dashboard-types';
import { CustomerCombobox } from './projects/customer-combobox';
import type { ProjectRow } from './projects/types';

function currentMonthRange(): DateRangeValue {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}

function KpiCard({ label, value, tone }: { label: string; value: string | number; tone?: 'danger' }) {
  return (
    <div className="flex flex-col justify-between gap-1.5 rounded-lg border border-border bg-surface p-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className={cn('tabular-data text-2xl font-semibold', tone === 'danger' ? 'text-destructive' : 'text-foreground')}>
        {value}
      </span>
    </div>
  );
}

function AlertWidget({ label, count, href }: { label: string; count: number; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-muted"
    >
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span
        className={cn(
          'tabular-data flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-sm font-semibold',
          count > 0 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
        )}
      >
        {count}
      </span>
    </Link>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <DashboardPageContent />
    </Suspense>
  );
}

function DashboardPageContent() {
  const { t } = useLocale();
  const [period, setPeriod] = useState<DateRangeValue>(currentMonthRange());
  const [projectId, setProjectId] = useState<string | undefined>();
  const [customerId, setCustomerId] = useState('');

  const { data: projects } = useQuery({
    queryKey: ['projects', 'select', 'dashboard'],
    queryFn: ({ signal }) =>
      apiClient.getPaginated<ProjectRow>('/api/projects', { limit: 100, sort: 'name' }, signal),
  });
  const projectOptions = (projects?.items ?? []).map((project) => ({
    value: project.id,
    label: `${project.code} — ${project.name}`,
  }));

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard', { from: period.from, to: period.to, projectId, customerId }],
    queryFn: ({ signal }) =>
      apiClient.get<DashboardSummary>(
        '/api/dashboard',
        { from: period.from, to: period.to, projectId, customerId: customerId || undefined },
        signal,
      ),
  });

  return (
    <>
      <PageHeader title={t('dashboard.title')} description={t('dashboard.overviewDescription')} />

      <div className="flex flex-wrap items-center gap-2">
        <DateRangeFilter value={period} onChange={setPeriod} placeholder={t('dashboard.periodPlaceholder')} />
        <SelectFilter
          value={projectId}
          onChange={setProjectId}
          options={projectOptions}
          placeholder={t('dashboard.projectPlaceholder')}
          allLabel={t('dashboard.allProjectsLabel')}
        />
        <CustomerCombobox value={customerId} onSelect={(customer) => setCustomerId(customer.id)} />
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : isError || !data ? (
        <ErrorState title={t('dashboard.loadFailedTitle')} onRetry={refetch} />
      ) : (
        <DashboardBody data={data} />
      )}
    </>
  );
}

function DashboardBody({ data }: { data: DashboardSummary }) {
  const { t } = useLocale();

  const chartTooltipStyle = {
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--popover)',
    fontSize: 12,
  };

  const extractStatusColors = ['var(--chart-series-1)', 'var(--chart-series-2)', 'var(--chart-series-3)'];

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-foreground">{t('dashboard.fleetSection')}</h2>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard label={t('dashboard.kpiTotalGenerators')} value={data.fleet.total} />
          <KpiCard label={t('dashboard.kpiAvailable')} value={data.fleet.available} />
          <KpiCard label={t('dashboard.kpiRented')} value={data.fleet.rented} />
          <KpiCard label={t('dashboard.kpiUnderMaintenance')} value={data.fleet.underMaintenance} />
          <KpiCard label={t('dashboard.kpiStopped')} value={data.fleet.stopped} tone={data.fleet.stopped > 0 ? 'danger' : undefined} />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-foreground">{t('dashboard.financialSection')}</h2>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard label={t('dashboard.kpiRevenue')} value={data.financial.revenue} />
          <KpiCard label={t('dashboard.kpiReceipts')} value={data.financial.receipts} />
          <KpiCard label={t('dashboard.kpiOutstanding')} value={data.financial.outstanding} />
          <KpiCard label={t('dashboard.kpiExpenses')} value={data.financial.expenses} />
          <KpiCard
            label={t('dashboard.kpiNetProfit')}
            value={data.financial.netProfit}
            tone={Number(data.financial.netProfit) < 0 ? 'danger' : undefined}
          />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-foreground">{t('dashboard.operationalSection')}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard label={t('dashboard.kpiOperatingHours')} value={data.operations.operatingHours} />
          <KpiCard label={t('dashboard.kpiFuelConsumption')} value={data.operations.fuelConsumption} />
          <KpiCard label={t('dashboard.kpiMaintenanceCost')} value={data.operations.maintenanceCost} />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-foreground">{t('dashboard.alertsSection')}</h2>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <AlertWidget label={t('dashboard.alertExpiringContracts')} count={data.alerts.expiringContracts} href="/contracts" />
          <AlertWidget label={t('dashboard.alertOverdueCustomers')} count={data.alerts.overdueCustomers} href="/customers" />
          <AlertWidget label={t('dashboard.alertMaintenance')} count={data.alerts.maintenance} href="/maintenance" />
          <AlertWidget label={t('dashboard.alertStoppedGenerators')} count={data.alerts.stoppedGenerators} href="/generators?status=Stopped" />
          <AlertWidget label={t('dashboard.alertAbnormalFuel')} count={data.alerts.abnormalFuel} href="/fuel" />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-medium text-foreground">{t('dashboard.chartRevenueTrend')}</h2>
          {data.charts.revenueTrend.length === 0 ? (
            <EmptyState title={t('dashboard.chartEmptyTitle')} />
          ) : (
            <div className="mt-2 h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.charts.revenueTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} width={48} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Line type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3, fill: 'var(--primary)' }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-medium text-foreground">{t('dashboard.chartExtractStatus')}</h2>
          {data.charts.extractStatus.length === 0 ? (
            <EmptyState title={t('dashboard.chartEmptyTitle')} />
          ) : (
            <div className="mt-2 flex h-56 w-full items-center gap-4">
              <ResponsiveContainer width="60%" height="100%">
                <PieChart>
                  <Pie data={data.charts.extractStatus} dataKey="value" nameKey="status" innerRadius={40} outerRadius={70} strokeWidth={2} stroke="var(--surface)">
                    {data.charts.extractStatus.map((entry, index) => (
                      <Cell key={entry.status} fill={extractStatusColors[index % extractStatusColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="flex flex-col gap-1.5 text-xs">
                {data.charts.extractStatus.map((entry, index) => (
                  <li key={entry.status} className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: extractStatusColors[index % extractStatusColors.length] }} aria-hidden />
                    <span className="text-foreground">{entry.status}</span>
                    <span className="tabular-data text-muted-foreground">({entry.value})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-medium text-foreground">{t('dashboard.chartTopUtilized')}</h2>
          {data.charts.topGeneratorsUtilization.length === 0 ? (
            <EmptyState title={t('dashboard.chartEmptyTitle')} />
          ) : (
            <div className="mt-2 h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.charts.topGeneratorsUtilization} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                  <YAxis type="category" dataKey="generatorCode" tick={{ fontSize: 12, fill: 'var(--foreground)' }} tickLine={false} axisLine={false} width={70} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar dataKey="utilization" fill="var(--chart-series-1)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-medium text-foreground">{t('dashboard.chartTopProfitable')}</h2>
          {data.charts.topGeneratorsProfitability.length === 0 ? (
            <EmptyState title={t('dashboard.chartEmptyTitle')} />
          ) : (
            <div className="mt-2 h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.charts.topGeneratorsProfitability.map((entry) => ({ ...entry, netProfitValue: Number(entry.netProfit) }))}
                  layout="vertical"
                  margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                  <YAxis type="category" dataKey="generatorCode" tick={{ fontSize: 12, fill: 'var(--foreground)' }} tickLine={false} axisLine={false} width={70} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar dataKey="netProfitValue" fill="var(--chart-series-2)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
