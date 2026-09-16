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
import { useLocale } from '@/lib/i18n/locale-provider';
import type { TranslationKey } from '@/lib/i18n/dictionary';
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

const STATUS_LABEL_KEYS: Record<ContractStatus, TranslationKey> = {
  Draft: 'contracts.statusDraft',
  Active: 'contracts.statusActive',
  Expired: 'contracts.statusExpired',
  Cancelled: 'contracts.statusCancelled',
};

const METHOD_LABEL_KEYS: Record<ContractRow['rentalMethod'], TranslationKey> = {
  monthly: 'contracts.methodMonthly',
  daily: 'contracts.methodDaily',
  weekly: 'contracts.methodWeekly',
  hourly: 'contracts.methodHourly',
};

function ContractStatusBadge({ status }: { status: ContractStatus }) {
  const { t } = useLocale();
  const tone = STATUS_TONE_CLASSES[STATUS_TONES[status]];
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

export default function ContractsPage() {
  // useDataTableQuery reads useSearchParams(), which needs a Suspense boundary (TASK-005).
  return (
    <Suspense fallback={null}>
      <ContractsPageContent />
    </Suspense>
  );
}

function ContractsPageContent() {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const canWrite = user?.permissions.includes('contracts:write') ?? false;

  const [isCreating, setIsCreating] = useState(false);
  const [activateTarget, setActivateTarget] = useState<ContractRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ContractRow | null>(null);

  const STATUS_OPTIONS = (Object.keys(STATUS_TONES) as ContractStatus[]).map((status) => ({
    value: status,
    label: t(STATUS_LABEL_KEYS[status]),
    tone: STATUS_TONES[status],
  }));

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
      toast.success(t('contracts.activatedToast', { number: activateTarget.number }));
      await invalidate();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        toast.error(error.fieldErrors.map((fieldError) => fieldError.message).join(' · '));
      } else {
        toast.error(error instanceof ApiError ? error.message : t('contracts.activateFailedToast'));
      }
      throw error;
    }
  }

  const dateRange: DateRangeValue = { from: table.filters.startDateFrom, to: table.filters.startDateTo };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<ContractRow, any>[] = [
    columnHelper.accessor('number', {
      header: t('contracts.columnNumber'),
      cell: (info) => (
        <Link href={`/contracts/${info.row.original.id}`} className="font-medium text-primary hover:underline">
          {info.getValue()}
        </Link>
      ),
    }),
    columnHelper.accessor((row) => row.customer.companyName, { id: 'customer', header: t('contracts.columnCustomer'), enableSorting: false }),
    columnHelper.accessor((row) => row.project.name, { id: 'project', header: t('contracts.columnProject'), enableSorting: false }),
    columnHelper.accessor((row) => `${formatDate(row.startDate)} – ${formatDate(row.endDate)}`, {
      id: 'dates',
      header: t('contracts.columnDates'),
      enableSorting: false,
    }),
    columnHelper.accessor('rentalMethod', {
      header: t('contracts.columnMethod'),
      enableSorting: false,
      cell: (info) => t(METHOD_LABEL_KEYS[info.getValue() as ContractRow['rentalMethod']]),
    }),
    columnHelper.accessor('status', { header: t('table.status'), cell: (info) => <ContractStatusBadge status={info.getValue()} /> }),
    columnHelper.accessor('itemCount', { header: t('contracts.columnItems'), cell: (info) => <span className="tabular-data">{info.getValue()}</span> }),
    createActionsColumn<ContractRow>((row) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7" aria-label={t('contracts.actionsFor', { number: row.number })}>
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canWrite && row.status === 'Draft' ? (
            <DropdownMenuItem onClick={() => setActivateTarget(row)}>
              <Play className="size-4" aria-hidden />
              {t('contracts.activate')}
            </DropdownMenuItem>
          ) : null}
          {canWrite && (row.status === 'Draft' || row.status === 'Active') ? (
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setCancelTarget(row)}>
              <XCircle className="size-4" aria-hidden />
              {t('contracts.cancel')}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    )),
  ];

  return (
    <>
      <PageHeader
        title={t('contracts.title')}
        description={t('contracts.description')}
        action={
          canWrite ? (
            <Button size="sm" onClick={() => setIsCreating(true)}>
              <Plus className="size-4" aria-hidden />
              {t('contracts.newContract')}
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <CustomerCombobox
          value={table.filters.customerId ?? ''}
          onSelect={(customer) => table.setFilter('customerId', customer.id)}
          placeholder={t('contracts.allCustomersPlaceholder')}
        />
        <StatusFilter
          value={table.filters.status}
          onChange={(value) => table.setFilter('status', value)}
          options={STATUS_OPTIONS}
          placeholder={t('table.status')}
        />
        <DateRangeFilter
          value={dateRange}
          onChange={(next) => {
            table.setFilter('startDateFrom', next.from);
            table.setFilter('startDateTo', next.to);
          }}
          placeholder={t('contracts.startDateRangePlaceholder')}
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
        emptyTitle={t('contracts.emptyTitle')}
        emptyDescription={canWrite ? t('contracts.emptyDescriptionWrite') : t('contracts.emptyDescriptionReadOnly')}
      />

      <DataTablePagination meta={table.meta} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />

      {canWrite ? (
        <>
          <ContractFormWizard open={isCreating} onOpenChange={setIsCreating} />

          <ConfirmDialog
            open={activateTarget !== null}
            onOpenChange={(open) => !open && setActivateTarget(null)}
            title={activateTarget ? t('contracts.activateConfirmTitle', { number: activateTarget.number }) : ''}
            description={t('contracts.activateConfirmDescription')}
            confirmLabel={t('contracts.activate')}
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
