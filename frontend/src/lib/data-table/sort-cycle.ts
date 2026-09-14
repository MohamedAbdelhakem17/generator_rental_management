/**
 * Pure sort-cycle logic (TASK-005 Section 15: unsorted -> ascending -> descending ->
 * unsorted), kept isolated from React/URL so it's trivially unit-testable. Sort state is
 * encoded Mongoose-style to match `paginateQuery`'s `sort` query param: "field" (asc),
 * "-field" (desc), absent (unsorted).
 */

export type SortDirection = 'asc' | 'desc' | null;

export function toggleSort(currentSort: string | undefined, columnId: string): string | undefined {
  if (currentSort === columnId) return `-${columnId}`;
  if (currentSort === `-${columnId}`) return undefined;
  return columnId;
}

export function sortDirectionFor(currentSort: string | undefined, columnId: string): SortDirection {
  if (currentSort === columnId) return 'asc';
  if (currentSort === `-${columnId}`) return 'desc';
  return null;
}
