import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const dateSchema = z.coerce.date({ errorMap: () => ({ message: 'Enter a valid date' }) });
const moneySchema = z.coerce.number().min(0);

export const openMaintenanceSchema = z.object({
  generatorId: objectIdSchema,
  type: z.enum(['Preventive', 'Corrective']),
  date: dateSchema.refine((value) => value.getTime() <= Date.now(), { message: 'date cannot be in the future' }),
  meter: z.coerce.number().min(0),
  partsCost: moneySchema.optional(),
  oilCost: moneySchema.optional(),
  laborCost: moneySchema.optional(),
  transportCost: moneySchema.optional(),
  maintenanceCycleOverride: z.coerce.number().positive().optional(),
  notes: z.string().trim().max(500).optional(),
});

export const updateMaintenanceSchema = z.object({
  partsCost: moneySchema.optional(),
  oilCost: moneySchema.optional(),
  laborCost: moneySchema.optional(),
  transportCost: moneySchema.optional(),
  maintenanceCycleOverride: z.coerce.number().positive().nullable().optional(),
  notes: z.string().trim().max(500).optional(),
});

export const cancelMaintenanceSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required'),
});

export const listMaintenanceQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  generatorId: objectIdSchema.optional(),
  status: z.enum(['Open', 'In Progress', 'Completed', 'Cancelled']).optional(),
  type: z.enum(['Preventive', 'Corrective']).optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});

export type OpenMaintenanceInput = z.infer<typeof openMaintenanceSchema>;
export type UpdateMaintenanceInput = z.infer<typeof updateMaintenanceSchema>;
export type CancelMaintenanceInput = z.infer<typeof cancelMaintenanceSchema>;
export type ListMaintenanceQuery = z.infer<typeof listMaintenanceQuerySchema>;
