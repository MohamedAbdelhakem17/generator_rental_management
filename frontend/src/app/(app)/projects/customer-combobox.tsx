'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';

import { apiClient } from '@/lib/apiClient';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { CustomerRow } from '../customers/types';

export interface CustomerComboboxProps {
  value: string;
  onSelect: (customer: CustomerRow) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Section 18: "Customer select uses a searchable async combobox against /api/customers."
 * No Command/cmdk primitive exists in this app yet (Constitution: no new UI library) — this
 * is a Popover + debounced search built on the same primitives every other filter uses.
 */
export function CustomerCombobox({ value, onSelect, disabled, placeholder = 'Choose a customer…' }: CustomerComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  // Reset the shown label when the value is cleared externally (e.g. a "Clear filters"
  // action) — this component doesn't resolve an id back to a label on its own.
  useEffect(() => {
    if (!value) setSelectedLabel(null);
  }, [value]);

  const { data, isFetching } = useQuery({
    queryKey: ['customers', 'combobox', query],
    queryFn: ({ signal }) =>
      apiClient.getPaginated<CustomerRow>(
        '/api/customers',
        { search: query || undefined, limit: 20, active: 'true', sort: 'companyName' },
        signal,
      ),
    enabled: open,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', !selectedLabel && 'text-muted-foreground')}>{selectedLabel ?? placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="flex flex-col">
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search customers…"
            className="h-9 rounded-none border-0 border-b border-border focus-visible:ring-0"
          />
          <div className="max-h-60 overflow-y-auto p-1">
            {isFetching ? (
              <div className="flex items-center justify-center py-4 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
              </div>
            ) : data && data.items.length > 0 ? (
              data.items.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => {
                    onSelect(customer);
                    setSelectedLabel(`${customer.code} — ${customer.companyName}`);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start text-sm hover:bg-accent',
                    value === customer.id && 'bg-accent',
                  )}
                >
                  <Check className={cn('size-3.5 shrink-0', value === customer.id ? 'opacity-100' : 'opacity-0')} aria-hidden />
                  <span className="truncate">
                    {customer.code} — {customer.companyName}
                  </span>
                </button>
              ))
            ) : (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">No customers found.</p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
