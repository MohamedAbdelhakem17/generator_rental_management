'use client';

import { Zap } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocale } from '@/lib/i18n/locale-provider';
import { NAV_GROUPS } from '@/lib/nav-config';
import { canAccessModule } from '@/lib/permissions/roles';
import { useSession } from '@/lib/session/session-provider';
import { cn } from '@/lib/utils';

export function useVisibleNavGroups() {
  const { role } = useSession();
  return NAV_GROUPS.map((group) => ({
    items: group.items.filter((item) => canAccessModule(role, item.module)),
  })).filter((group) => group.items.length > 0);
}

export function SidebarBrand({ collapsed }: { collapsed?: boolean }) {
  const { t } = useLocale();
  return (
    <Link href="/" className="flex h-14 shrink-0 items-center gap-2 px-4">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Zap className="size-4" aria-hidden />
      </span>
      {!collapsed && (
        <span className="truncate text-sm font-semibold text-foreground">{t('shell.brand')}</span>
      )}
    </Link>
  );
}

export function SidebarNav({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const { t, direction } = useLocale();
  const groups = useVisibleNavGroups();
  const tooltipSide = direction === 'rtl' ? 'left' : 'right';

  return (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-3">
      {groups.map((group, gi) => (
        <ul key={gi} className="flex flex-col gap-0.5">
          {group.items.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            const link = (
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                  collapsed && 'justify-center px-0',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
              </Link>
            );

            return (
              <li key={item.module}>
                {collapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side={tooltipSide}>{t(item.labelKey)}</TooltipContent>
                  </Tooltip>
                ) : (
                  link
                )}
              </li>
            );
          })}
        </ul>
      ))}
    </nav>
  );
}
