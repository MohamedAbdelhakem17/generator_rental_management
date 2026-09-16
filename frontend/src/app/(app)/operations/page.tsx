'use client';

import { Suspense, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Pencil, Plus } from 'lucide-react';

import { apiClient } from '@/lib/apiClient';
import { useDataTableQuery } from '@/hooks/useDataTableQuery';
import { useSession } from '@/lib/session/session-provider';
import { useLocale } from '@/lib/i18n/locale-provider';
import type { TranslationKey } from '@/lib/i18n/dictionary';
import { cn } from '@/lib/utils';
import { STATUS_TONE_CLASSES } from '@/lib/status-tone';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { DataTablePagination } from '@/components/data-table/pagination';
import { createActionsColumn } from '@/components/data-table/columns';
import { SelectFilter } from '@/components/data-table/filters/select-filter';
import { DateRangeFilter, type DateRangeValue } from '@/components/data-table/filters/date-range-filter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import type { GeneratorRow } from '../generators/types';
import type { ProjectRow } from '../projects/types';
import { CorrectionDialog } from './correction-dialog';
import { OperationEntryForm } from './operation-entry-form';
import type { OperationLogRow, OperationLogStatus } from './types';

const columnHelper = createColumnHelper<OperationLogRow>();

const STATUS_LABEL_KEYS: Record<OperationLogStatus, TranslationKey> = {
  Active: 'operations.statusActive',
  Superseded: 'operations.statusSuperseded',
};

function StatusBadge({ status }: { status: OperationLogStatus }) {
  const { t } = useLocale();
  const tone = STATUS_TONE_CLASSES[status === 'Active' ? 'success' : 'neutral'];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium', tone.bg, tone.fg, tone.border)}>
      <span className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />
      {t(STATUS_LABEL_KEYS[status])}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function OperationsPage() {
  // useDataTableQuery reads useSearchParams(), which needs a Suspense boundary (TASK-005).
  return (
    <Suspense fallback={null}>
      <OperationsPageContent />
    </Suspense>
  );
}

function OperationsPageContent() {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const canWrite = user?.permissions.includes('operations:write') ?? false;
  const canCorrect = user?.permissions.includes('operations:correct') ?? false;

  const [isEntering, setIsEntering] = useState(false);
  const [correctionTarget, setCorrectionTarget] = useState<OperationLogRow | null>(null);

  const { data: generators } = useQuery({
    queryKey: ['generators', 'select'],
    queryFn: ({ signal }) => apiClient.getPaginated<GeneratorRow>('/api/generators', { limit: 100, sort: 'code' }, signal),
  });
  const { data: projects } = useQuery({
    queryKey: ['projects', 'select', 'all'],
    queryFn: ({ signal }) => apiClient.getPaginated<ProjectRow>('/api/projects', { limit: 100, sort: 'name' }, signal),
  });

  const table = useDataTableQuery<OperationLogRow>({
    queryKey: 'operations',
    queryFn: (params, signal) =>
      apiClient.getPaginated<OperationLogRow>(
        '/api/operations',
        { page: params.page, limit: params.limit, sort: params.sort, ...params.filters },
        signal,
      ),
    defaultSort: '-date',
  });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['operations'] });
  }

  const dateRange: DateRangeValue = { from: table.filters.dateFrom, to: table.filters.dateTo };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<OperationLogRow, any>[] = [
    columnHelper.accessor('date', { header: t('operations.columnDate'), cell: (info) => formatDate(info.getValue()) }),
    columnHelper.accessor((row) => row.generator.code, { id: 'generator', header: t('operations.columnGenerator'), enableSorting: false }),
    columnHelper.accessor((row) => row.project.name, { id: 'project', header: t('operations.columnProject'), enableSorting: false }),
    columnHelper.accessor((row) => `${row.startMeter} → ${row.endMeter}`, { id: 'meters', header: t('operations.columnMeters'), enableSorting: false, cell: (info) => <span className="tabular-data">{info.getValue()}</span> }),
    columnHelper.accessor('operatingHours', { header: t('operations.columnHours'), cell: (info) => <span className="tabular-data">{info.getValue()}</span> }),
    columnHelper.accessor('downtimeHours', { header: t('operations.columnDowntime'), cell: (info) => <span className="tabular-data">{info.getValue()}</span> }),
    columnHelper.accessor('status', { header: t('table.status'), cell: (info) => <StatusBadge status={info.getValue()} /> }),
    createActionsColumn<OperationLogRow>((row) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7" aria-label={t('operations.actionsFor', { code: row.generator.code, date: formatDate(row.date) })}>
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canCorrect && row.status === 'Active' ? (
            <DropdownMenuItem onClick={() => setCorrectionTarget(row)}>
              <Pencil className="size-4" aria-hidden />
              {t('operations.correct')}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    )),
  ];

  return (
    <>
      <PageHeader
        title={t('operations.title')}
        description={t('operations.description')}
        action={
          canWrite ? (
            <Button size="sm" onClick={() => setIsEntering(true)}>
              <Plus className="size-4" aria-hidden />
              {t('operations.newEntry')}
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SelectFilter
          value={table.filters.generatorId}
          onChange={(value) => table.setFilter('generatorId', value)}
          options={(generators?.items ?? []).map((generator) => ({ value: generator.id, label: generator.code }))}
          placeholder={t('operations.generatorFilterPlaceholder')}
          allLabel={t('operations.allGeneratorsLabel')}
        />
        <SelectFilter
          value={table.filters.projectId}
          onChange={(value) => table.setFilter('projectId', value)}
          options={(projects?.items ?? []).map((project) => ({ value: project.id, label: project.name }))}
          placeholder={t('operations.projectFilterPlaceholder')}
          allLabel={t('operations.allProjectsLabel')}
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
        emptyTitle={t('operations.emptyTitle')}
        emptyDescription={canWrite ? t('operations.emptyDescriptionWrite') : t('operations.emptyDescriptionReadOnly')}
      />

      <DataTablePagination meta={table.meta} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />

      {canWrite ? <OperationEntryForm open={isEntering} onOpenChange={setIsEntering} /> : null}

      {canCorrect ? (
        <CorrectionDialog
          open={correctionTarget !== null}
          onOpenChange={(open) => !open && setCorrectionTarget(null)}
          log={correctionTarget}
          onCorrected={async (input) => {
            if (!correctionTarget) return;
            await apiClient.patch(`/api/operations/${correctionTarget.id}/correct`, input);
            await invalidate();
          }}
        />
      ) : null}
    </>
  );
}
