'use client';

import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useParams } from 'next/navigation';

import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';

interface StatementEntry {
  date: string;
  type: string;
  reference: string;
  debit: string;
  credit: string;
  runningBalance: string;
}

interface StatementResult {
  entries: StatementEntry[];
  closingBalance: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function CustomerStatementPrintPage() {
  const { t } = useLocale();
  const params = useParams<{ id: string }>();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['customers', params.id, 'statement', 'print'],
    queryFn: ({ signal }) =>
      apiClient.get<StatementResult>(`/api/customers/${params.id}/statement`, undefined, signal),
  });

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (isError || !data) {
    return <ErrorState title={t('customers.statementLoadFailedTitle')} onRetry={refetch} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end print:hidden">
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden />
          {t('export.printButtonLabel')}
        </Button>
      </div>

      <header className="border-b border-border pb-4">
        <h1 className="text-xl font-semibold text-foreground">{t('reports.customerStatementTitle')}</h1>
      </header>

      <table className="w-full text-sm">
        <thead className="border-b border-border text-xs text-muted-foreground">
          <tr>
            <th className="py-2 text-start font-medium">{t('reports.colDate')}</th>
            <th className="py-2 text-start font-medium">{t('reports.colType')}</th>
            <th className="py-2 text-start font-medium">{t('reports.colReference')}</th>
            <th className="py-2 text-end font-medium">{t('reports.colDebit')}</th>
            <th className="py-2 text-end font-medium">{t('reports.colCredit')}</th>
            <th className="py-2 text-end font-medium">{t('reports.colRunningBalance')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.entries.map((entry, index) => (
            <tr key={index}>
              <td className="py-2 text-muted-foreground">{formatDate(entry.date)}</td>
              <td className="py-2">{entry.type}</td>
              <td className="py-2 font-medium">{entry.reference}</td>
              <td className="py-2 text-end tabular-data">{entry.debit}</td>
              <td className="py-2 text-end tabular-data">{entry.credit}</td>
              <td className="py-2 text-end tabular-data font-medium">{entry.runningBalance}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ms-auto flex w-full max-w-xs justify-between border-t border-border pt-2 text-base font-semibold">
        <span>{t('reports.closingBalance')}</span>
        <span className="tabular-data">{data.closingBalance}</span>
      </div>
    </div>
  );
}
