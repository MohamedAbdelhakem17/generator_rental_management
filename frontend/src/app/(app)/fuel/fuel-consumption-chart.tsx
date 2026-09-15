'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { apiClient } from '@/lib/apiClient';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import type { FuelLogRow } from './types';

export interface FuelConsumptionChartProps {
  generatorId: string;
  normalFuelConsumption: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface TooltipPayloadEntry {
  value: number | null;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const rate = payload[0]?.value;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium text-popover-foreground tabular-data">{rate === null || rate === undefined ? 'N/A' : `${rate} L/h`}</p>
    </div>
  );
}

/** Section 13: a "mini-chart" — one series (consumption rate) plus a normal-rate reference line, no legend needed. */
export function FuelConsumptionChart({ generatorId, normalFuelConsumption }: FuelConsumptionChartProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['fuel', { generatorId, chart: true }],
    queryFn: ({ signal }) =>
      apiClient.getPaginated<FuelLogRow>('/api/fuel', { generatorId, limit: 20, sort: 'date' }, signal),
  });

  if (isLoading) {
    return <Skeleton className="h-52 w-full" />;
  }

  if (!data || data.items.length === 0) {
    return <EmptyState title="No fuel logs yet" description="Consumption rate over time shows up here once fill-ups are logged." />;
  }

  const points = data.items.map((log) => ({ date: formatDate(log.date), rate: log.consumptionRate }));

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">Consumption rate</h2>
        <span className="text-xs text-muted-foreground">Normal: {normalFuelConsumption} L/h</span>
      </div>
      <div className="mt-2 h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} width={36} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border)' }} />
            <ReferenceLine y={normalFuelConsumption} stroke="var(--status-maintenance-fg)" strokeDasharray="4 4" ifOverflow="extendDomain" />
            <Line
              type="monotone"
              dataKey="rate"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={{ r: 3, fill: 'var(--primary)' }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
