import { Decimal } from 'decimal.js';

import type { BillingMethod } from '../contracts/contract-item.model.js';
import { roundMoney, toDecimal, type MoneyInput } from '../../services/money.js';
import { getOperatingHours } from './operating-hours-provider.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RentCalculationInput {
  generatorId: string;
  /** Needed only for the Hourly method, which scopes Operation Logs by generator *and* project. */
  projectId: string;
  billingMethod: BillingMethod;
  unitPrice: MoneyInput;
}

export interface RentCalculationResult {
  amount: Decimal;
  breakdown: Record<string, unknown>;
}

/** Inclusive day count — Business Rule 6.10's Daily/Weekly formulas both key off this. */
function daysBetweenInclusive(periodStart: Date, periodEnd: Date): number {
  return Math.round((periodEnd.getTime() - periodStart.getTime()) / MS_PER_DAY) + 1;
}

function utcMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function utcDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * FR-001: full months at `unitPrice` each; a partial month is pro-rated by day-count. Walks
 * calendar months rather than assuming a single partial edge, so a period spanning
 * partial-full-partial (e.g. Jan 15 – Mar 10) is still computed correctly.
 */
function calculateMonthly(unitPrice: Decimal, periodStart: Date, periodEnd: Date): RentCalculationResult {
  const periodEndExclusive = new Date(periodEnd.getTime() + MS_PER_DAY);
  let amount = new Decimal(0);
  let fullMonths = 0;
  const partialMonths: { month: string; daysCovered: number; daysInMonth: number }[] = [];

  let cursor = utcMonthStart(periodStart);
  while (cursor.getTime() < periodEndExclusive.getTime()) {
    const nextMonthStart = addUtcMonths(cursor, 1);
    const daysInMonth = utcDays(cursor, nextMonthStart);

    const coverStart = cursor.getTime() > periodStart.getTime() ? cursor : periodStart;
    const coverEndExclusive = nextMonthStart.getTime() < periodEndExclusive.getTime() ? nextMonthStart : periodEndExclusive;
    const daysCovered = utcDays(coverStart, coverEndExclusive);

    if (daysCovered === daysInMonth) {
      fullMonths += 1;
      amount = amount.plus(unitPrice);
    } else if (daysCovered > 0) {
      partialMonths.push({
        month: `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`,
        daysCovered,
        daysInMonth,
      });
      amount = amount.plus(unitPrice.times(daysCovered).dividedBy(daysInMonth));
    }

    cursor = nextMonthStart;
  }

  return {
    amount,
    breakdown: { method: 'monthly', unitPrice: unitPrice.toFixed(2), fullMonths, partialMonths },
  };
}

function calculateDaily(unitPrice: Decimal, periodStart: Date, periodEnd: Date): RentCalculationResult {
  const days = daysBetweenInclusive(periodStart, periodEnd);
  return {
    amount: unitPrice.times(days),
    breakdown: { method: 'daily', unitPrice: unitPrice.toFixed(2), days },
  };
}

/** FR-003: rounded per the system rule at the final step only — never accumulated across periods. */
function calculateWeekly(unitPrice: Decimal, periodStart: Date, periodEnd: Date): RentCalculationResult {
  const days = daysBetweenInclusive(periodStart, periodEnd);
  const weeks = new Decimal(days).dividedBy(7);
  return {
    amount: unitPrice.times(weeks),
    breakdown: { method: 'weekly', unitPrice: unitPrice.toFixed(2), days, weeks: weeks.toNumber() },
  };
}

/** FR-004/Section 19: zero Operation Logs in period is a valid `0.00` result with a warning, not an error. */
async function calculateHourly(
  unitPrice: Decimal,
  generatorId: string,
  projectId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<RentCalculationResult> {
  const { hours, operationLogIds } = await getOperatingHours(generatorId, projectId, periodStart, periodEnd);
  return {
    amount: unitPrice.times(hours),
    breakdown: {
      method: 'hourly',
      unitPrice: unitPrice.toFixed(2),
      hours,
      operationLogIds,
      ...(operationLogIds.length === 0 ? { warning: 'no operation logs in period' } : {}),
    },
  };
}

export const PricingEngineService = {
  /**
   * Business Rule 6.10. `amount` is rounded once, at the very end (Section 20) — every
   * intermediate value in `breakdown` is kept unrounded for traceability.
   */
  async calculateRent(input: RentCalculationInput, periodStart: Date, periodEnd: Date): Promise<RentCalculationResult> {
    const unitPrice = toDecimal(input.unitPrice);

    const result =
      input.billingMethod === 'monthly'
        ? calculateMonthly(unitPrice, periodStart, periodEnd)
        : input.billingMethod === 'daily'
          ? calculateDaily(unitPrice, periodStart, periodEnd)
          : input.billingMethod === 'weekly'
            ? calculateWeekly(unitPrice, periodStart, periodEnd)
            : await calculateHourly(unitPrice, input.generatorId, input.projectId, periodStart, periodEnd);

    return { amount: roundMoney(result.amount), breakdown: result.breakdown };
  },
};
