'use client';

import { Suspense } from 'react';
import { useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, HelpCircle, Plus } from 'lucide-react';

import { apiClient } from '@/lib/apiClient';
import { useDataTableQuery } from '@/hooks/useDataTableQuery';
import { useSession } from '@/lib/session/session-provider';
import { cn } from '@/lib/utils';
import { STATUS_TONE_CLASSES, type StatusTone } from '@/lib/status-tone';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { DataTablePagination } from '@/components/data-table/pagination';
import { SelectFilter } from '@/components/data-table/filters/select-filter';
import { DateRangeFilter, type DateRangeValue } from '@/components/data-table/filters/date-range-filter';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import type { GeneratorRow } from '../generators/types';
import type { ProjectRow } from '../projects/types';
import { FuelEntryForm } from './fuel-entry-form';
import type { FuelLogRow } from './types';

const columnHelper = createColumnHelper<FuelLogRow>();

/** Presentational only — mirrors Business Rule 6.5's documented default bands (15%/30% over
 * normal) so the row reads consistently with what the Fuel Alert Engine (TASK-017) will flag,
 * without this table re-deriving or persisting any alert decision itself. */
function varianceTone(rate: number, normal: number): { label: string; tone: StatusTone } {
  if (normal <= 0) return { label: '—', tone: 'neutral' };
  const overPercent = ((rate - normal) / normal) * 100;
  if (overPercent > 30) return { label: `+${overPercent.toFixed(0)}%`, tone: 'danger' };
  if (overPercent > 15) return { label: `+${overPercent.toFixed(0)}%`, tone: 'warning' };
  return { label: overPercent > 0 ? `+${overPercent.toFixed(0)}%` : `${overPercent.toFixed(0)}%`, tone: 'success' };
}

function VarianceBadge({ rate, normal }: { rate: number | null; normal: number }) {
  if (rate === null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <HelpCircle className="size-3.5" aria-hidden />
            N/A
          </span>
        </TooltipTrigger>
        <TooltipContent>No operating hours recorded in this fill-up&apos;s reference window.</TooltipContent>
      </Tooltip>
    );
  }

  const { label, tone } = varianceTone(rate, normal);
  const classes = STATUS_TONE_CLASSES[tone];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium', classes.bg, classes.fg, classes.border)}>
      <span className={cn('size-1.5 shrink-0 rounded-full', classes.dot)} aria-hidden />
      {label}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function FuelPage() {
  // useDataTableQuery reads useSearchParams(), which needs a Suspense boundary (TASK-005).
  return (
    <Suspense fallback={null}>
      <FuelPageContent />
    </Suspense>
  );
}

function FuelPageContent() {
  const { user } = useSession();
  const canWrite = user?.permissions.includes('fuel:write') ?? false;

  const [isEntering, setIsEntering] = useState(false);

  const { data: generators } = useQuery({
    queryKey: ['generators', 'select'],
    queryFn: ({ signal }) => apiClient.getPaginated<GeneratorRow>('/api/generators', { limit: 100, sort: 'code' }, signal),
  });
  const { data: projects } = useQuery({
    queryKey: ['projects', 'select', 'all'],
    queryFn: ({ signal }) => apiClient.getPaginated<ProjectRow>('/api/projects', { limit: 100, sort: 'name' }, signal),
  });

  const table = useDataTableQuery<FuelLogRow>({
    queryKey: 'fuel',
    queryFn: (params, signal) =>
      apiClient.getPaginated<FuelLogRow>('/api/fuel', { page: params.page, limit: params.limit, sort: params.sort, ...params.filters }, signal),
    defaultSort: '-date',
  });

  const dateRange: DateRangeValue = { from: table.filters.dateFrom, to: table.filters.dateTo };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<FuelLogRow, any>[] = [
    columnHelper.accessor('date', { header: 'Date', cell: (info) => formatDate(info.getValue()) }),
    columnHelper.accessor((row) => row.generator.code, { id: 'generator', header: 'Generator', enableSorting: false }),
    columnHelper.accessor('liters', { header: 'Liters', cell: (info) => <span className="tabular-data">{info.getValue()}</span> }),
    columnHelper.accessor('pricePerLiter', { header: 'Price / L', enableSorting: false, cell: (info) => <span className="tabular-data">{info.getValue()}</span> }),
    columnHelper.accessor('totalCost', { header: 'Total cost', cell: (info) => <span className="tabular-data">{info.getValue()}</span> }),
    columnHelper.accessor('consumptionRate', {
      header: 'Consumption',
      enableSorting: false,
      cell: (info) => (info.getValue() === null ? <span className="tabular-data text-muted-foreground">N/A</span> : <span className="tabular-data">{info.getValue()} L/h</span>),
    }),
    columnHelper.display({
      id: 'variance',
      header: () => (
        <span className="inline-flex items-center gap-1">
          Variance
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertTriangle className="size-3.5 text-muted-foreground" aria-hidden />
            </TooltipTrigger>
            <TooltipContent>How far the consumption rate is above the generator&apos;s normal rate.</TooltipContent>
          </Tooltip>
        </span>
      ),
      cell: ({ row }) => <VarianceBadge rate={row.original.consumptionRate} normal={row.original.generator.normalFuelConsumption} />,
    }),
  ];

  return (
    <>
      <PageHeader
        title="Fuel"
        description="Fill-ups, cost, and consumption rate — the largest variable operating cost."
        action={
          canWrite ? (
            <Button size="sm" onClick={() => setIsEntering(true)}>
              <Plus className="size-4" aria-hidden />
              New entry
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SelectFilter
          value={table.filters.generatorId}
          onChange={(value) => table.setFilter('generatorId', value)}
          options={(generators?.items ?? []).map((generator) => ({ value: generator.id, label: generator.code }))}
          placeholder="Generator"
          allLabel="All generators"
        />
        <SelectFilter
          value={table.filters.projectId}
          onChange={(value) => table.setFilter('projectId', value)}
          options={(projects?.items ?? []).map((project) => ({ value: project.id, label: project.name }))}
          placeholder="Project"
          allLabel="All projects"
        />
        <DateRangeFilter
          value={dateRange}
          onChange={(next) => {
            table.setFilter('dateFrom', next.from);
            table.setFilter('dateTo', next.to);
          }}
          placeholder="Date range"
        />
        {table.hasActiveFilters ? (
          <Button variant="ghost" size="sm" onClick={table.clearFilters}>
            Clear filters
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        data={table.items}
        getRowId={(row) => row.id}
        isLoading={table.isLoading}
        isError={table.isError}
        onRetry={table.refetch}
        sort={table.sort}
        onToggleSort={table.toggleSort}
        hasActiveFilters={table.hasActiveFilters}
        onClearFilters={table.clearFilters}
        showColumnVisibility={false}
        emptyTitle="No fuel logs yet"
        emptyDescription={canWrite ? 'Log the first fill-up to start tracking fuel cost.' : 'Entries will appear here once logged.'}
      />

      <DataTablePagination meta={table.meta} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />

      {canWrite ? <FuelEntryForm open={isEntering} onOpenChange={setIsEntering} /> : null}
    </>
  );
}
