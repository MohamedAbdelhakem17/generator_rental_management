'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/apiClient';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { GeneratorRow } from '../generators/types';

export interface GeneratorSelectProps {
  value: string;
  onChange: (generatorId: string) => void;
  disabled?: boolean;
}

/** The fleet is a bounded list (unlike Customers) — a plain Select over the first page is enough. */
export function GeneratorSelect({ value, onChange, disabled }: GeneratorSelectProps) {
  const { data } = useQuery({
    queryKey: ['generators', 'select'],
    queryFn: ({ signal }) => apiClient.getPaginated<GeneratorRow>('/api/generators', { limit: 100, sort: 'code' }, signal),
  });

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder="Choose a generator…" />
      </SelectTrigger>
      <SelectContent>
        {data?.items.map((generator) => (
          <SelectItem key={generator.id} value={generator.id}>
            {generator.code} — {generator.specifications.brand} {generator.specifications.model}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
