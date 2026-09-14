import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useQueryParams } from '@/lib/url/use-query-params';

const replace = vi.fn();
let currentSearch = '';

vi.mock('next/navigation', () => ({
  usePathname: () => '/generators',
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

beforeEach(() => {
  replace.mockClear();
  currentSearch = '';
});

describe('useQueryParams', () => {
  it('parses the current URL search params', () => {
    currentSearch = 'page=2&status=active';
    const { result } = renderHook(() => useQueryParams());
    expect(result.current.params).toEqual({ page: '2', status: 'active' });
  });

  it('setParams merges a patch into the URL and navigates without a scroll reset', () => {
    currentSearch = 'page=2';
    const { result } = renderHook(() => useQueryParams());

    act(() => result.current.setParams({ status: 'active' }));

    expect(replace).toHaveBeenCalledWith('/generators?page=2&status=active', { scroll: false });
  });

  it('removes a key when its value is undefined or empty', () => {
    currentSearch = 'page=2&status=active';
    const { result } = renderHook(() => useQueryParams());

    act(() => result.current.setParams({ status: undefined }));

    expect(replace).toHaveBeenCalledWith('/generators?page=2', { scroll: false });
  });

  it('navigates to the bare pathname once every param is cleared', () => {
    currentSearch = 'page=2';
    const { result } = renderHook(() => useQueryParams());

    act(() => result.current.setParams({ page: undefined }));

    expect(replace).toHaveBeenCalledWith('/generators', { scroll: false });
  });
});
