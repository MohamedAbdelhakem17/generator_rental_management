import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const listMaintenanceAlertsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  generatorId: objectIdSchema.optional(),
  status: z.enum(['Open', 'Acknowledged', 'Resolved']).optional(),
  level: z.enum(['Upcoming', 'Overdue']).optional(),
});

export type ListMaintenanceAlertsQuery = z.infer<typeof listMaintenanceAlertsQuerySchema>;
