/**
 * TASK-005 Section 16: a date range where `from > to` must disable Apply, never submit.
 * Kept pure/isolated from the Popover+Calendar wiring so it's trivially unit-testable.
 */
export function isInvalidDateRange(from: Date | undefined, to: Date | undefined): boolean {
  return Boolean(from && to && from > to);
}
