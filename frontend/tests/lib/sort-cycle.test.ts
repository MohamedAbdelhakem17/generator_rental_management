import { describe, expect, it } from 'vitest';

import { sortDirectionFor, toggleSort } from '@/lib/data-table/sort-cycle';

describe('toggleSort', () => {
  it('cycles unsorted -> ascending -> descending -> unsorted', () => {
    let sort: string | undefined = undefined;

    sort = toggleSort(sort, 'code');
    expect(sort).toBe('code');

    sort = toggleSort(sort, 'code');
    expect(sort).toBe('-code');

    sort = toggleSort(sort, 'code');
    expect(sort).toBeUndefined();
  });

  it('switching to a different column starts that column at ascending', () => {
    expect(toggleSort('code', 'kva')).toBe('kva');
    expect(toggleSort('-code', 'kva')).toBe('kva');
  });
});

describe('sortDirectionFor', () => {
  it('reports asc/desc/null for the given column', () => {
    expect(sortDirectionFor('code', 'code')).toBe('asc');
    expect(sortDirectionFor('-code', 'code')).toBe('desc');
    expect(sortDirectionFor(undefined, 'code')).toBeNull();
    expect(sortDirectionFor('kva', 'code')).toBeNull();
  });
});
