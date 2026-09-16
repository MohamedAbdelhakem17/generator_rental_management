'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { cn } from '@/lib/utils';
import type { NotificationRow, NotificationSeverity } from '../../app/(app)/notifications/types';
import { notificationEntityHref } from '../../app/(app)/notifications/entity-link';

const SEVERITY_DOT: Record<NotificationSeverity, string> = {
  info: 'bg-muted-foreground',
  warning: 'bg-status-maintenance-fg',
  critical: 'bg-destructive',
};

function timeAgo(iso: string, locale: 'en' | 'ar'): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return locale === 'ar' ? 'الآن' : 'just now';
  if (minutes < 60) return locale === 'ar' ? `منذ ${minutes} د` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale === 'ar' ? `منذ ${hours} س` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return locale === 'ar' ? `منذ ${days} ي` : `${days}d ago`;
}

export function NotificationBell() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: ({ signal }) => apiClient.get<{ count: number }>('/api/notifications/unread-count', undefined, signal),
    refetchInterval: 60_000,
  });

  const { data: latest } = useQuery({
    queryKey: ['notifications', 'latest'],
    queryFn: ({ signal }) =>
      apiClient.getPaginated<NotificationRow>('/api/notifications', { limit: 6, status: 'Unread' }, signal),
  });

  const count = unread?.count ?? 0;

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ]);
  }

  async function handleClick(notification: NotificationRow) {
    try {
      await apiClient.patch(`/api/notifications/${notification.id}/read`);
      await invalidate();
    } finally {
      router.push(notificationEntityHref(notification));
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t('shell.notifications')}>
          <Bell className="size-4" aria-hidden />
          {count > 0 ? (
            <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {count > 99 ? '99+' : count}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          {t('shell.notifications')}
          <Link href="/notifications" className="text-xs font-normal text-primary hover:underline">
            {t('notifications.viewAll')}
          </Link>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!latest || latest.items.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            {t('shell.noNotifications')}
          </p>
        ) : (
          <ul className="flex max-h-80 flex-col overflow-y-auto">
            {latest.items.map((notification) => (
              <li key={notification.id}>
                <button
                  type="button"
                  onClick={() => void handleClick(notification)}
                  className={cn(
                    'flex w-full flex-col gap-0.5 border-s-2 px-2.5 py-2 text-start text-sm transition-colors hover:bg-muted',
                    notification.severity === 'critical' ? 'border-s-destructive' : 'border-s-transparent',
                  )}
                >
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <span className={cn('size-1.5 shrink-0 rounded-full', SEVERITY_DOT[notification.severity])} aria-hidden />
                    {notification.title}
                  </span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">{notification.message}</span>
                  <span className="text-[11px] text-muted-foreground">{timeAgo(notification.createdAt, locale)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
