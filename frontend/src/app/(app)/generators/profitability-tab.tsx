'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/apiClient';
import {
  DateRangeFilter,
  type DateRangeValue,
} from '@/components/data-table/filters/date-range-filter';
import { useLocale } from '@/lib/i18n/locale-provider';
import { cn } from '@/lib/utils';

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

const SERIES_COLORS = [
  'var(--chart-series-1)',
  'var(--chart-series-2)',
  'var(--chart-series-3)',
  'var(--chart-series-4)',
  'var(--chart-series-5)',
];

interface CostBar {
  key: keyof ProfitabilityCostBreakdown;
  labelKey: 'generators.costFuel' | 'generators.costMaintenance' | 'generators.costTransport' | 'generators.costLabor' | 'generators.costParts';
  value: number;
}

interface TooltipEntry {
  payload: CostBar;
}

function CostTooltip({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) {
  const { t } = useLocale();
  if (!active || !payload?.length) return null;
  const entry = payload[0]?.payload;
  if (!entry) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <p className="text-popover-foreground font-medium">{t(entry.labelKey)}</p>
      <p className="tabular-data text-muted-foreground">{entry.value.toFixed(2)}</p>
    </div>
  );
}

export function ProfitabilityTab({ generatorId }: { generatorId: string }) {
  const { t } = useLocale();
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10);
  const defaultTo = now.toISOString().slice(0, 10);

  const [period, setPeriod] = useState<DateRangeValue>({ from: defaultFrom, to: defaultTo });

  const from = period.from ?? defaultFrom;
  const to = period.to ?? defaultTo;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['profitability', { generatorId, from, to }],
    queryFn: ({ signal }) =>
      apiClient.get<ProfitabilityResult>('/api/profitability', { generatorId, from, to }, signal),
  });

  const bars: CostBar[] = data
    ? [
        { key: 'fuel', labelKey: 'generators.costFuel', value: Number(data.cost.fuel) },
        { key: 'maintenance', labelKey: 'generators.costMaintenance', value: Number(data.cost.maintenance) },
        { key: 'transport', labelKey: 'generators.costTransport', value: Number(data.cost.transport) },
        { key: 'labor', labelKey: 'generators.costLabor', value: Number(data.cost.labor) },
        { key: 'parts', labelKey: 'generators.costParts', value: Number(data.cost.parts) },
      ]
    : [];

  const chartData = bars.map((bar) => ({ ...bar, name: t(bar.labelKey) }));
  const netProfit = data ? Number(data.netProfit) : 0;
  const isLoss = netProfit < 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DateRangeFilter value={period} onChange={setPeriod} placeholder={t('generators.profitabilityPeriodPlaceholder')} />
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : isError || !data ? (
        <EmptyState
          title={t('generators.profitabilityLoadFailedTitle')}
          description={t('generators.profitabilityLoadFailedDescription')}
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <KpiCard label={t('generators.kpiRevenue')} value={data.revenue} />
            <KpiCard
              label={t('generators.kpiTotalCost')}
              value={bars.reduce((sum, bar) => sum + bar.value, 0).toFixed(2)}
            />
            <div
              className={cn(
                'flex flex-col justify-between gap-2 rounded-lg border p-4',
                isLoss
                  ? 'border-destructive/40 bg-destructive/10'
                  : 'border-border bg-surface',
              )}
            >
              <span className="text-xs font-medium text-muted-foreground">{t('generators.kpiNetProfit')}</span>
              <span
                className={cn(
                  'tabular-data text-2xl font-semibold',
                  isLoss ? 'text-destructive' : 'text-foreground',
                )}
              >
                {data.netProfit}
              </span>
              {isLoss ? (
                <p className="text-xs font-medium text-destructive">
                  {t('generators.costExceedsRevenueWarning')}
                </p>
              ) : null}
            </div>
          </div>

          {Number(data.unallocatedExpenses) > 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('generators.unallocatedExpensesNote', { amount: data.unallocatedExpenses })}
            </p>
          ) : null}

          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-sm font-medium text-foreground">{t('generators.costBreakdownTitle')}</h2>
            <div className="mt-2 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border)' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 12, fill: 'var(--foreground)' }}
                    tickLine={false}
                    axisLine={false}
                    width={90}
                  />
                  <Tooltip content={<CostTooltip />} cursor={{ fill: 'var(--muted)' }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                    {chartData.map((entry, index) => (
                      <Cell key={entry.key} fill={SERIES_COLORS[index % SERIES_COLORS.length]} />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="right"
                      className="tabular-data"
                      style={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      formatter={(value) => (typeof value === 'number' ? value.toFixed(2) : value)}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col justify-between gap-2 rounded-lg border border-border bg-surface p-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="tabular-data text-2xl font-semibold text-foreground">{value}</span>
    </div>
  );
}
