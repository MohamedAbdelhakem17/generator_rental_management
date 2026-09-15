import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const dateSchema = z.coerce.date({ errorMap: () => ({ message: 'Enter a valid date' }) });

export const createFuelLogSchema = z.object({
  date: dateSchema.refine((value) => value.getTime() <= Date.now(), { message: 'date cannot be in the future' }),
  generatorId: objectIdSchema,
  projectId: objectIdSchema,
  liters: z.coerce.number().positive('liters must be greater than 0'),
  pricePerLiter: z.coerce.number().positive('pricePerLiter must be greater than 0'),
});

export const listFuelLogsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  generatorId: objectIdSchema.optional(),
  projectId: objectIdSchema.optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});

export type CreateFuelLogInput = z.infer<typeof createFuelLogSchema>;
export type ListFuelLogsQuery = z.infer<typeof listFuelLogsQuerySchema>;
