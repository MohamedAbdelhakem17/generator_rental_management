'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';

import { SelectFilter } from '@/components/data-table/filters/select-filter';
import { DataTablePagination } from '@/components/data-table/pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/page-header';
import { useDataTableQuery } from '@/hooks/useDataTableQuery';
import { apiClient } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { cn } from '@/lib/utils';
import { notificationEntityHref } from './entity-link';
import type { NotificationRow, NotificationSeverity, NotificationType } from './types';

const SEVERITIES: NotificationSeverity[] = ['critical', 'warning', 'info'];
const TYPES: NotificationType[] = [
  'FuelAlert',
  'MaintenanceAlert',
  'ContractExpiry',
  'OverdueCustomer',
  'GeneratorStoppedWhileAssigned',
];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={null}>
      <NotificationsPageContent />
    </Suspense>
  );
}

function NotificationsPageContent() {
  const { t } = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();

  const table = useDataTableQuery<NotificationRow>({
    queryKey: 'notifications',
    queryFn: (params, signal) =>
      apiClient.getPaginated<NotificationRow>(
        '/api/notifications',
        { page: params.page, limit: params.limit, ...params.filters },
        signal,
      ),
  });

  const severityOptions = SEVERITIES.map((severity) => ({
    value: severity,
    label: t(`notifications.severity${severity[0]!.toUpperCase()}${severity.slice(1)}` as `notifications.severity${'Critical' | 'Warning' | 'Info'}`),
  }));
  const typeOptions = TYPES.map((type) => ({
    value: type,
    label: t(`notifications.type${type}` as `notifications.type${NotificationType}`),
  }));
  const statusOptions = [
    { value: 'Unread', label: t('notifications.statusUnread') },
    { value: 'Read', label: t('notifications.statusRead') },
  ];

  async function invalidate() {
    await Promise.all([
      table.refetch(),
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications', 'latest'] }),
    ]);
  }

  async function handleOpen(notification: NotificationRow) {
    try {
      if (notification.status === 'Unread') {
        await apiClient.patch(`/api/notifications/${notification.id}/read`);
        await invalidate();
      }
    } finally {
      router.push(notificationEntityHref(notification));
    }
  }

  async function handleMarkAllRead() {
    await apiClient.patch('/api/notifications/read-all');
    await invalidate();
  }

  return (
    <>
      <PageHeader
        title={t('notifications.title')}
        description={t('notifications.description')}
        action={
          <Button variant="outline" size="sm" onClick={() => void handleMarkAllRead()}>
            {t('notifications.markAllRead')}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SelectFilter
          value={table.filters.status}
          onChange={(value) => table.setFilter('status', value)}
          options={statusOptions}
          placeholder={t('notifications.statusPlaceholder')}
          allLabel={t('notifications.allStatusesLabel')}
        />
        <SelectFilter
          value={table.filters.severity}
          onChange={(value) => table.setFilter('severity', value)}
          options={severityOptions}
          placeholder={t('notifications.severityPlaceholder')}
          allLabel={t('notifications.allSeveritiesLabel')}
        />
        <SelectFilter
          value={table.filters.type}
          onChange={(value) => table.setFilter('type', value)}
          options={typeOptions}
          placeholder={t('notifications.typePlaceholder')}
          allLabel={t('notifications.allTypesLabel')}
        />
        {table.hasActiveFilters ? (
          <Button variant="ghost" size="sm" onClick={table.clearFilters}>
            {t('table.clearFilters')}
          </Button>
        ) : null}
      </div>

      {table.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : table.isError ? (
        <ErrorState title={t('notifications.loadFailedTitle')} onRetry={table.refetch} />
      ) : table.items.length === 0 ? (
        <EmptyState title={t('notifications.emptyTitle')} description={t('notifications.emptyDescription')} />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
          {table.items.map((notification) => (
            <li key={notification.id}>
              <button
                type="button"
                onClick={() => void handleOpen(notification)}
                className={cn(
                  'flex w-full flex-col gap-1 border-s-2 px-4 py-3 text-start transition-colors hover:bg-muted',
                  notification.severity === 'critical' ? 'border-s-destructive' : 'border-s-transparent',
                  notification.status === 'Unread' ? 'bg-accent/40' : '',
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{notification.title}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(notification.createdAt)}</span>
                </div>
                <p className="text-sm text-muted-foreground">{notification.message}</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <DataTablePagination
        meta={table.meta}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
      />
    </>
  );
}
