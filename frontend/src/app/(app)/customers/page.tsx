'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { createColumnHelper } from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { apiClient, ApiError } from '@/lib/apiClient';
import { useDataTableQuery } from '@/hooks/useDataTableQuery';
import { useSession } from '@/lib/session/session-provider';
import { cn } from '@/lib/utils';
import { STATUS_TONE_CLASSES } from '@/lib/status-tone';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { DataTablePagination } from '@/components/data-table/pagination';
import { createActionsColumn } from '@/components/data-table/columns';
import { SearchInput } from '@/components/data-table/filters/search-input';
import { StatusFilter } from '@/components/data-table/filters/status-filter';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CustomerFormDialog } from './customer-form-dialog';
import type { CustomerRow } from './types';

const columnHelper = createColumnHelper<CustomerRow>();

const ACTIVE_OPTIONS = [
  { value: 'true', label: 'Active', tone: 'success' as const },
  { value: 'false', label: 'Inactive', tone: 'neutral' as const },
];

function ActiveBadge({ active }: { active: boolean }) {
  const tone = STATUS_TONE_CLASSES[active ? 'success' : 'neutral'];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium', tone.bg, tone.fg, tone.border)}>
      <span className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

export default function CustomersPage() {
  // useDataTableQuery reads useSearchParams(), which needs a Suspense boundary (TASK-005).
  return (
    <Suspense fallback={null}>
      <CustomersPageContent />
    </Suspense>
  );
}

function CustomersPageContent() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const canWrite = user?.permissions.includes('customers:write') ?? false;
  const canDelete = user?.permissions.includes('customers:delete') ?? false;

  const [formCustomer, setFormCustomer] = useState<CustomerRow | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomerRow | null>(null);

  const table = useDataTableQuery<CustomerRow>({
    queryKey: 'customers',
    queryFn: (params, signal) =>
      apiClient.getPaginated<CustomerRow>(
        '/api/customers',
        { page: params.page, limit: params.limit, sort: params.sort, search: params.search, ...params.filters },
        signal,
      ),
    defaultSort: 'companyName',
  });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['customers'] });
  }

  async function toggleActive(customer: CustomerRow) {
    try {
      await apiClient.patch(`/api/customers/${customer.id}`, { active: !customer.active });
      toast.success(customer.active ? `Deactivated ${customer.companyName}` : `Activated ${customer.companyName}`);
      await invalidate();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong. Try again.');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await apiClient.delete(`/api/customers/${deleteTarget.id}`);
      toast.success(`Deleted ${deleteTarget.companyName}`);
      await invalidate();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't delete this customer.");
      throw error;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<CustomerRow, any>[] = [
    columnHelper.accessor('code', {
      header: 'Code',
      cell: (info) => (
        <Link href={`/customers/${info.row.original.id}`} className="font-medium text-primary hover:underline">
          {info.getValue()}
        </Link>
      ),
    }),
    columnHelper.accessor('companyName', { header: 'Company' }),
    columnHelper.accessor('contactPerson', { header: 'Contact', enableSorting: false, cell: (info) => info.getValue() || '—' }),
    columnHelper.accessor('phone', { header: 'Phone', enableSorting: false, cell: (info) => info.getValue() || '—' }),
    // Balance is deferred to the Customer Ledger Engine (TASK-023) — this column lands once that endpoint exists.
    columnHelper.accessor('active', { header: 'Status', cell: (info) => <ActiveBadge active={info.getValue()} /> }),
    createActionsColumn<CustomerRow>((row) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${row.companyName}`}>
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canWrite ? (
            <DropdownMenuItem onClick={() => setFormCustomer(row)}>
              <Pencil className="size-4" aria-hidden />
              Edit
            </DropdownMenuItem>
          ) : null}
          {canWrite ? (
            <DropdownMenuItem onClick={() => void toggleActive(row)}>
              {row.active ? <PowerOff className="size-4" aria-hidden /> : <Power className="size-4" aria-hidden />}
              {row.active ? 'Deactivate' : 'Activate'}
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(row)}>
              <Trash2 className="size-4" aria-hidden />
              Delete
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    )),
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        description="The master records billing and contracts are built on."
        action={
          canWrite ? (
            <Button size="sm" onClick={() => setFormCustomer('new')}>
              <Plus className="size-4" aria-hidden />
              New customer
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={table.search}
          onChange={table.setSearch}
          placeholder="Search name, code, contact, tax number…"
          className="w-72"
        />
        <StatusFilter
          value={table.filters.active}
          onChange={(value) => table.setFilter('active', value)}
          options={ACTIVE_OPTIONS}
          placeholder="Status"
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
        emptyTitle="No customers yet"
        emptyDescription={canWrite ? 'Add the first customer to start billing projects.' : 'Customers will appear here once they are added.'}
      />

      <DataTablePagination meta={table.meta} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />

      {canWrite ? (
        <CustomerFormDialog
          open={formCustomer !== null}
          onOpenChange={(open) => !open && setFormCustomer(null)}
          customer={formCustomer === 'new' || formCustomer === null ? undefined : formCustomer}
        />
      ) : null}

      {canDelete ? (
        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title={deleteTarget ? `Delete ${deleteTarget.companyName}?` : ''}
          description="This soft-deletes the record — it's blocked while an outstanding balance or active contract references it, and stays visible in historical reports."
          confirmLabel="Delete"
          onConfirm={confirmDelete}
        />
      ) : null}
    </>
  );
}
