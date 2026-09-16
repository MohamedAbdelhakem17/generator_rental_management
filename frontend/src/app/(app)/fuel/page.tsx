'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { createColumnHelper } from '@tanstack/react-table';
import { AlertTriangle, HelpCircle, Plus } from 'lucide-react';
import { Suspense, useState } from 'react';

import { DataTable } from '@/components/data-table/data-table';
import {
  DateRangeFilter,
  type DateRangeValue,
} from '@/components/data-table/filters/date-range-filter';
import { SelectFilter } from '@/components/data-table/filters/select-filter';
import { DataTablePagination } from '@/components/data-table/pagination';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDataTableQuery } from '@/hooks/useDataTableQuery';
import { apiClient } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { useSession } from '@/lib/session/session-provider';
import { STATUS_TONE_CLASSES, type StatusTone } from '@/lib/status-tone';
import { cn } from '@/lib/utils';
import type { GeneratorRow } from '../generators/types';
import type { ProjectRow } from '../projects/types';
import { FuelAlertsTab } from './fuel-alerts-tab';
import { FuelEntryForm } from './fuel-entry-form';
import type { FuelLogRow } from './types';

const columnHelper = createColumnHelper<FuelLogRow>();

/** Presentational only — mirrors Business Rule 6.5's documented default bands (15%/30% over
 * normal) so the row reads consistently with what the Fuel Alert Engine (TASK-017) will flag,
 * without this table re-deriving or persisting any alert decision itself. */
function varianceTone(rate: number, normal: number): { value: number | null; tone: StatusTone } {
  if (normal <= 0) return { value: null, tone: 'neutral' };
  const overPercent = ((rate - normal) / normal) * 100;
  if (overPercent > 30) return { value: overPercent, tone: 'danger' };
  if (overPercent > 15) return { value: overPercent, tone: 'warning' };
  return { value: overPercent, tone: 'success' };
}

