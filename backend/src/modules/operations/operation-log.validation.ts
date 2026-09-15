import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const dateSchema = z.coerce.date({ errorMap: () => ({ message: 'Enter a valid date' }) });

export const createOperationLogSchema = z
  .object({
    date: dateSchema.refine((value) => value.getTime() <= Date.now(), { message: 'date cannot be in the future' }),
    projectId: objectIdSchema,
    generatorId: objectIdSchema,
    startMeter: z.coerce.number().min(0, 'startMeter cannot be negative'),
    endMeter: z.coerce.number().min(0, 'endMeter cannot be negative'),
    downtimeHours: z.coerce.number().min(0).max(24, 'downtimeHours cannot exceed 24').optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((data) => data.endMeter >= data.startMeter, {
    message: 'endMeter cannot be less than startMeter — request a correction instead',
    path: ['endMeter'],
  });

export const correctOperationLogSchema = z.object({
  startMeter: z.coerce.number().min(0).optional(),
  endMeter: z.coerce.number().min(0).optional(),
  reason: z.string().trim().min(1, 'A reason is required'),
});

export const listOperationLogsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  generatorId: objectIdSchema.optional(),
  projectId: objectIdSchema.optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});

export type CreateOperationLogInput = z.infer<typeof createOperationLogSchema>;
export type CorrectOperationLogInput = z.infer<typeof correctOperationLogSchema>;
export type ListOperationLogsQuery = z.infer<typeof listOperationLogsQuerySchema>;
