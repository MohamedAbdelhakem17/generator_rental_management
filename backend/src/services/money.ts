import { Decimal } from 'decimal.js';
import { Types } from 'mongoose';

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

export type MoneyInput = Types.Decimal128 | Decimal | string | number;

/** Converts any accepted money representation into a `decimal.js` `Decimal` for arithmetic. */
export function toDecimal(value: MoneyInput): Decimal {
  if (value instanceof Decimal) {
    return value;
  }
  if (value instanceof Types.Decimal128) {
    return new Decimal(value.toString());
  }
  return new Decimal(value);
}

/** Rounds to 2 decimal places using ROUND_HALF_UP — the one rounding rule for money (Business Rule 6.7). */
export function roundMoney(value: MoneyInput): Decimal {
  return toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Converts a money value to the Decimal128 BSON type for persistence, rounded to 2dp. */
export function toDecimal128(value: MoneyInput): Types.Decimal128 {
  return Types.Decimal128.fromString(roundMoney(value).toFixed(2));
}

/** Formats a money value as a fixed 2-decimal string for display — never ad hoc `toFixed()`. */
export function toDisplayString(value: MoneyInput): string {
  return roundMoney(value).toFixed(2);
}
