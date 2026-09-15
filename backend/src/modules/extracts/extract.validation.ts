import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const dateSchema = z.coerce.date({ errorMap: () => ({ message: 'Enter a valid date' }) });
const moneySchema = z.coerce.number().min(0);

const lineItemSchema = z.object({
  type: z.enum(['rent', 'transport', 'services']),
  description: z.string().trim().min(1, 'A description is required').max(200),
  amount: moneySchema,
});

export const createExtractSchema = z
  .object({
    customerId: objectIdSchema,
    projectId: objectIdSchema,
    contractIds: z.array(objectIdSchema).min(1, 'At least one contract is required'),
    period: z.object({ start: dateSchema, end: dateSchema }),
    lineItems: z.array(lineItemSchema).default([]),
    discounts: moneySchema.optional(),
  })
  .refine((data) => data.period.end >= data.period.start, {
    message: 'period.end must be on or after period.start',
    path: ['period', 'end'],
  });

export const updateExtractSchema = z
  .object({
    customerId: objectIdSchema.optional(),
    projectId: objectIdSchema.optional(),
    contractIds: z.array(objectIdSchema).min(1, 'At least one contract is required').optional(),
    period: z.object({ start: dateSchema, end: dateSchema }).optional(),
    lineItems: z.array(lineItemSchema).optional(),
    discounts: moneySchema.optional(),
  })
  .refine((data) => !data.period || data.period.end >= data.period.start, {
    message: 'period.end must be on or after period.start',
    path: ['period', 'end'],
  });

export const cancelExtractSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required'),
});

export const listExtractsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  customerId: objectIdSchema.optional(),
  projectId: objectIdSchema.optional(),
  status: z.enum(['Draft', 'Under Review', 'Approved', 'Partially Collected', 'Collected', 'Cancelled']).optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});

/** TASK-021 Section 12: the wizard's live-preview endpoint — no vatRate input, always the
 * current live SystemSetting rate (never user-supplied, never the approved snapshot). */
export const previewTotalsSchema = z.object({
  rent: moneySchema,
  transport: moneySchema,
  services: moneySchema,
  discounts: moneySchema,
});

export type CreateExtractInput = z.infer<typeof createExtractSchema>;
export type UpdateExtractInput = z.infer<typeof updateExtractSchema>;
export type CancelExtractInput = z.infer<typeof cancelExtractSchema>;
export type ListExtractsQuery = z.infer<typeof listExtractsQuerySchema>;
export type PreviewTotalsInput = z.infer<typeof previewTotalsSchema>;
