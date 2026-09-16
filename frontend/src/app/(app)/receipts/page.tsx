'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { createColumnHelper } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Suspense, useState } from 'react';

import { DataTable } from '@/components/data-table/data-table';
import {
  DateRangeFilter,
  type DateRangeValue,
} from '@/components/data-table/filters/date-range-filter';
import { SelectFilter } from '@/components/data-table/filters/select-filter';
import { DataTablePagination } from '@/components/data-table/pagination';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { useDataTableQuery } from '@/hooks/useDataTableQuery';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { useSession } from '@/lib/session/session-provider';
import { STATUS_TONE_CLASSES, type StatusTone } from '@/lib/status-tone';
import { cn } from '@/lib/utils';
import { CustomerCombobox } from '../projects/customer-combobox';
import { ReceiptCancelDialog } from './receipt-cancel-dialog';
import { ReceiptEntryDialog } from './receipt-entry-dialog';
import type { ReceiptPaymentMethod, ReceiptRow, ReceiptStatus } from './types';

const columnHelper = createColumnHelper<ReceiptRow>();

const STATUS_TONES: Record<ReceiptStatus, StatusTone> = {
  Confirmed: 'success',
  Cancelled: 'danger',
};

const PAYMENT_METHODS: ReceiptPaymentMethod[] = ['Cash', 'BankTransfer', 'Cheque', 'Card'];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function allocatedTotal(receipt: ReceiptRow): number {
  return receipt.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0);
}

export default function ReceiptsPage() {
  // useDataTableQuery reads useSearchParams(), which needs a Suspense boundary (TASK-005).
  return (
    <Suspense fallback={null}>
      <ReceiptsPageContent />
    </Suspense>
  );
}

function ReceiptsPageContent() {
  const { t } = useLocale();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const canWrite = user?.permissions.includes('receipts:write') ?? false;
  const canCancel = user?.permissions.includes('receipts:cancel') ?? false;

  const [isCreating, setIsCreating] = useState(false);
  const [cancelling, setCancelling] = useState<ReceiptRow | null>(null);

  const table = useDataTableQuery<ReceiptRow>({
    queryKey: 'receipts',
    queryFn: (params, signal) =>
      apiClient.getPaginated<ReceiptRow>(
        '/api/receipts',
        { page: params.page, limit: params.limit, sort: params.sort, ...params.filters },
        signal,
      ),
    defaultSort: '-date',
  });

  const dateRange: DateRangeValue = { from: table.filters.dateFrom, to: table.filters.dateTo };
  const methodOptions = PAYMENT_METHODS.map((method) => ({
    value: method,
    label: t(`receipts.method${method}` as `receipts.method${typeof method}`),
  }));

  async function handleCancel(receipt: ReceiptRow, reason: string) {
    try {
      await apiClient.post(`/api/receipts/${receipt.id}/cancel`, { reason });
      await queryClient.invalidateQueries({ queryKey: ['receipts'] });
    } catch (error) {
      throw error instanceof ApiError ? error : new Error(t('receipts.cancelFailedToast'));
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<ReceiptRow, any>[] = [
    columnHelper.accessor('number', {
      header: t('receipts.columnNumber'),
      cell: (info) => <span className="font-medium">{info.getValue()}</span>,
    }),
    columnHelper.accessor('customerName', {
      header: t('receipts.columnCustomer'),
      enableSorting: false,
    }),
    columnHelper.accessor('date', {
      header: t('receipts.columnDate'),
      cell: (info) => formatDate(info.getValue()),
    }),
    columnHelper.accessor('amount', {
      header: t('receipts.columnAmount'),
      enableSorting: false,
      cell: (info) => <span className="tabular-data">{info.getValue()}</span>,
    }),
    columnHelper.accessor('paymentMethod', {
      header: t('receipts.columnMethod'),
      enableSorting: false,
      cell: (info) =>
        t(`receipts.method${info.getValue()}` as `receipts.method${ReceiptPaymentMethod}`),
    }),
    columnHelper.display({
      id: 'allocated',
      header: t('receipts.columnAllocated'),
      cell: ({ row }) => {
        const allocated = allocatedTotal(row.original);
        const unallocated = (Number(row.original.amount) - allocated).toFixed(2);
        return (
          <span className="tabular-data text-sm text-muted-foreground">
            {allocated.toFixed(2)} / {unallocated}
          </span>
        );
      },
    }),
    columnHelper.accessor('status', {
      header: t('receipts.columnStatus'),
      cell: (info) => {
        const status = info.getValue() as ReceiptStatus;
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
            {t(`receipts.status${status}` as `receipts.status${ReceiptStatus}`)}
          </span>
        );
      },
    }),
    ...(canCancel
      ? [
          columnHelper.display({
            id: 'actions',
            header: '',
            cell: ({ row }: { row: { original: ReceiptRow } }) =>
              row.original.status === 'Confirmed' ? (
                <Button variant="ghost" size="sm" onClick={() => setCancelling(row.original)}>
                  {t('receipts.cancelButton')}
                </Button>
              ) : null,
          }),
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title={t('receipts.title')}
        description={t('receipts.description')}
        action={
          canWrite ? (
            <Button size="sm" onClick={() => setIsCreating(true)}>
              <Plus className="size-4" aria-hidden />
              {t('receipts.newReceipt')}
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <CustomerCombobox
          value={table.filters.customerId ?? ''}
          onSelect={(customer) => table.setFilter('customerId', customer.id)}
        />
        <SelectFilter
          value={table.filters.paymentMethod}
          onChange={(value) => table.setFilter('paymentMethod', value)}
          options={methodOptions}
          placeholder={t('receipts.methodPlaceholder')}
          allLabel={t('receipts.allMethodsLabel')}
        />
        <DateRangeFilter
          value={dateRange}
          onChange={(next) => {
            table.setFilter('dateFrom', next.from);
            table.setFilter('dateTo', next.to);
          }}
          placeholder={t('receipts.periodPlaceholder')}
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
        emptyTitle={t('receipts.emptyTitle')}
        emptyDescription={
          canWrite ? t('receipts.emptyDescriptionWrite') : t('receipts.emptyDescriptionReadOnly')
        }
      />

      <DataTablePagination
        meta={table.meta}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
      />

      {canWrite ? <ReceiptEntryDialog open={isCreating} onOpenChange={setIsCreating} /> : null}

      {cancelling ? (
        <ReceiptCancelDialog
          open={cancelling !== null}
          onOpenChange={(next) => {
            if (!next) setCancelling(null);
          }}
          receipt={cancelling}
          onCancelled={(reason) => handleCancel(cancelling, reason)}
        />
      ) : null}
    </>
  );
}
