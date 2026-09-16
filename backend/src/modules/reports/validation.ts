import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const date = z.coerce.date({ errorMap: () => ({ message: 'Enter a valid date' }) });

export const reportQuerySchema = z
  .object({
    from: date.optional(),
    to: date.optional(),
    customerId: objectId.optional(),
    projectId: objectId.optional(),
    generatorId: objectId.optional(),
    category: z.string().trim().min(1).optional(),
    type: z.enum(['Preventive', 'Corrective']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((query) => !query.from || !query.to || query.to >= query.from, {
    message: 'to must be on or after from',
    path: ['to'],
  });

export type ReportQuery = z.infer<typeof reportQuerySchema>;
