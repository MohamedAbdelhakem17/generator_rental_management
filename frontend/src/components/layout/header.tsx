'use client';

import { Bell, Languages, LogOut, Menu, Search, User } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLocale } from '@/lib/i18n/locale-provider';
import { useSidebarState } from '@/lib/layout/sidebar-context';
import { useBreadcrumb } from '@/lib/layout/use-breadcrumb';
import { ROLE_LABEL_KEYS } from '@/lib/permissions/roles';
import { useSession } from '@/lib/session/session-provider';
import { Breadcrumb } from './breadcrumb';

export function Header() {
  const { t, locale, setLocale } = useLocale();
  const { setMobileOpen } = useSidebarState();
  const { role, userName, logout } = useSession();
  const breadcrumbItems = useBreadcrumb();

  const initials = userName
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur supports-backdrop-filter:bg-surface/80">
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
          <Search
            className="pointer-events-none absolute inset-s-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            placeholder={t('shell.search')}
            aria-label={t('shell.search')}
            disabled
            className="h-8 w-56 rounded-md border border-input bg-background ps-8 pe-3 text-sm text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 px-2"
          onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
          aria-label={t('shell.toggleLanguage')}
        >
          <Languages className="size-4" aria-hidden />
          <span className="text-xs font-medium">{locale === 'ar' ? 'EN' : 'ع'}</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t('shell.notifications')}>
              <Bell className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>{t('shell.notifications')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              {t('shell.noNotifications')}
            </p>
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
              <p className="truncate text-xs font-normal text-muted-foreground">
                {t(ROLE_LABEL_KEYS[role])}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="size-4" aria-hidden />
              {t('shell.account')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void logout()}>
              <LogOut className="size-4" aria-hidden />
              {t('shell.signOut')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
