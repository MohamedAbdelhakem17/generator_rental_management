'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/apiClient';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ProjectRow } from '../projects/types';

export interface ProjectSelectProps {
  value: string;
  onChange: (projectId: string) => void;
  disabled?: boolean;
}

/** Unscoped by customer (unlike the Contracts wizard's) — any Active project can have logs. */
export function ProjectSelect({ value, onChange, disabled }: ProjectSelectProps) {
  const { data } = useQuery({
    queryKey: ['projects', 'select', 'active'],
    queryFn: ({ signal }) => apiClient.getPaginated<ProjectRow>('/api/projects', { status: 'Active', limit: 100, sort: 'name' }, signal),
  });

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder="Choose a project…" />
      </SelectTrigger>
      <SelectContent>
        {data?.items.map((project) => (
          <SelectItem key={project.id} value={project.id}>
            {project.code} — {project.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
