import { describe, expect, it } from 'vitest';

import { isInvalidDateRange } from '@/lib/data-table/date-range-validation';

describe('isInvalidDateRange', () => {
  it('is invalid when from is after to', () => {
    expect(isInvalidDateRange(new Date('2026-03-10'), new Date('2026-03-01'))).toBe(true);
  });

  it('is valid when from is before or equal to to', () => {
    expect(isInvalidDateRange(new Date('2026-03-01'), new Date('2026-03-10'))).toBe(false);
    expect(isInvalidDateRange(new Date('2026-03-01'), new Date('2026-03-01'))).toBe(false);
  });

  it('is valid when either end is unset', () => {
    expect(isInvalidDateRange(undefined, new Date('2026-03-01'))).toBe(false);
    expect(isInvalidDateRange(new Date('2026-03-01'), undefined)).toBe(false);
    expect(isInvalidDateRange(undefined, undefined)).toBe(false);
  });
});
