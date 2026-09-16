'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { createColumnHelper } from '@tanstack/react-table';
import { CheckCircle2, MoreHorizontal, Pencil, PlayCircle, Plus, XCircle } from 'lucide-react';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';

import { createActionsColumn } from '@/components/data-table/columns';
import { DataTable } from '@/components/data-table/data-table';
import {
  DateRangeFilter,
  type DateRangeValue,
} from '@/components/data-table/filters/date-range-filter';
import { SelectFilter } from '@/components/data-table/filters/select-filter';
import { DataTablePagination } from '@/components/data-table/pagination';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDataTableQuery } from '@/hooks/useDataTableQuery';
import { apiClient, ApiError } from '@/lib/apiClient';
import type { TranslationKey } from '@/lib/i18n/dictionary';
import { useLocale } from '@/lib/i18n/locale-provider';
import { useSession } from '@/lib/session/session-provider';
import { STATUS_TONE_CLASSES, type StatusTone } from '@/lib/status-tone';
import { cn } from '@/lib/utils';
import type { GeneratorRow } from '../generators/types';
import { CancelDialog } from './cancel-dialog';
import { MaintenanceAlertsTab } from './maintenance-alerts-tab';
import { MaintenanceFormDialog } from './maintenance-form-dialog';
import type { MaintenanceRow, MaintenanceStatus } from './types';

const columnHelper = createColumnHelper<MaintenanceRow>();

const STATUS_TONES: Record<MaintenanceStatus, StatusTone> = {
  Open: 'warning',
  'In Progress': 'info',
  Completed: 'success',
  Cancelled: 'neutral',
};

const STATUS_LABEL_KEYS: Record<MaintenanceStatus, TranslationKey> = {
  Open: 'maintenance.statusOpen',
  'In Progress': 'maintenance.statusInProgress',
  Completed: 'maintenance.statusCompleted',
  Cancelled: 'maintenance.statusCancelled',
};

