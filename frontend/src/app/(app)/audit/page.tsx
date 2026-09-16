'use client';

import { Suspense, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye } from 'lucide-react';

import { PageHeader } from '@/components/layout/page-header';
import { DataTable } from '@/components/data-table/data-table';
import { DataTablePagination } from '@/components/data-table/pagination';
import { createActionsColumn } from '@/components/data-table/columns';
import {
  DateRangeFilter,
  type DateRangeValue,
} from '@/components/data-table/filters/date-range-filter';
import { SearchInput } from '@/components/data-table/filters/search-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDataTableQuery } from '@/hooks/useDataTableQuery';
import { apiClient } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { AuditDiffDialog } from './audit-diff-dialog';
import type { AuditLogRow } from './types';

const columnHelper = createColumnHelper<AuditLogRow>();

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AuditLogPage() {
  // useDataTableQuery reads useSearchParams(), which needs a Suspense boundary (TASK-005).
  return (
    <Suspense fallback={null}>
      <AuditLogPageContent />
    </Suspense>
  );
}

function AuditLogPageContent() {
  const { t } = useLocale();
  const [inspecting, setInspecting] = useState<AuditLogRow | null>(null);

  const table = useDataTableQuery<AuditLogRow>({
    queryKey: 'audit-logs',
    queryFn: (params, signal) =>
      apiClient.getPaginated<AuditLogRow>(
        '/api/audit-logs',
        { page: params.page, limit: params.limit, ...params.filters },
        signal,
      ),
    defaultSort: '-createdAt',
  });

  const dateRange: DateRangeValue = {
    from: table.filters.from,
    to: table.filters.to,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<AuditLogRow, any>[] = [
    columnHelper.accessor('createdAt', {
      header: t('audit.colTimestamp'),
      cell: (info) => <span className="tabular-data">{formatDateTime(info.getValue())}</span>,
    }),
    columnHelper.accessor('actorName', {
      header: t('audit.colActor'),
      cell: (info) => info.getValue() ?? t('audit.systemActor'),
    }),
    columnHelper.accessor('action', {
      header: t('audit.colAction'),
      cell: (info) => <span className="font-medium">{info.getValue()}</span>,
    }),
    columnHelper.display({
      id: 'entity',
      header: t('audit.colEntity'),
      cell: ({ row }) =>
        row.original.entityType ? `${row.original.entityType} · ${row.original.entityId}` : '—',
    }),
    createActionsColumn<AuditLogRow>((row) => (
      <Button variant="ghost" size="sm" onClick={() => setInspecting(row)}>
        <Eye className="size-4" aria-hidden />
        {t('audit.viewDiff')}
      </Button>
    )),
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('audit.pageTitle')} description={t('audit.pageDescription')} />

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={table.filters.action ?? ''}
          onChange={(value) => table.setFilter('action', value || undefined)}
          placeholder={t('audit.filterActionPlaceholder')}
        />
        <Input
          value={table.filters.entityType ?? ''}
          onChange={(event) => table.setFilter('entityType', event.target.value || undefined)}
          placeholder={t('audit.filterEntityTypePlaceholder')}
          className="w-40"
        />
        <Input
          value={table.filters.entityId ?? ''}
          onChange={(event) => table.setFilter('entityId', event.target.value || undefined)}
          placeholder={t('audit.filterEntityIdPlaceholder')}
          className="w-48"
        />
        <DateRangeFilter
          value={dateRange}
          onChange={(next) => {
            table.setFilter('from', next.from);
            table.setFilter('to', next.to);
          }}
        />
      </div>

      <DataTable
        columns={columns}
        data={table.items}
        getRowId={(row) => row._id}
        isLoading={table.isLoading}
        isError={table.isError}
        onRetry={table.refetch}
        emptyTitle={t('audit.emptyTitle')}
        emptyDescription={t('audit.emptyDescription')}
        hasActiveFilters={Object.keys(table.filters).length > 0}
        onClearFilters={table.clearFilters}
      />

      <DataTablePagination
        meta={table.meta}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
      />

      <AuditDiffDialog
        entry={inspecting}
        open={inspecting !== null}
        onOpenChange={(open) => !open && setInspecting(null)}
      />
    </div>
  );
}
