'use client';

import { cn } from '@/lib/utils';
import { STATUS_TONE_CLASSES, type StatusTone } from '@/lib/status-tone';
import { SelectFilter } from './select-filter';

export interface StatusFilterOption {
  value: string;
  label: string;
  tone?: StatusTone;
}

export interface StatusFilterProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  options: StatusFilterOption[];
  placeholder?: string;
  allLabel?: string;
  className?: string;
}

/** A StatusBadge-colored SelectFilter — any module maps its own status enum to a tone. */
export function StatusFilter({ value, onChange, options, placeholder = 'Status', allLabel, className }: StatusFilterProps) {
  return (
    <SelectFilter
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      allLabel={allLabel}
      className={className}
      options={options.map((option) => ({
        value: option.value,
        label: option.label,
        icon: <span className={cn('size-1.5 shrink-0 rounded-full', STATUS_TONE_CLASSES[option.tone ?? 'neutral'].dot)} aria-hidden />,
      }))}
    />
  );
}
