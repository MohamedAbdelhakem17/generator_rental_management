import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { roundMoney, toDecimal, toDecimal128, toDisplayString } from './money.js';

describe('money utility', () => {
  it('rounds half-up to 2 decimal places', () => {
    expect(roundMoney('10.005').toFixed(2)).toBe('10.01');
    expect(roundMoney('10.004').toFixed(2)).toBe('10.00');
    expect(roundMoney('10.01').toFixed(2)).toBe('10.01');
    expect(roundMoney(2.5).toFixed(0)).toBe('3');
  });

  it('round-trips a value through Decimal128 without precision loss', () => {
    const original = '1234.56';
    const decimal128 = toDecimal128(original);

    expect(decimal128).toBeInstanceOf(Types.Decimal128);
    expect(toDecimal(decimal128).toFixed(2)).toBe(original);
  });

  it('formats a Decimal128 value for display with 2 decimal places', () => {
    const decimal128 = Types.Decimal128.fromString('99.9');

    expect(toDisplayString(decimal128)).toBe('99.90');
  });

  it('never produces a native float — output is always a Decimal or fixed string', () => {
    const result = roundMoney(10);

    expect(result.constructor.name).toBe('Decimal');
    expect(typeof toDisplayString(10)).toBe('string');
  });
});
