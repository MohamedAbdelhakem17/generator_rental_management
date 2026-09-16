'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { DataTablePagination } from '@/components/data-table/pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { ExportButton } from '@/components/shared/export-button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { cn } from '@/lib/utils';
import type { TableReportDefinition } from './report-definitions';
import { ReportFilters, type ReportFilterState } from './report-filters';
import type { ReportColumn, ReportListResult } from './types';

function formatCell(row: Record<string, unknown>, column: ReportColumn): string {
  const value = row[column.key];
  if (value === null || value === undefined) return '—';
  if (column.format === 'date') return new Date(String(value)).toLocaleDateString();
  if (column.format === 'percent') return `${Number(value).toFixed(1)}%`;
  if (column.format === 'money') return String(value);
  return String(value);
}

export function ReportTableView({ definition }: { definition: TableReportDefinition }) {
  const { t } = useLocale();
  const [filters, setFilters] = useState<ReportFilterState>({});
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const { data: result, isLoading, isError, refetch } = useQuery({
    queryKey: ['reports', definition.id, filters, page, limit],
    queryFn: ({ signal }) =>
      apiClient.getPaginated<ReportListResult['items'][number]>(
        definition.endpoint,
        {
          from: filters.from,
          to: filters.to,
          projectId: filters.projectId,
          generatorId: filters.generatorId,
          customerId: filters.customerId,
          category: filters.category,
          type: filters.type,
          page,
          limit,
        },
        signal,
      ),
  });

  const data = result?.items;
  const meta = result?.meta;

  function handleFiltersChange(next: ReportFilterState) {
    setFilters(next);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ReportFilters kinds={definition.filters} value={filters} onChange={handleFiltersChange} />
        <ExportButton reportType={definition.id} filters={filters} />
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : isError || !data ? (
        <ErrorState title={t('reports.loadFailedTitle')} onRetry={refetch} />
      ) : data.length === 0 ? (
        <EmptyState title={t('reports.emptyTitle')} description={t('reports.emptyDescription')} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                {definition.columns.map((column) => (
                  <th
                    key={column.key}
                    className={cn('px-3 py-2 font-medium', column.align === 'end' ? 'text-end' : 'text-start')}
                  >
                    {t(column.labelKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {data.map((row, index) => (
                <tr key={index}>
                  {definition.columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        'px-3 py-2',
                        column.align === 'end' ? 'text-end tabular-data' : 'text-start',
                      )}
                    >
                      {formatCell(row as Record<string, unknown>, column)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta ? (
        <DataTablePagination
          meta={meta}
          onPageChange={setPage}
          onPageSizeChange={(next) => {
            setLimit(next);
            setPage(1);
          }}
        />
      ) : null}
    </div>
  );
}
