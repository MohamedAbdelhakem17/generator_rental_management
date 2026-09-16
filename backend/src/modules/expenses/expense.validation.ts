import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const dateSchema = z.coerce.date({ errorMap: () => ({ message: 'Enter a valid date' }) });

export const createExpenseSchema = z.object({
  category: z.string().trim().min(1, 'category is required'),
  date: dateSchema.refine((value) => value.getTime() <= Date.now(), { message: 'date cannot be in the future' }),
  amount: z.coerce.number().positive('amount must be greater than 0'),
  generatorId: objectIdSchema.optional().nullable(),
  projectId: objectIdSchema.optional().nullable(),
  description: z.string().trim().max(300, 'description must be at most 300 characters').optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export const listExpensesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  category: z.string().trim().optional(),
  generatorId: objectIdSchema.optional(),
  projectId: objectIdSchema.optional(),
  unallocatedOnly: z.coerce.boolean().optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});

export const allocateExpenseSchema = z.object({
  splits: z
    .array(
      z.object({
        generatorId: objectIdSchema.optional(),
        projectId: objectIdSchema.optional(),
        percentage: z.coerce.number().min(0).optional(),
        amount: z.coerce.number().positive().optional(),
      }),
    )
    .min(1, 'At least one split is required')
    .refine((splits) => splits.every((split) => !!split.generatorId !== !!split.projectId), {
      message: 'Each split must choose either generatorId or projectId',
    }),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
export type AllocateExpenseInput = z.infer<typeof allocateExpenseSchema>;
