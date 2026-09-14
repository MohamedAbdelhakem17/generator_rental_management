'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/apiClient';
import type { RoleRow } from './types';

export const ROLES_QUERY_KEY = ['roles'];

/** All 6 roles are always fetched in one page — Role.name is only ever a fixed, small set. */
export function useRolesQuery() {
  return useQuery({
    queryKey: ROLES_QUERY_KEY,
    queryFn: ({ signal }) => apiClient.getPaginated<RoleRow>('/api/roles', { limit: 50, sort: 'name' }, signal),
  });
}
