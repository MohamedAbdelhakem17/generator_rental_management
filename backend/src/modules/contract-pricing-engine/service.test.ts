import { afterEach, describe, expect, it } from 'vitest';

import { OPERATING_HOURS_PROVIDERS } from './operating-hours-provider.js';
import { PricingEngineService } from './service.js';

const GENERATOR_ID = '000000000000000000000001';
const PROJECT_ID = '000000000000000000000002';

function baseInput(billingMethod: 'monthly' | 'daily' | 'weekly' | 'hourly', unitPrice: number) {
  return { generatorId: GENERATOR_ID, projectId: PROJECT_ID, billingMethod, unitPrice };
}

describe('PricingEngineService.calculateRent (TASK-014)', () => {
  afterEach(() => {
    OPERATING_HOURS_PROVIDERS.length = 0;
  });

  it('FR-001: Monthly — a single full calendar month', async () => {
    const result = await PricingEngineService.calculateRent(
      baseInput('monthly', 15000),
      new Date('2026-02-01'),
      new Date('2026-02-28'),
    );
    expect(result.amount.toFixed(2)).toBe('15000.00');
    expect(result.breakdown).toMatchObject({ fullMonths: 1, partialMonths: [] });
  });

  it('FR-001: Monthly — a single partial month is pro-rated by day-count', async () => {
    // February 2026 has 28 days; 10 of them covered.
    const result = await PricingEngineService.calculateRent(
      baseInput('monthly', 28000),
      new Date('2026-02-01'),
      new Date('2026-02-10'),
    );
    expect(result.amount.toFixed(2)).toBe('10000.00');
    expect(result.breakdown).toMatchObject({
      fullMonths: 0,
      partialMonths: [{ month: '2026-02', daysCovered: 10, daysInMonth: 28 }],
    });
  });

  it('Section 20 edge case: Monthly contract activated mid-month spans partial-full-partial', async () => {
    // Jan 15–31 (17/31 days) + full Feb (28 days) + Mar 1–10 (10/31 days).
    const unitPrice = 31000;
    const result = await PricingEngineService.calculateRent(
      baseInput('monthly', unitPrice),
      new Date('2026-01-15'),
      new Date('2026-03-10'),
    );
    const partialMonthAmount = (days: number, daysInMonth: number) => (unitPrice * days) / daysInMonth;
    const expected = (unitPrice + partialMonthAmount(17, 31) + partialMonthAmount(10, 31)).toFixed(2);
    expect(result.amount.toFixed(2)).toBe(expected);
    expect(result.breakdown).toMatchObject({
      fullMonths: 1,
      partialMonths: [
        { month: '2026-01', daysCovered: 17, daysInMonth: 31 },
        { month: '2026-03', daysCovered: 10, daysInMonth: 31 },
      ],
    });
  });

  it('FR-002: Daily — unitPrice × inclusive day count', async () => {
    const result = await PricingEngineService.calculateRent(baseInput('daily', 500), new Date('2026-01-01'), new Date('2026-01-10'));
    expect(result.amount.toFixed(2)).toBe('5000.00');
    expect(result.breakdown).toMatchObject({ days: 10 });
  });

  it('FR-003: Weekly — unitPrice × (days ÷ 7), rounded once at the final step', async () => {
    const result = await PricingEngineService.calculateRent(baseInput('weekly', 700), new Date('2026-01-01'), new Date('2026-01-10'));
    // 10 days / 7 = 1.428571... x 700 = 1000.0000 -> rounds to 1000.00
    expect(result.amount.toFixed(2)).toBe('1000.00');
    expect(result.breakdown).toMatchObject({ days: 10 });
  });

  it('FR-004/Section 19: Hourly with zero registered providers returns 0.00 with a warning', async () => {
    const result = await PricingEngineService.calculateRent(baseInput('hourly', 50), new Date('2026-01-01'), new Date('2026-01-10'));
    expect(result.amount.toFixed(2)).toBe('0.00');
    expect(result.breakdown).toMatchObject({ hours: 0, operationLogIds: [], warning: 'no operation logs in period' });
  });

  it('FR-004/FR-005: Hourly sums a registered provider and stores the operation log ids, with no warning', async () => {
    OPERATING_HOURS_PROVIDERS.push(async () => ({ hours: 42, operationLogIds: ['log-1', 'log-2'] }));

    const result = await PricingEngineService.calculateRent(baseInput('hourly', 50), new Date('2026-01-01'), new Date('2026-01-10'));
    expect(result.amount.toFixed(2)).toBe('2100.00');
    expect(result.breakdown).toEqual({
      method: 'hourly',
      unitPrice: '50.00',
      hours: 42,
      operationLogIds: ['log-1', 'log-2'],
    });
  });
});
