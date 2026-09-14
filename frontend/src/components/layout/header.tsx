'use client';

import { Bell, LogOut, Menu, Search, User } from 'lucide-react';

import { useLocale } from '@/lib/i18n/locale-provider';
import { useSession } from '@/lib/session/dev-session-provider';
import { useSidebarState } from '@/lib/layout/sidebar-context';
import { useBreadcrumb } from '@/lib/layout/use-breadcrumb';
import { ROLE_LABELS } from '@/lib/permissions/roles';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Breadcrumb } from './breadcrumb';

export function Header() {
  const { t } = useLocale();
  const { setMobileOpen } = useSidebarState();
  const { role, userName } = useSession();
  const breadcrumbItems = useBreadcrumb();

  const initials = userName
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label={t('shell.expandSidebar')}
      >
        <Menu className="size-4" aria-hidden />
      </Button>

      <Breadcrumb items={breadcrumbItems} className="hidden sm:block" />

      <div className="ms-auto flex items-center gap-1.5">
        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            placeholder={t('shell.search')}
            aria-label={t('shell.search')}
            disabled
            className="h-8 w-56 rounded-md border border-input bg-background ps-8 pe-3 text-sm text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t('shell.notifications')}>
              <Bell className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>{t('shell.notifications')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">{t('shell.noNotifications')}</p>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-md p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('shell.account')}
            >
              <Avatar>
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>
              <p className="truncate font-medium">{userName}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">{ROLE_LABELS[role]}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="size-4" aria-hidden />
              {t('shell.account')}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <LogOut className="size-4" aria-hidden />
              {t('shell.signOut')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
