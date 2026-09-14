'use client';

import { Suspense, useCallback, useRef, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import type { ColumnDef, RowSelectionState, VisibilityState } from '@tanstack/react-table';
import { MoreHorizontal, Pencil, ShieldAlert, Trash2 } from 'lucide-react';

import { useDataTableQuery } from '@/hooks/useDataTableQuery';
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
const columns: ColumnDef<MockGenerator, any>[] = [
  createSelectionColumn<MockGenerator>(),
  columnHelper.accessor('code', {
    header: 'Code',
    cell: (info) => <span className="tabular-data font-medium">{info.getValue()}</span>,
  }),
  columnHelper.accessor('kva', {
    header: 'kVA',
    cell: (info) => <span className="tabular-data">{info.getValue()}</span>,
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => <StatusBadge status={info.getValue()} />,
  }),
  columnHelper.accessor('location', {
    header: 'Location',
    enableSorting: false,
  }),
  columnHelper.accessor('currentMeter', {
    header: 'Meter (h)',
    cell: (info) => <span className="tabular-data">{info.getValue().toLocaleString()}</span>,
  }),
  columnHelper.accessor('installedAt', {
    header: 'Installed',
  }),
  createActionsColumn<MockGenerator>((row) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${row.code}`}>
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem>
          <Pencil className="size-4" aria-hidden />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive focus:text-destructive">
          <Trash2 className="size-4" aria-hidden />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )),
];

const STATUS_OPTIONS = [
  { value: 'available', label: 'Available', tone: 'success' as const },
  { value: 'rented', label: 'Rented', tone: 'info' as const },
  { value: 'under_maintenance', label: 'Under Maintenance', tone: 'warning' as const },
  { value: 'stopped', label: 'Stopped', tone: 'danger' as const },
];

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

  function toggleErrorMode() {
    const next = !errorModeRef.current;
    errorModeRef.current = next;
    setErrorMode(next);
    table.refetch();
  }

  return (
    <>
      <PageHeader
        title="DataTable foundation"
        description="TASK-005 preview — apiClient + DataTable + useDataTableQuery over mock data (the real /api/generators list lands in TASK-008)."
        action={
          <Button variant={errorMode ? 'destructive' : 'outline'} size="sm" onClick={toggleErrorMode}>
            <ShieldAlert className="size-4" aria-hidden />
            {errorMode ? 'Stop simulating error' : 'Simulate error'}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={table.search} onChange={table.setSearch} placeholder="Search code or location…" className="w-64" />
        <StatusFilter
          value={table.filters.status}
          onChange={(value) => table.setFilter('status', value)}
          options={STATUS_OPTIONS}
          placeholder="Status"
        />
        <DateRangeFilter
          value={dateRangeValue}
          onChange={(range) => {
            table.setFilter('from', range.from);
            table.setFilter('to', range.to);
          }}
          placeholder="Installed date"
        />
        {table.hasActiveFilters ? (
          <Button variant="ghost" size="sm" onClick={table.clearFilters}>
            Clear filters
          </Button>
        ) : null}
        {Object.keys(rowSelection).length > 0 ? (
          <span className="ms-auto text-sm text-muted-foreground">{Object.keys(rowSelection).length} selected</span>
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
        emptyTitle="No generators yet"
        emptyDescription="Generators will appear here once the fleet is registered."
      />

      <DataTablePagination meta={table.meta} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />
    </>
  );
}
