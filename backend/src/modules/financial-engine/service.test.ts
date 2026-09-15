import { describe, expect, it } from 'vitest';

import { FinancialEngineService } from './service.js';

describe('FinancialEngineService.calculateExtractTotals (TASK-021)', () => {
  it('AC/Business Rule 6.7 worked example: rent 100,000 + transport 10,000 + services 5,000, discount 15,000, VAT 14% -> VAT 14,000, finalTotal 114,000', () => {
    const result = FinancialEngineService.calculateExtractTotals({
      rent: '100000',
      transport: '10000',
      services: '5000',
      discounts: '15000',
      vatRate: '0.14',
    });

    expect(result.totalWork.toString()).toBe('115000.00');
    expect(result.netBeforeVat.toString()).toBe('100000.00');
    expect(result.vat.toString()).toBe('14000.00');
    expect(result.finalTotal.toString()).toBe('114000.00');
  });

  it('FR-002: rejects discounts that exceed totalWork rather than clamping to zero', () => {
    try {
      FinancialEngineService.calculateExtractTotals({
        rent: '1000',
        transport: '0',
        services: '0',
        discounts: '1000.01',
        vatRate: '0.14',
      });
      expect.unreachable('expected calculateExtractTotals to throw');
    } catch (error) {
      const appError = error as { statusCode: number; errors: { field?: string; message: string }[] };
      expect(appError.statusCode).toBe(422);
      expect(appError.errors[0]!.field).toBe('discounts');
      expect(appError.errors[0]!.message).toContain('Discounts cannot exceed total work');
    }
  });

  it('discounts exactly equal to totalWork yields a zero netBeforeVat/vat/finalTotal, not a rejection', () => {
    const result = FinancialEngineService.calculateExtractTotals({
      rent: '1000',
      transport: '0',
      services: '0',
      discounts: '1000',
      vatRate: '0.14',
    });

    expect(result.netBeforeVat.toString()).toBe('0.00');
    expect(result.vat.toString()).toBe('0.00');
    expect(result.finalTotal.toString()).toBe('0.00');
  });

  it('FR-005: rounds only at the final step of each formula, not mid-calculation', () => {
    // netBeforeVat = 100 - 0 = 100; vat = 100 * 0.145 = 14.5 exactly, no compounding error.
    const result = FinancialEngineService.calculateExtractTotals({
      rent: '33.335',
      transport: '33.335',
      services: '33.33',
      discounts: '0',
      vatRate: '0.145',
    });

    expect(result.totalWork.toString()).toBe('100.00');
    expect(result.vat.toString()).toBe('14.50');
  });

  it('zero discounts and zero VAT rate leaves finalTotal equal to totalWork', () => {
    const result = FinancialEngineService.calculateExtractTotals({
      rent: '500',
      transport: '0',
      services: '0',
      discounts: '0',
      vatRate: '0',
    });

    expect(result.finalTotal.toString()).toBe('500.00');
  });
});
