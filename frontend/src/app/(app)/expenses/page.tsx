'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { Suspense, useState } from 'react';

import { DataTable } from '@/components/data-table/data-table';
import {
  DateRangeFilter,
  type DateRangeValue,
} from '@/components/data-table/filters/date-range-filter';
import { SearchInput } from '@/components/data-table/filters/search-input';
import { DataTablePagination } from '@/components/data-table/pagination';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { useDataTableQuery } from '@/hooks/useDataTableQuery';
import { apiClient } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { useSession } from '@/lib/session/session-provider';
import { AllocateExpenseDialog } from './allocate-expense-dialog';
import { ExpenseFormDialog } from './expense-form-dialog';
import type { ExpenseRow } from './types';

const columnHelper = createColumnHelper<ExpenseRow>();

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ExpensesPage() {
  // useDataTableQuery reads useSearchParams(), which needs a Suspense boundary (TASK-005).
  return (
    <Suspense fallback={null}>
      <ExpensesPageContent />
    </Suspense>
  );
}

function ExpensesPageContent() {
  const { t } = useLocale();
  const { user } = useSession();
  const canWrite = user?.permissions.includes('expenses:write') ?? false;
  const canAllocate = user?.permissions.includes('expenses:allocate') ?? false;

  const [isCreating, setIsCreating] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [allocating, setAllocating] = useState<ExpenseRow | null>(null);

  const table = useDataTableQuery<ExpenseRow>({
    queryKey: 'expenses',
    queryFn: (params, signal) =>
      apiClient.getPaginated<ExpenseRow>(
        '/api/expenses',
        { page: params.page, limit: params.limit, sort: params.sort, ...params.filters },
        signal,
      ),
    defaultSort: '-date',
  });

  const dateRange: DateRangeValue = { from: table.filters.dateFrom, to: table.filters.dateTo };
  const unallocatedOnly = table.filters.unallocatedOnly === 'true';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<ExpenseRow, any>[] = [
    columnHelper.accessor('date', {
      header: t('expenses.columnDate'),
      cell: (info) => formatDate(info.getValue()),
    }),
    columnHelper.accessor('category', {
      header: t('expenses.columnCategory'),
    }),
    columnHelper.accessor('amount', {
      header: t('expenses.columnAmount'),
      enableSorting: false,
      cell: (info) => <span className="tabular-data">{info.getValue()}</span>,
    }),
    columnHelper.display({
      id: 'attribution',
      header: t('expenses.columnAttribution'),
      cell: ({ row }) => {
        const expense = row.original;
        if (expense.generatorId) {
          return <span className="text-sm">{t('expenses.attributionGenerator')}</span>;
        }
        if (expense.projectId) {
          return <span className="text-sm">{t('expenses.attributionProject')}</span>;
        }
        return (
          <span className="inline-flex items-center rounded-sm border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            {t('expenses.attributionUnallocated')}
          </span>
        );
      },
    }),
    columnHelper.accessor('description', {
      header: t('expenses.columnDescription'),
      enableSorting: false,
      cell: (info) => <span className="text-muted-foreground">{info.getValue() || '—'}</span>,
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const expense = row.original;
        const isUnallocated = !expense.generatorId && !expense.projectId;
        const isAllocatedChild = Boolean(expense.allocatedFrom);
        return (
          <div className="flex justify-end gap-1">
            {canWrite && !isAllocatedChild ? (
              <Button variant="ghost" size="sm" onClick={() => setEditing(expense)}>
                {t('expenses.editButton')}
              </Button>
            ) : null}
            {canAllocate && isUnallocated && !isAllocatedChild ? (
              <Button variant="ghost" size="sm" onClick={() => setAllocating(expense)}>
                {t('expenses.allocateButton')}
              </Button>
            ) : null}
          </div>
        );
      },
    }),
  ];

  return (
    <>
      <PageHeader
        title={t('expenses.title')}
        description={t('expenses.description')}
        action={
          canWrite ? (
            <Button size="sm" onClick={() => setIsCreating(true)}>
              <Plus className="size-4" aria-hidden />
              {t('expenses.newExpense')}
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={table.filters.category ?? ''}
          onChange={(value) => table.setFilter('category', value || undefined)}
          placeholder={t('expenses.categoryFilterPlaceholder')}
        />
        <DateRangeFilter
          value={dateRange}
          onChange={(next) => {
            table.setFilter('dateFrom', next.from);
            table.setFilter('dateTo', next.to);
          }}
          placeholder={t('expenses.periodPlaceholder')}
        />
        <Button
          variant={unallocatedOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => table.setFilter('unallocatedOnly', unallocatedOnly ? undefined : 'true')}
        >
          {t('expenses.unallocatedOnlyChip')}
        </Button>
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
        emptyTitle={t('expenses.emptyTitle')}
        emptyDescription={
          canWrite ? t('expenses.emptyDescriptionWrite') : t('expenses.emptyDescriptionReadOnly')
        }
      />

      <DataTablePagination
        meta={table.meta}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
      />

      {canWrite ? (
        <ExpenseFormDialog open={isCreating} onOpenChange={setIsCreating} />
      ) : null}

      {editing ? (
        <ExpenseFormDialog
          open={editing !== null}
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
          expense={editing}
        />
      ) : null}

      {allocating ? (
        <AllocateExpenseDialog
          open={allocating !== null}
          onOpenChange={(next) => {
            if (!next) setAllocating(null);
          }}
          expense={allocating}
        />
      ) : null}
    </>
  );
}
