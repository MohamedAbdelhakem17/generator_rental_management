'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { PaginationMeta } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export interface DataTablePaginationProps {
  meta: PaginationMeta | undefined;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}

export function DataTablePagination({
  meta,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
}: DataTablePaginationProps) {
  const { t } = useLocale();
  const page = meta?.page ?? 1;
  const limit = meta?.limit ?? pageSizeOptions[0] ?? 20;
  const total = meta?.total ?? 0;
  const totalPages = Math.max(meta?.totalPages ?? 1, 1);

  const rangeStart = total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd = Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2.5 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <span>{t('table.rowsPerPage')}</span>
        <Select value={String(limit)} onValueChange={(value) => onPageSizeChange(Number(value))}>
          <SelectTrigger className="h-7 w-16" aria-label={t('table.rowsPerPage')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-4">
        <span>
          {total === 0 ? t('table.zeroResults') : t('table.rangeOfTotal', { start: rangeStart, end: rangeEnd, total })}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label={t('table.previousPage')}
          >
            <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden />
          </Button>
          <span className="min-w-16 text-center">{t('table.pageOf', { page, totalPages })}</span>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label={t('table.nextPage')}
          >
            <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