function StatusBadge({ status }: { status: MaintenanceStatus }) {
  const { t } = useLocale();
  const tone = STATUS_TONE_CLASSES[STATUS_TONES[status]];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium',
        tone.bg,
        tone.fg,
        tone.border,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />
      {t(STATUS_LABEL_KEYS[status])}
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

export default function MaintenancePage() {
  // useDataTableQuery reads useSearchParams(), which needs a Suspense boundary (TASK-005).
  return (
    <Suspense fallback={null}>
      <MaintenancePageContent />
    </Suspense>
  );
}

function MaintenancePageContent() {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const canWrite = user?.permissions.includes('maintenance:write') ?? false;
  const canComplete = user?.permissions.includes('maintenance:complete') ?? false;
  const canViewAlerts = user?.permissions.includes('maintenance-alerts:read') ?? false;

  const [isOpening, setIsOpening] = useState(false);
  const [editTarget, setEditTarget] = useState<MaintenanceRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MaintenanceRow | null>(null);

  const { data: generators } = useQuery({
    queryKey: ['generators', 'select'],
    queryFn: ({ signal }) =>
      apiClient.getPaginated<GeneratorRow>('/api/generators', { limit: 100, sort: 'code' }, signal),
  });

  const table = useDataTableQuery<MaintenanceRow>({
    queryKey: 'maintenance',
    queryFn: (params, signal) =>
      apiClient.getPaginated<MaintenanceRow>(
        '/api/maintenance',
        { page: params.page, limit: params.limit, sort: params.sort, ...params.filters },
        signal,
      ),
    defaultSort: '-date',
  });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['maintenance'] });
  }

  async function start(record: MaintenanceRow) {
    try {
      await apiClient.post(`/api/maintenance/${record.id}/start`);
      toast.success(t('maintenance.startedToast', { code: record.generator.code }));
      await invalidate();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('maintenance.startFailedToast'));
    }
  }

  async function complete(record: MaintenanceRow) {
    try {
      const response = await apiClient.post<MaintenanceRow>(
        `/api/maintenance/${record.id}/complete`,
      );
      toast.success(
        t('maintenance.completedToast', {
          code: record.generator.code,
          meter: response.nextMaintenanceMeter ?? '',
        }),
      );
      await invalidate();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('maintenance.completeFailedToast'));
    }
  }

  const dateRange: DateRangeValue = { from: table.filters.dateFrom, to: table.filters.dateTo };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<MaintenanceRow, any>[] = [
    columnHelper.accessor((row) => row.generator.code, {
      id: 'generator',
      header: t('maintenance.columnGenerator'),
      enableSorting: false,
    }),
    columnHelper.accessor('type', {
      header: t('maintenance.columnType'),
      enableSorting: false,
      cell: (info) => t(`maintenance.type${info.getValue()}` as TranslationKey),
    }),
    columnHelper.accessor('status', {
      header: t('table.status'),
      cell: (info) => <StatusBadge status={info.getValue() as MaintenanceStatus} />,
    }),
    columnHelper.accessor('date', {
      header: t('maintenance.columnDate'),
      cell: (info) => formatDate(info.getValue()),
    }),
    columnHelper.accessor('meter', {
      header: t('maintenance.columnMeter'),
      cell: (info) => <span className="tabular-data">{info.getValue()}</span>,
    }),
    columnHelper.accessor('totalCost', {
      header: t('maintenance.columnTotalCost'),
      cell: (info) => <span className="tabular-data">{info.getValue()}</span>,
    }),
    columnHelper.accessor('nextMaintenanceMeter', {
      header: t('maintenance.columnNextDue'),
      enableSorting: false,
      cell: (info) =>
        info.getValue() === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="tabular-data">{info.getValue()}</span>
        ),
    }),
    createActionsColumn<MaintenanceRow>((row) => {
      const isOpenStatus = row.status === 'Open' || row.status === 'In Progress';
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t('maintenance.actionsFor', { code: row.generator.code })}
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canWrite && isOpenStatus ? (
              <DropdownMenuItem onClick={() => setEditTarget(row)}>
                <Pencil className="size-4" aria-hidden />
                {t('maintenance.editCosts')}
              </DropdownMenuItem>
            ) : null}
            {canWrite && row.status === 'Open' ? (
              <DropdownMenuItem onClick={() => void start(row)}>
                <PlayCircle className="size-4" aria-hidden />
                {t('maintenance.start')}
              </DropdownMenuItem>
            ) : null}
            {canComplete && isOpenStatus ? (
              <DropdownMenuItem onClick={() => void complete(row)}>
                <CheckCircle2 className="size-4" aria-hidden />
                {t('maintenance.complete')}
              </DropdownMenuItem>
            ) : null}
            {canComplete && isOpenStatus ? (
              <DropdownMenuItem
                onClick={() => setCancelTarget(row)}
                className="text-destructive focus:text-destructive"
              >
                <XCircle className="size-4" aria-hidden />
                {t('maintenance.cancel')}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }),
  ];

  return (
    <>
      <PageHeader
        title={t('maintenance.title')}
        description={t('maintenance.description')}
        action={
          canWrite ? (
            <Button size="sm" onClick={() => setIsOpening(true)}>
              <Plus className="size-4" aria-hidden />
              {t('maintenance.newMaintenance')}
            </Button>
          ) : undefined
        }
      />

      {canViewAlerts ? (
        <Tabs defaultValue="records" className="flex flex-col gap-4">
          <TabsList>
            <TabsTrigger value="records">{t('maintenance.tabRecords')}</TabsTrigger>
            <TabsTrigger value="alerts">{t('maintenance.tabAlerts')}</TabsTrigger>
          </TabsList>

          <TabsContent value="records" className="flex flex-col gap-4">
            <MaintenanceFiltersAndTable
              table={table}
              dateRange={dateRange}
              generators={generators}
              columns={columns}
              canWrite={canWrite}
            />
          </TabsContent>

          <TabsContent value="alerts">
            <MaintenanceAlertsTab />
          </TabsContent>
        </Tabs>
      ) : (
        <MaintenanceFiltersAndTable
          table={table}
          dateRange={dateRange}
          generators={generators}
          columns={columns}
          canWrite={canWrite}
        />
      )}

      {canWrite ? <MaintenanceFormDialog open={isOpening} onOpenChange={setIsOpening} /> : null}

      {canWrite ? (
        <MaintenanceFormDialog
          open={editTarget !== null}
          onOpenChange={(open) => !open && setEditTarget(null)}
          record={editTarget}
        />
      ) : null}

      {canComplete ? (
        <CancelDialog
          open={cancelTarget !== null}
          onOpenChange={(open) => !open && setCancelTarget(null)}
          generatorCode={cancelTarget?.generator.code ?? ''}
          onCancelled={async (reason) => {
            if (!cancelTarget) return;
            await apiClient.post(`/api/maintenance/${cancelTarget.id}/cancel`, { reason });
            await invalidate();
          }}
        />
      ) : null}
    </>
  );
}

function MaintenanceFiltersAndTable({
  table,
  dateRange,
  generators,
  columns,
  canWrite,
}: {
  table: ReturnType<typeof useDataTableQuery<MaintenanceRow>>;
  dateRange: DateRangeValue;
  generators: { items: GeneratorRow[] } | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<MaintenanceRow, any>[];
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
          placeholder={t('maintenance.generatorFilterPlaceholder')}
          allLabel={t('maintenance.allGeneratorsLabel')}
        />
        <SelectFilter
          value={table.filters.status}
          onChange={(value) => table.setFilter('status', value)}
          options={[
            { value: 'Open', label: t('maintenance.statusOpen') },
            { value: 'In Progress', label: t('maintenance.statusInProgress') },
            { value: 'Completed', label: t('maintenance.statusCompleted') },
            { value: 'Cancelled', label: t('maintenance.statusCancelled') },
          ]}
          placeholder={t('table.status')}
          allLabel={t('maintenance.allStatusesLabel')}
        />
        <SelectFilter
          value={table.filters.type}
          onChange={(value) => table.setFilter('type', value)}
          options={[
            { value: 'Preventive', label: t('maintenance.typePreventive') },
            { value: 'Corrective', label: t('maintenance.typeCorrective') },
          ]}
          placeholder={t('maintenance.typeFilterPlaceholder')}
          allLabel={t('maintenance.allTypesLabel')}
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
        emptyTitle={t('maintenance.emptyTitle')}
        emptyDescription={
          canWrite
            ? t('maintenance.emptyDescriptionWrite')
            : t('maintenance.emptyDescriptionReadOnly')
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
