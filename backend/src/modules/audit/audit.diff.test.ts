import { describe, expect, it } from 'vitest';

import { computeDiff } from './audit.diff.js';

describe('computeDiff (TASK-031 FR-002)', () => {
  it('captures only fields that changed between before and after', () => {
    const before = { status: 'Under Review', vatRateSnapshot: null, number: 'EX-2026-0001' };
    const after = { status: 'Approved', vatRateSnapshot: 14, number: 'EX-2026-0001' };

    const diff = computeDiff(before, after);

    expect(diff.before).toEqual({ status: 'Under Review', vatRateSnapshot: null });
    expect(diff.after).toEqual({ status: 'Approved', vatRateSnapshot: 14 });
    expect(diff.before).not.toHaveProperty('number');
    expect(diff.after).not.toHaveProperty('number');
  });

  it('returns empty diffs when nothing changed', () => {
    const same = { status: 'Draft', amount: '100.00' };
    const diff = computeDiff(same, { ...same });
    expect(diff.before).toEqual({});
    expect(diff.after).toEqual({});
  });

  it('captures a field only present in one of the two snapshots', () => {
    const before = { discounts: '0.00' };
    const after = { discounts: '0.00', cancelReason: 'duplicate' };
    const diff = computeDiff(before, after);
    expect(diff.after).toEqual({ cancelReason: 'duplicate' });
    expect(diff.before).toEqual({});
  });
});
