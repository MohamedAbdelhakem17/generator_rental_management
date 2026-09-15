import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const listFuelAlertsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  status: z.enum(['Open', 'Acknowledged', 'Resolved']).optional(),
  severity: z.enum(['Warning', 'Critical']).optional(),
  generatorId: objectIdSchema.optional(),
});

export const resolveFuelAlertSchema = z.object({
  resolutionNote: z.string().trim().min(5, 'resolutionNote must be at least 5 characters'),
});

export type ListFuelAlertsQuery = z.infer<typeof listFuelAlertsQuerySchema>;
export type ResolveFuelAlertInput = z.infer<typeof resolveFuelAlertSchema>;
