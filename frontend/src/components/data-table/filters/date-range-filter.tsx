'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { isInvalidDateRange } from '@/lib/data-table/date-range-validation';

export interface DateRangeValue {
  from?: string;
  to?: string;
}

export interface DateRangeFilterProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  placeholder?: string;
  className?: string;
}

function toDate(iso: string | undefined): Date | undefined {
  return iso ? new Date(`${iso}T00:00:00`) : undefined;
}

function toIso(date: Date | undefined): string | undefined {
  return date ? format(date, 'yyyy-MM-dd') : undefined;
}

/** Section 16: from <= to is enforced by disabling Apply, never by submitting an invalid range. */
export function DateRangeFilter({ value, onChange, placeholder = 'Date range', className }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>({ from: toDate(value.from), to: toDate(value.to) });

  useEffect(() => {
    if (!open) setDraft({ from: toDate(value.from), to: toDate(value.to) });
  }, [open, value.from, value.to]);

  const isInvalid = isInvalidDateRange(draft?.from, draft?.to);

  function handleApply() {
    if (isInvalid) return;
    onChange({ from: toIso(draft?.from), to: toIso(draft?.to) });
    setOpen(false);
  }

  function handleClear() {
    onChange({ from: undefined, to: undefined });
    setOpen(false);
  }

  const label =
    value.from || value.to
      ? `${value.from ? format(toDate(value.from)!, 'MMM d, yyyy') : '…'} – ${value.to ? format(toDate(value.to)!, 'MMM d, yyyy') : '…'}`
      : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <CalendarIcon className="size-4" aria-hidden />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar mode="range" selected={draft} onSelect={setDraft} numberOfMonths={2} />
        <div className="flex items-center justify-between gap-2 border-t border-border p-2">
          <button type="button" onClick={handleClear} className="text-sm text-muted-foreground hover:text-foreground">
            Clear
          </button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={isInvalid} onClick={handleApply}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
