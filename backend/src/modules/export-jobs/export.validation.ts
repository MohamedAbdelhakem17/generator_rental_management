import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const dateSchema = z.coerce.date({ errorMap: () => ({ message: 'Enter a valid date' }) });

export const createExportSchema = z.object({
  reportType: z.string().trim().min(1),
  format: z.enum(['csv', 'xlsx', 'pdf']),
  filters: z
    .object({
      from: dateSchema.optional(),
      to: dateSchema.optional(),
      customerId: objectId.optional(),
      projectId: objectId.optional(),
      generatorId: objectId.optional(),
      category: z.string().trim().optional(),
      type: z.string().trim().optional(),
    })
    .default({}),
});

export type CreateExportInput = z.infer<typeof createExportSchema>;
