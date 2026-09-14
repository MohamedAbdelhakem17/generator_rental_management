'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import { NAV_GROUPS } from '@/lib/nav-config';
import { useLocale } from '@/lib/i18n/locale-provider';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

const navLabelByHref = new Map(
  NAV_GROUPS.flatMap((group) => group.items).map((item) => [item.href, item.labelKey] as const),
);

function titleize(segment: string) {
  return segment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Derives breadcrumb trail from the current route until feature pages start supplying real titles (TASK-005+). */
export function useBreadcrumb(): BreadcrumbItem[] {
  const pathname = usePathname();
  const { t } = useLocale();

  return useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    const items: BreadcrumbItem[] = [{ label: t('shell.home'), href: '/' }];

    let href = '';
    for (const segment of segments) {
      href += `/${segment}`;
      const labelKey = navLabelByHref.get(href);
      items.push({ label: labelKey ? t(labelKey) : titleize(segment), href });
    }

    return items;
  }, [pathname, t]);
}
