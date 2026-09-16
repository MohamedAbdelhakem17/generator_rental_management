'use client';

import { useQuery } from '@tanstack/react-query';

import { DateRangeFilter, type DateRangeValue } from '@/components/data-table/filters/date-range-filter';
import { SearchInput } from '@/components/data-table/filters/search-input';
import { SelectFilter } from '@/components/data-table/filters/select-filter';
import { apiClient } from '@/lib/apiClient';
import { useLocale } from '@/lib/i18n/locale-provider';
import { CustomerCombobox } from '../projects/customer-combobox';
import type { ProjectRow } from '../projects/types';
import type { GeneratorRow } from '../generators/types';
import type { FilterKind } from './report-definitions';

export interface ReportFilterState {
  from?: string;
  to?: string;
  projectId?: string;
  generatorId?: string;
  customerId?: string;
  category?: string;
  type?: string;
}

export interface ReportFiltersProps {
  kinds: FilterKind[];
  value: ReportFilterState;
  onChange: (next: ReportFilterState) => void;
}

export function ReportFilters({ kinds, value, onChange }: ReportFiltersProps) {
  const { t } = useLocale();

  const { data: generators } = useQuery({
    queryKey: ['generators', 'select'],
    queryFn: ({ signal }) =>
      apiClient.getPaginated<GeneratorRow>('/api/generators', { limit: 100, sort: 'code' }, signal),
    enabled: kinds.includes('generator'),
  });
  const { data: projects } = useQuery({
    queryKey: ['projects', 'select', 'reports'],
    queryFn: ({ signal }) =>
      apiClient.getPaginated<ProjectRow>('/api/projects', { limit: 100, sort: 'name' }, signal),
    enabled: kinds.includes('project'),
  });

  const dateRange: DateRangeValue = { from: value.from, to: value.to };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {kinds.includes('dateRange') ? (
        <DateRangeFilter
          value={dateRange}
          onChange={(next) => onChange({ ...value, from: next.from, to: next.to })}
          placeholder={t('reports.periodPlaceholder')}
        />
      ) : null}
      {kinds.includes('customer') ? (
        <CustomerCombobox
          value={value.customerId ?? ''}
          onSelect={(customer) => onChange({ ...value, customerId: customer.id })}
        />
      ) : null}
      {kinds.includes('project') ? (
        <SelectFilter
          value={value.projectId}
          onChange={(next) => onChange({ ...value, projectId: next })}
          options={(projects?.items ?? []).map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
          placeholder={t('reports.projectPlaceholder')}
          allLabel={t('reports.allProjectsLabel')}
        />
      ) : null}
      {kinds.includes('generator') ? (
        <SelectFilter
          value={value.generatorId}
          onChange={(next) => onChange({ ...value, generatorId: next })}
          options={(generators?.items ?? []).map((g) => ({ value: g.id, label: g.code }))}
          placeholder={t('reports.generatorPlaceholder')}
          allLabel={t('reports.allGeneratorsLabel')}
        />
      ) : null}
      {kinds.includes('category') ? (
        <SearchInput
          value={value.category ?? ''}
          onChange={(next) => onChange({ ...value, category: next || undefined })}
          placeholder={t('reports.categoryPlaceholder')}
        />
      ) : null}
      {kinds.includes('maintenanceType') ? (
        <SelectFilter
          value={value.type}
          onChange={(next) => onChange({ ...value, type: next })}
          options={[
            { value: 'Preventive', label: t('reports.typePreventive') },
            { value: 'Corrective', label: t('reports.typeCorrective') },
          ]}
          placeholder={t('reports.typePlaceholder')}
          allLabel={t('reports.allTypesLabel')}
        />
      ) : null}
    </div>
  );
}
