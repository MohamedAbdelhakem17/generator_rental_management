import type { Types } from 'mongoose';

import { ValidationError } from '../../utils/AppError.js';
import { roundMoney, toDecimal, toDecimal128, toDisplayString, type MoneyInput } from '../../services/money.js';

export interface CalculateExtractTotalsInput {
  rent: MoneyInput;
  transport: MoneyInput;
  services: MoneyInput;
  discounts: MoneyInput;
  /** A fraction, e.g. `0.14` for 14% — never the raw percent value. */
  vatRate: MoneyInput;
}

export interface ExtractTotals {
  totalWork: Types.Decimal128;
  netBeforeVat: Types.Decimal128;
  vat: Types.Decimal128;
  finalTotal: Types.Decimal128;
}

/**
 * TASK-021 — the single owner of Business Rule 6.7's Extract math. Every consumer (the
 * Extract module's create/update/approve/preview paths, and any future report) calls this
 * rather than re-deriving totalWork/netBeforeVat/vat/finalTotal itself.
 */
export const FinancialEngineService = {
  /**
   * FR-001-005: `decimal.js` throughout, rounded once at each formula's final step.
   * Throws when discounts exceed totalWork (FR-002) rather than silently clamping to zero.
   */
  calculateExtractTotals(input: CalculateExtractTotalsInput): ExtractTotals {
    const totalWork = toDecimal(input.rent).plus(toDecimal(input.transport)).plus(toDecimal(input.services));
    const discounts = toDecimal(input.discounts);

    if (discounts.greaterThan(totalWork)) {
      throw new ValidationError('Validation failed', [
        { field: 'discounts', message: `Discounts cannot exceed total work (${toDisplayString(totalWork)})` },
      ]);
    }

    const netBeforeVat = totalWork.minus(discounts);
    const vat = roundMoney(netBeforeVat.times(toDecimal(input.vatRate)));
    const finalTotal = roundMoney(netBeforeVat.plus(vat));

    return {
      totalWork: toDecimal128(totalWork),
      netBeforeVat: toDecimal128(netBeforeVat),
      vat: toDecimal128(vat),
      finalTotal: toDecimal128(finalTotal),
    };
  },
};
