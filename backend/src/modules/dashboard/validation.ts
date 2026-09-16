import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const dateSchema = z.coerce.date({ errorMap: () => ({ message: 'Enter a valid date' }) });

export const dashboardQuerySchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    projectId: objectIdSchema.optional(),
    customerId: objectIdSchema.optional(),
  })
  .refine((data) => (!data.from || !data.to ? true : data.to >= data.from), {
    message: 'to must be on or after from',
    path: ['to'],
  });

export type DashboardQueryInput = z.infer<typeof dashboardQuerySchema>;
