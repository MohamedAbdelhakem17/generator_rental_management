import { z } from 'zod';

/** Section 16: `vatRate` is accepted either as a 0–1 fraction or a 0–100 percentage and
 * normalized to the stored percent-scale (14 means 14%) — the same convention every existing
 * consumer (`extract.service.ts`'s `getLiveVatRateFraction`) already divides by 100. */
const percentOrFraction = z.coerce
  .number()
  .refine((value) => value >= 0 && value <= 100, 'Must be between 0 and 1 (fraction) or 0 and 100 (percent)')
  .transform((value) => (value <= 1 ? value * 100 : value));

const nonNegativeNumber = z.coerce.number().min(0, 'Must be zero or greater');
const positiveNumber = z.coerce.number().positive('Must be greater than zero');
const nonEmptyStringList = z
  .array(z.string().trim().min(1))
  .min(1, 'At least one value is required')
  .refine((values) => new Set(values).size === values.length, 'Values must be unique');

export const SETTING_VALUE_SCHEMAS = {
  vatRate: percentOrFraction,
  currency: z.string().trim().length(3, 'Currency must be a 3-letter code').toUpperCase(),
  paymentMethods: nonEmptyStringList,
  fuelAlertTolerancePercent: nonNegativeNumber,
  fuelAlertCriticalPercent: nonNegativeNumber,
  defaultMaintenanceCycleHours: positiveNumber,
  maintenanceScheduleBufferHours: nonNegativeNumber,
  overdueGracePeriodDays: nonNegativeNumber,
  expenseCategories: nonEmptyStringList,
} as const;

export const updateSettingSchema = z.object({
  value: z.unknown(),
});
