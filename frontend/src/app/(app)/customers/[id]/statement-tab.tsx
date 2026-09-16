'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import {
  DateRangeFilter,
  type DateRangeValue,
} from '@/components/data-table/filters/date-range-filter';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { useSession } from '@/lib/session/session-provider';
import { cn } from '@/lib/utils';
import { CreditNoteDialog } from './credit-note-dialog';

interface StatementEntry {
  date: string;
  type: 'Extract' | 'Receipt' | 'Credit Note' | 'Cancelled Extract';
  reference: string;
  referenceId: string;
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

function ReferenceLink({ entry }: { entry: StatementEntry }) {
  if (entry.type === 'Extract' || entry.type === 'Cancelled Extract') {
    return (
      <Link href={`/extracts/${entry.referenceId}`} className="font-medium text-primary hover:underline">
        {entry.reference}
      </Link>
    );
  }
  return <span className="font-medium">{entry.reference}</span>;
}

export function StatementTab({ customerId }: { customerId: string }) {
  const { t } = useLocale();
  const { user } = useSession();
  const canCreateCreditNote = user?.permissions.includes('credit-notes:write') ?? false;

  const [dateRange, setDateRange] = useState<DateRangeValue>({});
  const [isCreatingCreditNote, setIsCreatingCreditNote] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['customers', customerId, 'statement', dateRange.from, dateRange.to],
    queryFn: ({ signal }) =>
      apiClient.get<StatementResult>(
        `/api/customers/${customerId}/statement`,
        { from: dateRange.from, to: dateRange.to },
        signal,
      ),
  });

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (isError || !data) {
    return (
      <ErrorState
        title={t('customers.statementLoadFailedTitle')}
        description={error instanceof ApiError ? error.message : undefined}
        onRetry={refetch}
      />
    );
  }

  const closingBalance = Number(data.closingBalance);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DateRangeFilter
          value={dateRange}
          onChange={setDateRange}
          placeholder={t('customers.statementPeriodPlaceholder')}
        />
        {canCreateCreditNote ? (
          <Button variant="outline" size="sm" onClick={() => setIsCreatingCreditNote(true)}>
            {t('customers.newCreditNote')}
          </Button>
        ) : null}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
        <span className="text-sm font-medium text-muted-foreground">
          {t('customers.closingBalance')}
        </span>
        <span
          className={cn(
            'tabular-data text-lg font-semibold',
            closingBalance > 0
              ? 'text-destructive'
              : closingBalance < 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-foreground',
          )}
        >
          {data.closingBalance}
        </span>
      </div>

      {data.entries.length === 0 ? (
        <EmptyState
          title={t('customers.statementEmptyTitle')}
          description={t('customers.statementEmptyDescription')}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t('customers.statementDate')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('customers.statementType')}</th>
                <th className="px-3 py-2 text-start font-medium">
                  {t('customers.statementReference')}
                </th>
                <th className="px-3 py-2 text-end font-medium">{t('customers.statementDebit')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('customers.statementCredit')}</th>
                <th className="px-3 py-2 text-end font-medium">
                  {t('customers.statementRunningBalance')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {data.entries.map((entry, index) => (
                <tr key={`${entry.type}-${entry.referenceId}-${index}`}>
                  <td className="px-3 py-2 text-muted-foreground">{formatDate(entry.date)}</td>
                  <td className="px-3 py-2">{entry.type}</td>
                  <td className="px-3 py-2">
                    <ReferenceLink entry={entry} />
                  </td>
                  <td className="px-3 py-2 text-end tabular-data">{entry.debit}</td>
                  <td className="px-3 py-2 text-end tabular-data">{entry.credit}</td>
                  <td className="px-3 py-2 text-end tabular-data font-medium">
                    {entry.runningBalance}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canCreateCreditNote ? (
        <CreditNoteDialog
          open={isCreatingCreditNote}
          onOpenChange={setIsCreatingCreditNote}
          customerId={customerId}
          onCreated={() => refetch()}
        />
      ) : null}
    </div>
  );
}
