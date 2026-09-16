'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';

import { useLocale } from '@/lib/i18n/locale-provider';
import { cn } from '@/lib/utils';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}

/** Debounced text filter — commits to `onChange` (and so the URL) after typing settles. */
export function SearchInput({ value, onChange, placeholder, debounceMs = 300, className }: SearchInputProps) {
  const { t } = useLocale();
  const resolvedPlaceholder = placeholder ?? t('table.search');
  const [draft, setDraft] = useState(value);

  // Stay in sync when the value changes externally (e.g. "Clear filters").
  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onChange(draft), debounceMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, debounceMs]);

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={resolvedPlaceholder}
        aria-label={resolvedPlaceholder}
        className="h-8 w-full rounded-md border border-input bg-surface ps-8 pe-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {draft ? (
        <button
          type="button"
          onClick={() => setDraft('')}
          aria-label={t('table.clearSearch')}
          className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
