'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { createColumnHelper } from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';

import { apiClient } from '@/lib/apiClient';
import { useDataTableQuery } from '@/hooks/useDataTableQuery';
import { useSession } from '@/lib/session/session-provider';
import { cn } from '@/lib/utils';
import { STATUS_TONE_CLASSES, type StatusTone } from '@/lib/status-tone';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { DataTablePagination } from '@/components/data-table/pagination';
import { StatusFilter } from '@/components/data-table/filters/status-filter';
import { DateRangeFilter, type DateRangeValue } from '@/components/data-table/filters/date-range-filter';
import { Button } from '@/components/ui/button';
import { CustomerCombobox } from '../projects/customer-combobox';
import { ExtractFormDialog } from './extract-form-dialog';
import type { ExtractRow, ExtractStatus } from './types';

const columnHelper = createColumnHelper<ExtractRow>();

const STATUS_TONES: Record<ExtractStatus, StatusTone> = {
  Draft: 'neutral',
  'Under Review': 'info',
  Approved: 'success',
  'Partially Collected': 'warning',
  Collected: 'success',
  Cancelled: 'danger',
};

const STATUS_OPTIONS = (Object.keys(STATUS_TONES) as ExtractStatus[]).map((status) => ({
  value: status,
  label: status,
  tone: STATUS_TONES[status],
}));

function ExtractStatusBadge({ status }: { status: ExtractStatus }) {
  const tone = STATUS_TONE_CLASSES[STATUS_TONES[status]];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium', tone.bg, tone.fg, tone.border)}>
      <span className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />
      {status}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function ExtractsPage() {
  // useDataTableQuery reads useSearchParams(), which needs a Suspense boundary (TASK-005).
  return (
    <Suspense fallback={null}>
      <ExtractsPageContent />
    </Suspense>
  );
}

function ExtractsPageContent() {
  const { user } = useSession();
  const canWrite = user?.permissions.includes('extracts:create') ?? false;

  const [isCreating, setIsCreating] = useState(false);

  const table = useDataTableQuery<ExtractRow>({
    queryKey: 'extracts',
    queryFn: (params, signal) =>
      apiClient.getPaginated<ExtractRow>(
        '/api/extracts',
        { page: params.page, limit: params.limit, sort: params.sort, ...params.filters },
        signal,
      ),
    defaultSort: '-createdAt',
  });

  const dateRange: DateRangeValue = { from: table.filters.dateFrom, to: table.filters.dateTo };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<ExtractRow, any>[] = [
    columnHelper.accessor('number', {
      header: 'Number',
      cell: (info) => (
        <Link href={`/extracts/${info.row.original.id}`} className="font-medium text-primary hover:underline">
          {info.getValue()}
        </Link>
      ),
    }),
    columnHelper.accessor((row) => row.customer.companyName, { id: 'customer', header: 'Customer', enableSorting: false }),
    columnHelper.accessor((row) => row.project.name, { id: 'project', header: 'Project', enableSorting: false }),
    columnHelper.accessor((row) => `${formatDate(row.period.start)} – ${formatDate(row.period.end)}`, {
      id: 'period',
      header: 'Period',
      enableSorting: false,
    }),
    columnHelper.accessor('finalTotal', {
      header: 'Total',
      enableSorting: false,
      cell: (info) => (info.getValue() === null ? <span className="text-muted-foreground">—</span> : <span className="tabular-data">{info.getValue()}</span>),
    }),
    columnHelper.accessor('status', { header: 'Status', cell: (info) => <ExtractStatusBadge status={info.getValue() as ExtractStatus} /> }),
    columnHelper.display({
      id: 'collected',
      header: 'Collected / Remaining',
      cell: ({ row }) => {
        const { collectedAmount, finalTotal } = row.original;
        if (finalTotal === null) return <span className="text-muted-foreground">—</span>;
        const remaining = (Number(finalTotal) - Number(collectedAmount)).toFixed(2);
        return (
          <span className="tabular-data text-sm text-muted-foreground">
            {collectedAmount} / {remaining}
          </span>
        );
      },
    }),
  ];

  return (
    <>
      <PageHeader
        title="Extracts"
        description="Customer-facing billing documents, from Draft through Approval and collection."
        action={
          canWrite ? (
            <Button size="sm" onClick={() => setIsCreating(true)}>
              <Plus className="size-4" aria-hidden />
              New extract
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <CustomerCombobox value={table.filters.customerId ?? ''} onSelect={(customer) => table.setFilter('customerId', customer.id)} />
        <StatusFilter
          value={table.filters.status}
          onChange={(value) => table.setFilter('status', value)}
          options={STATUS_OPTIONS}
          allLabel="All statuses"
        />
        <DateRangeFilter
          value={dateRange}
          onChange={(next) => {
            table.setFilter('dateFrom', next.from);
            table.setFilter('dateTo', next.to);
          }}
          placeholder="Period"
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
        emptyTitle="No extracts yet"
        emptyDescription={canWrite ? 'Create the first extract to start billing a customer.' : 'Extracts will appear here once created.'}
      />

      <DataTablePagination meta={table.meta} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />

      {canWrite ? <ExtractFormDialog open={isCreating} onOpenChange={setIsCreating} /> : null}
    </>
  );
}
