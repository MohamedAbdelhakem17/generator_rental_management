'use client';

import { useLocale } from '@/lib/i18n/locale-provider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface SelectFilterOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export interface SelectFilterProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  options: SelectFilterOption[];
  placeholder: string;
  allLabel?: string;
  className?: string;
}

const ALL_VALUE = '__all__';

/** Generic single-select URL filter; StatusFilter is a thin domain wrapper around this. */
export function SelectFilter({ value, onChange, options, placeholder, allLabel, className }: SelectFilterProps) {
  const { t } = useLocale();
  const resolvedAllLabel = allLabel ?? t('table.all');
  return (
    <Select value={value ?? ALL_VALUE} onValueChange={(next) => onChange(next === ALL_VALUE ? undefined : next)}>
      <SelectTrigger className={className ?? 'h-8 w-40'} aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>{resolvedAllLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex items-center gap-2">
              {option.icon}
              {option.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
