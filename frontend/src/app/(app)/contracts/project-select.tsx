'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ProjectRow } from '../projects/types';

export interface ProjectSelectProps {
  customerId: string;
  value: string;
  onChange: (projectId: string) => void;
  disabled?: boolean;
}

/** Scoped to a single customer's Active projects — small enough for a plain Select (no async search needed). */
export function ProjectSelect({ customerId, value, onChange, disabled }: ProjectSelectProps) {
  const { t } = useLocale();
  const { data, isFetching } = useQuery({
    queryKey: ['projects', 'select', customerId],
    queryFn: ({ signal }) =>
      apiClient.getPaginated<ProjectRow>('/api/projects', { customerId, status: 'Active', limit: 100, sort: 'name' }, signal),
    enabled: Boolean(customerId),
  });

  const placeholder = customerId
    ? isFetching
      ? t('contracts.loadingProjects')
      : t('contracts.chooseProjectPlaceholder')
    : t('contracts.chooseCustomerFirstPlaceholder');

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled || !customerId}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {data?.items.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">{t('contracts.noActiveProjectsForCustomer')}</div>
        ) : (
          data?.items.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.code} — {project.name}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
