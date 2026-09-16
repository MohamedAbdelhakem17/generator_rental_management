import { ArrowRight, Cog, History, User } from 'lucide-react';

import { useLocale } from '@/lib/i18n/locale-provider';
import { StatusBadge } from '@/components/shared/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toBadgeStatus, type StatusHistoryEntry } from './types';

function formatAt(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Section 13: the Generator Profile Overview tab's "Status History" list, sourced from StatusChangeLog. */
export function StatusHistoryList({ entries, isLoading }: { entries: StatusHistoryEntry[]; isLoading: boolean }) {
  const { t } = useLocale();
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
        <History className="size-4 text-muted-foreground" aria-hidden />
        {t('generators.statusHistory')}
      </h2>

      {isLoading ? (
        <div className="mt-3 flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t('generators.noStatusChanges')}</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-border">
          {entries.map((entry, index) => (
            <li key={index} className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={toBadgeStatus(entry.from)} />
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <StatusBadge status={toBadgeStatus(entry.to)} />
                {entry.reason ? <span className="text-sm text-muted-foreground">{entry.reason}</span> : null}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {entry.triggeredBy === 'system' ? (
                  <Cog className="size-3.5 shrink-0" aria-hidden />
                ) : (
                  <User className="size-3.5 shrink-0" aria-hidden />
                )}
                <span className="tabular-data">{formatAt(entry.at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
