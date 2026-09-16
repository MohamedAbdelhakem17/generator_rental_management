'use client';

import { Suspense, useCallback, useRef, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import type { ColumnDef, RowSelectionState, VisibilityState } from '@tanstack/react-table';
import { MoreHorizontal, Pencil, ShieldAlert, Trash2 } from 'lucide-react';

import { useDataTableQuery } from '@/hooks/useDataTableQuery';
import { useLocale } from '@/lib/i18n/locale-provider';
import type { TranslationKey } from '@/lib/i18n/dictionary';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { DataTablePagination } from '@/components/data-table/pagination';
import { createActionsColumn, createSelectionColumn } from '@/components/data-table/columns';
import { SearchInput } from '@/components/data-table/filters/search-input';
import { StatusFilter } from '@/components/data-table/filters/status-filter';
import { DateRangeFilter } from '@/components/data-table/filters/date-range-filter';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { fetchMockGenerators, type MockGenerator } from './mock-generators';

const columnHelper = createColumnHelper<MockGenerator>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createColumns(t: (key: TranslationKey, params?: Record<string, string | number>) => string): ColumnDef<MockGenerator, any>[] {
  return [
  createSelectionColumn<MockGenerator>(),
  columnHelper.accessor('code', {
    header: t('devTable.columnCode'),
    cell: (info) => <span className="tabular-data font-medium">{info.getValue()}</span>,
  }),
  columnHelper.accessor('kva', {
    header: t('devTable.columnKva'),
    cell: (info) => <span className="tabular-data">{info.getValue()}</span>,
  }),
  columnHelper.accessor('status', {
    header: t('table.status'),
    cell: (info) => <StatusBadge status={info.getValue()} />,
  }),
  columnHelper.accessor('location', {
    header: t('devTable.columnLocation'),
    enableSorting: false,
  }),
  columnHelper.accessor('currentMeter', {
    header: t('devTable.columnMeter'),
    cell: (info) => <span className="tabular-data">{info.getValue().toLocaleString()}</span>,
  }),
  columnHelper.accessor('installedAt', {
    header: t('devTable.columnInstalled'),
  }),
  createActionsColumn<MockGenerator>((row) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label={t('devTable.actionsFor', { code: row.code })}>
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem>
          <Pencil className="size-4" aria-hidden />
          {t('devTable.edit')}
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive focus:text-destructive">
          <Trash2 className="size-4" aria-hidden />
          {t('devTable.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )),
  ];
}

function createStatusOptions(t: (key: TranslationKey) => string) {
  return [
    { value: 'available', label: t('status.available'), tone: 'success' as const },
    { value: 'rented', label: t('status.rented'), tone: 'info' as const },
    { value: 'under_maintenance', label: t('status.underMaintenance'), tone: 'warning' as const },
    { value: 'stopped', label: t('status.stopped'), tone: 'danger' as const },
  ];
}

export default function DataTableFoundationPage() {
  // useDataTableQuery reads useSearchParams(), which requires a Suspense boundary to
  // avoid an opt-out-of-static-rendering build error — every page using it needs this.
  return (
    <Suspense fallback={null}>
      <DataTableFoundationContent />
    </Suspense>
  );
}

function DataTableFoundationContent() {
  const { t } = useLocale();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [errorMode, setErrorMode] = useState(false);

  // A ref (not the `errorMode` state) drives the mock fetch: refs update synchronously,
  // so `table.refetch()` below always sees the just-toggled value immediately, rather
  // than racing a re-render to get a fresh `queryFn` closure.
  const errorModeRef = useRef(false);
  const queryFn = useCallback(
    (params: Parameters<typeof fetchMockGenerators>[0], signal: AbortSignal) =>
      fetchMockGenerators(params, signal, { simulateError: errorModeRef.current }),
    [],
  );

  const table = useDataTableQuery<MockGenerator>({
    queryKey: 'dev-mock-generators',
    queryFn,
    defaultSort: 'code',
  });

  const dateRangeValue = { from: table.filters.from, to: table.filters.to };
  const columns = createColumns(t);
  const statusOptions = createStatusOptions(t);

  function toggleErrorMode() {
    const next = !errorModeRef.current;
    errorModeRef.current = next;
    setErrorMode(next);
    table.refetch();
  }

  return (
    <>
      <PageHeader
        title={t('devTable.title')}
        description={t('devTable.description')}
        action={
          <Button variant={errorMode ? 'destructive' : 'outline'} size="sm" onClick={toggleErrorMode}>
            <ShieldAlert className="size-4" aria-hidden />
            {errorMode ? t('devTable.stopSimulatingError') : t('devTable.simulateError')}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={table.search} onChange={table.setSearch} placeholder={t('devTable.searchPlaceholder')} className="w-64" />
        <StatusFilter
          value={table.filters.status}
          onChange={(value) => table.setFilter('status', value)}
          options={statusOptions}
          placeholder={t('table.status')}
        />
        <DateRangeFilter
          value={dateRangeValue}
          onChange={(range) => {
            table.setFilter('from', range.from);
            table.setFilter('to', range.to);
          }}
          placeholder={t('devTable.installedDatePlaceholder')}
        />
        {table.hasActiveFilters ? (
          <Button variant="ghost" size="sm" onClick={table.clearFilters}>
            {t('table.clearFilters')}
          </Button>
        ) : null}
        {Object.keys(rowSelection).length > 0 ? (
          <span className="ms-auto text-sm text-muted-foreground">{t('devTable.selectedCount', { count: Object.keys(rowSelection).length })}</span>
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
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        hasActiveFilters={table.hasActiveFilters}
        onClearFilters={table.clearFilters}
        emptyTitle={t('generators.emptyTitle')}
        emptyDescription={t('generators.emptyDescriptionReadOnly')}
      />

      <DataTablePagination meta={table.meta} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />
    </>
  );
}
