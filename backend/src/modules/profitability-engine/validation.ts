import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const dateSchema = z.coerce.date({ errorMap: () => ({ message: 'Enter a valid date' }) });

export const profitabilityQuerySchema = z
  .object({
    generatorId: objectIdSchema.optional(),
    projectId: objectIdSchema.optional(),
    customerId: objectIdSchema.optional(),
    from: dateSchema,
    to: dateSchema,
  })
  .refine((data) => data.to >= data.from, {
    message: 'to must be on or after from',
    path: ['to'],
  });

export type ProfitabilityQueryInput = z.infer<typeof profitabilityQuerySchema>;
