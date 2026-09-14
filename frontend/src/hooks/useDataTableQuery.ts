'use client';

import { useCallback, useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { PaginatedResponse } from '@/lib/apiClient';
import { useQueryParams } from '@/lib/url/use-query-params';
import { toggleSort } from '@/lib/data-table/sort-cycle';

const RESERVED_PARAM_KEYS = new Set(['page', 'limit', 'sort', 'q']);

export interface DataTableQueryParams {
  page: number;
  limit: number;
  sort: string | undefined;
  search: string | undefined;
  /** Every non-reserved URL param, e.g. { status: 'active' } from a StatusFilter. */
  filters: Record<string, string>;
}

export interface UseDataTableQueryOptions<T> {
  /** Identifies this table's cache entries, e.g. 'generators'. */
  queryKey: string;
  queryFn: (params: DataTableQueryParams, signal: AbortSignal) => Promise<PaginatedResponse<T>>;
  defaultPageSize?: number;
  defaultSort?: string;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Combines URL state (source of truth, Section 18) + apiClient + TanStack Query caching.
 * Every list screen wires its columns/filters around this hook instead of hand-rolling
 * fetch + pagination + sort state (TASK-005 Scope).
 *
 * Reads `useSearchParams()` under the hood, so the page component that calls this must be
 * wrapped in `<Suspense>` (Next.js requires this for any `useSearchParams()` consumer, or
 * the build fails with "should be wrapped in a suspense boundary").
 */
export function useDataTableQuery<T>({
  queryKey,
  queryFn,
  defaultPageSize = 20,
  defaultSort,
}: UseDataTableQueryOptions<T>) {
  const { params, setParams } = useQueryParams();

  const page = parsePositiveInt(params.page, 1);
  const limit = parsePositiveInt(params.limit, defaultPageSize);
  const sort = params.sort ?? defaultSort;
  const search = params.q ?? '';

  const filters = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      if (!RESERVED_PARAM_KEYS.has(key) && value) result[key] = value;
    }
    return result;
  }, [params]);

  const queryParams: DataTableQueryParams = {
    page,
    limit,
    sort,
    search: search || undefined,
    filters,
  };

  const query = useQuery({
    queryKey: [queryKey, queryParams],
    queryFn: ({ signal }) => queryFn(queryParams, signal),
    placeholderData: keepPreviousData,
  });

  const setPage = useCallback(
    (nextPage: number) => setParams({ page: nextPage > 1 ? String(nextPage) : undefined }),
    [setParams],
  );

  const setPageSize = useCallback(
    (size: number) =>
      setParams({ limit: size !== defaultPageSize ? String(size) : undefined, page: undefined }),
    [setParams, defaultPageSize],
  );

  const setSearch = useCallback((value: string) => setParams({ q: value || undefined, page: undefined }), [setParams]);

  const handleToggleSort = useCallback(
    (columnId: string) => setParams({ sort: toggleSort(sort, columnId), page: undefined }),
    [setParams, sort],
  );

  const setFilter = useCallback(
    (key: string, value: string | undefined) => setParams({ [key]: value, page: undefined }),
    [setParams],
  );

  const clearFilters = useCallback(() => {
    const patch: Record<string, undefined> = { page: undefined, q: undefined };
    for (const key of Object.keys(filters)) patch[key] = undefined;
    setParams(patch);
  }, [filters, setParams]);

  return {
    items: query.data?.items ?? [],
    meta: query.data?.meta,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    page,
    setPage,
    pageSize: limit,
    setPageSize,
    sort,
    toggleSort: handleToggleSort,
    search,
    setSearch,
    filters,
    setFilter,
    clearFilters,
    hasActiveFilters: Object.keys(filters).length > 0 || search.length > 0,
  };
}
