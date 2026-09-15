'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { createColumnHelper } from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Play, Plus, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient, ApiError } from '@/lib/apiClient';
import { useDataTableQuery } from '@/hooks/useDataTableQuery';
import { useSession } from '@/lib/session/session-provider';
import { cn } from '@/lib/utils';
import { STATUS_TONE_CLASSES, type StatusTone } from '@/lib/status-tone';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { DataTablePagination } from '@/components/data-table/pagination';
import { createActionsColumn } from '@/components/data-table/columns';
import { StatusFilter } from '@/components/data-table/filters/status-filter';
import { DateRangeFilter, type DateRangeValue } from '@/components/data-table/filters/date-range-filter';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CustomerCombobox } from '../projects/customer-combobox';
import { CancelContractDialog } from './cancel-contract-dialog';
import { ContractFormWizard } from './contract-form-wizard';
import type { ContractRow, ContractStatus } from './types';

const columnHelper = createColumnHelper<ContractRow>();

const STATUS_TONES: Record<ContractStatus, StatusTone> = {
  Draft: 'neutral',
  Active: 'success',
  Expired: 'warning',
  Cancelled: 'danger',
};

const STATUS_OPTIONS = (Object.keys(STATUS_TONES) as ContractStatus[]).map((status) => ({
  value: status,
  label: status,
  tone: STATUS_TONES[status],
}));

function ContractStatusBadge({ status }: { status: ContractStatus }) {
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

export default function ContractsPage() {
  // useDataTableQuery reads useSearchParams(), which needs a Suspense boundary (TASK-005).
  return (
    <Suspense fallback={null}>
      <ContractsPageContent />
    </Suspense>
  );
}

function ContractsPageContent() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const canWrite = user?.permissions.includes('contracts:write') ?? false;

  const [isCreating, setIsCreating] = useState(false);
  const [activateTarget, setActivateTarget] = useState<ContractRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ContractRow | null>(null);

  const table = useDataTableQuery<ContractRow>({
    queryKey: 'contracts',
    queryFn: (params, signal) =>
      apiClient.getPaginated<ContractRow>(
        '/api/contracts',
        { page: params.page, limit: params.limit, sort: params.sort, ...params.filters },
        signal,
      ),
    defaultSort: '-createdAt',
  });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['contracts'] });
  }

  async function confirmActivate() {
    if (!activateTarget) return;
    try {
      await apiClient.post(`/api/contracts/${activateTarget.id}/activate`);
      toast.success(`${activateTarget.number} activated`);
      await invalidate();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        toast.error(error.fieldErrors.map((fieldError) => fieldError.message).join(' · '));
      } else {
        toast.error(error instanceof ApiError ? error.message : "Couldn't activate this contract.");
      }
      throw error;
    }
  }

  const dateRange: DateRangeValue = { from: table.filters.startDateFrom, to: table.filters.startDateTo };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<ContractRow, any>[] = [
    columnHelper.accessor('number', {
      header: 'Number',
      cell: (info) => (
        <Link href={`/contracts/${info.row.original.id}`} className="font-medium text-primary hover:underline">
          {info.getValue()}
        </Link>
      ),
    }),
    columnHelper.accessor((row) => row.customer.companyName, { id: 'customer', header: 'Customer', enableSorting: false }),
    columnHelper.accessor((row) => row.project.name, { id: 'project', header: 'Project', enableSorting: false }),
    columnHelper.accessor((row) => `${formatDate(row.startDate)} – ${formatDate(row.endDate)}`, {
      id: 'dates',
      header: 'Dates',
      enableSorting: false,
    }),
    columnHelper.accessor('rentalMethod', { header: 'Method', enableSorting: false, cell: (info) => info.getValue()[0]!.toUpperCase() + info.getValue().slice(1) }),
    columnHelper.accessor('status', { header: 'Status', cell: (info) => <ContractStatusBadge status={info.getValue()} /> }),
    columnHelper.accessor('itemCount', { header: 'Items', cell: (info) => <span className="tabular-data">{info.getValue()}</span> }),
    createActionsColumn<ContractRow>((row) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${row.number}`}>
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canWrite && row.status === 'Draft' ? (
            <DropdownMenuItem onClick={() => setActivateTarget(row)}>
              <Play className="size-4" aria-hidden />
              Activate
            </DropdownMenuItem>
          ) : null}
          {canWrite && (row.status === 'Draft' || row.status === 'Active') ? (
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setCancelTarget(row)}>
              <XCircle className="size-4" aria-hidden />
              Cancel
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    )),
  ];

  return (
    <>
      <PageHeader
        title="Contracts"
        description="The commercial backbone — what makes a generator Rented and what every extract is generated from."
        action={
          canWrite ? (
            <Button size="sm" onClick={() => setIsCreating(true)}>
              <Plus className="size-4" aria-hidden />
              New contract
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <CustomerCombobox
          value={table.filters.customerId ?? ''}
          onSelect={(customer) => table.setFilter('customerId', customer.id)}
          placeholder="All customers"
        />
        <StatusFilter
          value={table.filters.status}
          onChange={(value) => table.setFilter('status', value)}
          options={STATUS_OPTIONS}
          placeholder="Status"
        />
        <DateRangeFilter
          value={dateRange}
          onChange={(next) => {
            table.setFilter('startDateFrom', next.from);
            table.setFilter('startDateTo', next.to);
          }}
          placeholder="Start date range"
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
        emptyTitle="No contracts yet"
        emptyDescription={canWrite ? 'Create the first contract to start tracking a rental.' : 'Contracts will appear here once they are created.'}
      />

      <DataTablePagination meta={table.meta} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />

      {canWrite ? (
        <>
          <ContractFormWizard open={isCreating} onOpenChange={setIsCreating} />

          <ConfirmDialog
            open={activateTarget !== null}
            onOpenChange={(open) => !open && setActivateTarget(null)}
            title={activateTarget ? `Activate ${activateTarget.number}?` : ''}
            description="Runs the conflict check across every item first — activation is blocked if any generator overlaps another Active contract."
            confirmLabel="Activate"
            confirmVariant="default"
            onConfirm={confirmActivate}
          />

          <CancelContractDialog
            open={cancelTarget !== null}
            onOpenChange={(open) => !open && setCancelTarget(null)}
            contractNumber={cancelTarget?.number ?? ''}
            onCancelled={async (reason) => {
              if (!cancelTarget) return;
              await apiClient.post(`/api/contracts/${cancelTarget.id}/cancel`, { reason });
              await invalidate();
            }}
          />
        </>
      ) : null}
    </>
  );
}
