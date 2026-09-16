import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocale } from '@/lib/i18n/locale-provider';
import type { BreadcrumbItem } from '@/lib/layout/use-breadcrumb';
import { cn } from '@/lib/utils';

export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  const { t } = useLocale();
  return (
    <nav aria-label={t('shell.breadcrumb')} className={cn('min-w-0', className)}>
      <ol className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.href ?? item.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {i > 0 ? (
                <ChevronRight className="size-3.5 shrink-0 rtl:rotate-180" aria-hidden />
              ) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  {item.href && !isLast ? (
                    <Link
                      href={item.href}
                      className="max-w-40 truncate hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span
                      className={cn('max-w-48 truncate', isLast && 'font-medium text-foreground')}
                    >
                      {item.label}
                    </span>
                  )}
                </TooltipTrigger>
                <TooltipContent>{item.label}</TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