function VarianceBadge({ rate, normal }: { rate: number | null; normal: number }) {
  const { t } = useLocale();
  if (rate === null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <HelpCircle className="size-3.5" aria-hidden />
            {t('fuel.notAvailable')}
          </span>
        </TooltipTrigger>
        <TooltipContent>{t('fuel.varianceNaTooltip')}</TooltipContent>
      </Tooltip>
    );
  }

  const { value, tone } = varianceTone(rate, normal);
  const classes = STATUS_TONE_CLASSES[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium',
        classes.bg,
        classes.fg,
        classes.border,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', classes.dot)} aria-hidden />
      {value === null
        ? t('fuel.varianceUnavailable')
        : value > 0
          ? t('fuel.varianceAbove', { value: value.toFixed(0) })
          : t('fuel.varianceValue', { value: value.toFixed(0) })}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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
  const { t } = useLocale();
  const { user } = useSession();
  const canWrite = user?.permissions.includes('fuel:write') ?? false;
  const canViewAlerts = user?.permissions.includes('fuel-alerts:read') ?? false;

  const [isEntering, setIsEntering] = useState(false);

  const { data: generators } = useQuery({
    queryKey: ['generators', 'select'],
    queryFn: ({ signal }) =>
      apiClient.getPaginated<GeneratorRow>('/api/generators', { limit: 100, sort: 'code' }, signal),
  });
  const { data: projects } = useQuery({
    queryKey: ['projects', 'select', 'all'],
    queryFn: ({ signal }) =>
      apiClient.getPaginated<ProjectRow>('/api/projects', { limit: 100, sort: 'name' }, signal),
  });

  const table = useDataTableQuery<FuelLogRow>({
    queryKey: 'fuel',
    queryFn: (params, signal) =>
      apiClient.getPaginated<FuelLogRow>(
        '/api/fuel',
        { page: params.page, limit: params.limit, sort: params.sort, ...params.filters },
        signal,
      ),
    defaultSort: '-date',
  });

  const dateRange: DateRangeValue = { from: table.filters.dateFrom, to: table.filters.dateTo };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<FuelLogRow, any>[] = [
    columnHelper.accessor('date', {
      header: t('fuel.columnDate'),
      cell: (info) => formatDate(info.getValue()),
    }),
    columnHelper.accessor((row) => row.generator.code, {
      id: 'generator',
      header: t('fuel.columnGenerator'),
      enableSorting: false,
    }),
    columnHelper.accessor('liters', {
      header: t('fuel.columnLiters'),
      cell: (info) => <span className="tabular-data">{info.getValue()}</span>,
    }),
    columnHelper.accessor('pricePerLiter', {
      header: t('fuel.columnPricePerLiter'),
      enableSorting: false,
      cell: (info) => <span className="tabular-data">{info.getValue()}</span>,
    }),
    columnHelper.accessor('totalCost', {
      header: t('fuel.columnTotalCost'),
      cell: (info) => <span className="tabular-data">{info.getValue()}</span>,
    }),
    columnHelper.accessor('consumptionRate', {
      header: t('fuel.columnConsumption'),
      enableSorting: false,
      cell: (info) =>
        info.getValue() === null ? (
          <span className="tabular-data text-muted-foreground">{t('fuel.notAvailable')}</span>
        ) : (
          <span className="tabular-data">{t('fuel.rateValue', { value: info.getValue()! })}</span>
        ),
    }),
    columnHelper.display({
      id: 'variance',
      header: () => (
        <span className="inline-flex items-center gap-1">
          {t('fuel.columnVariance')}
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertTriangle className="size-3.5 text-muted-foreground" aria-hidden />
            </TooltipTrigger>
            <TooltipContent>{t('fuel.varianceHeaderTooltip')}</TooltipContent>
          </Tooltip>
        </span>
      ),
      cell: ({ row }) => (
        <VarianceBadge
          rate={row.original.consumptionRate}
          normal={row.original.generator.normalFuelConsumption}
        />
      ),
    }),
  ];

  return (
    <>
      <PageHeader
        title={t('fuel.title')}
        description={t('fuel.description')}
        action={
          canWrite ? (
            <Button size="sm" onClick={() => setIsEntering(true)}>
              <Plus className="size-4" aria-hidden />
              {t('fuel.newEntry')}
            </Button>
          ) : undefined
        }
      />

      {canViewAlerts ? (
        <Tabs defaultValue="fillups" className="flex flex-col gap-4">
          <TabsList>
            <TabsTrigger value="fillups">{t('fuel.tabFillups')}</TabsTrigger>
            <TabsTrigger value="alerts">{t('fuel.tabAlerts')}</TabsTrigger>
          </TabsList>

          <TabsContent value="fillups" className="flex flex-col gap-4">
            <FuelFiltersAndTable
              table={table}
              dateRange={dateRange}
              generators={generators}
              projects={projects}
              columns={columns}
              canWrite={canWrite}
            />
          </TabsContent>

          <TabsContent value="alerts">
            <FuelAlertsTab />
          </TabsContent>
        </Tabs>
      ) : (
        <FuelFiltersAndTable
          table={table}
          dateRange={dateRange}
          generators={generators}
          projects={projects}
          columns={columns}
          canWrite={canWrite}
        />
      )}

      {canWrite ? <FuelEntryForm open={isEntering} onOpenChange={setIsEntering} /> : null}
    </>
  );
}

function FuelFiltersAndTable({
  table,
  dateRange,
  generators,
  projects,
  columns,
  canWrite,
}: {
  table: ReturnType<typeof useDataTableQuery<FuelLogRow>>;
  dateRange: DateRangeValue;
  generators: { items: GeneratorRow[] } | undefined;
  projects: { items: ProjectRow[] } | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<FuelLogRow, any>[];
  canWrite: boolean;
}) {
  const { t } = useLocale();
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SelectFilter
          value={table.filters.generatorId}
          onChange={(value) => table.setFilter('generatorId', value)}
          options={(generators?.items ?? []).map((generator) => ({
            value: generator.id,
            label: generator.code,
          }))}
          placeholder={t('fuel.generatorFilterPlaceholder')}
          allLabel={t('fuel.allGeneratorsLabel')}
        />
        <SelectFilter
          value={table.filters.projectId}
          onChange={(value) => table.setFilter('projectId', value)}
          options={(projects?.items ?? []).map((project) => ({
            value: project.id,
            label: project.name,
          }))}
          placeholder={t('fuel.projectFilterPlaceholder')}
          allLabel={t('fuel.allProjectsLabel')}
        />
        <DateRangeFilter
          value={dateRange}
          onChange={(next) => {
            table.setFilter('dateFrom', next.from);
            table.setFilter('dateTo', next.to);
          }}
          placeholder={t('table.dateRange')}
        />
        {table.hasActiveFilters ? (
          <Button variant="ghost" size="sm" onClick={table.clearFilters}>
            {t('table.clearFilters')}
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
        emptyTitle={t('fuel.emptyTitle')}
        emptyDescription={
          canWrite ? t('fuel.emptyDescriptionWrite') : t('fuel.emptyDescriptionReadOnly')
        }
      />

      <DataTablePagination
        meta={table.meta}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
      />
    </>
  );
}
