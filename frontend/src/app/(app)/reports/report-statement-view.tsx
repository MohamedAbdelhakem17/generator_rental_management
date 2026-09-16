'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { DataTablePagination } from '@/components/data-table/pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import type { StatementReportDefinition } from './report-definitions';
import { ReportFilters, type ReportFilterState } from './report-filters';

interface StatementEntry {
  date: string;
  type: string;
  reference: string;
  debit: string;
  credit: string;
  runningBalance: string;
}

interface StatementResult {
  items: StatementEntry[];
  closingBalance: string;
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export function ReportStatementView({ definition }: { definition: StatementReportDefinition }) {
  const { t } = useLocale();
  const [filters, setFilters] = useState<ReportFilterState>({});
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reports', definition.id, filters, page, limit],
    queryFn: ({ signal }) =>
      apiClient.get<StatementResult>(
        definition.endpoint,
        { customerId: filters.customerId, from: filters.from, to: filters.to, page, limit },
        signal,
      ),
    enabled: Boolean(filters.customerId),
  });

  function handleFiltersChange(next: ReportFilterState) {
    setFilters(next);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-4">
      <ReportFilters kinds={definition.filters} value={filters} onChange={handleFiltersChange} />

      {!filters.customerId ? (
        <EmptyState title={t('reports.chooseCustomerTitle')} description={t('reports.chooseCustomerDescription')} />
      ) : isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : isError || !data ? (
        <ErrorState title={t('reports.loadFailedTitle')} onRetry={refetch} />
      ) : (
        <>
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
            <span className="text-sm font-medium text-muted-foreground">{t('reports.closingBalance')}</span>
            <span className="tabular-data text-lg font-semibold text-foreground">{data.closingBalance}</span>
          </div>

          {data.items.length === 0 ? (
            <EmptyState title={t('reports.emptyTitle')} description={t('reports.emptyDescription')} />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">{t('reports.colDate')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('reports.colType')}</th>
                    <th className="px-3 py-2 text-start font-medium">{t('reports.colReference')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('reports.colDebit')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('reports.colCredit')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('reports.colRunningBalance')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {data.items.map((entry, index) => (
                    <tr key={index}>
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Date(entry.date).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2">{entry.type}</td>
                      <td className="px-3 py-2 font-medium">{entry.reference}</td>
                      <td className="px-3 py-2 text-end tabular-data">{entry.debit}</td>
                      <td className="px-3 py-2 text-end tabular-data">{entry.credit}</td>
                      <td className="px-3 py-2 text-end tabular-data font-medium">{entry.runningBalance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <DataTablePagination
            meta={data.meta}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setLimit(next);
              setPage(1);
            }}
          />
        </>
      )}
    </div>
  );
}
