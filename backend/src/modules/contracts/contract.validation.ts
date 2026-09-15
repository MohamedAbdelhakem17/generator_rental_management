import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const dateSchema = z.coerce.date({ errorMap: () => ({ message: 'Enter a valid date' }) });
const billingMethodSchema = z.enum(['monthly', 'daily', 'weekly', 'hourly']);

const contractItemInputSchema = z.object({
  generatorId: objectIdSchema,
  billingMethod: billingMethodSchema.optional(),
  unitPrice: z.coerce.number().positive('unitPrice must be greater than 0'),
});

function refineUniqueGenerators<T extends { items?: { generatorId: string }[] }>(data: T, ctx: z.RefinementCtx) {
  const items = data.items ?? [];
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.generatorId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items', index, 'generatorId'],
        message: 'This generator is already on this contract',
      });
    }
    seen.add(item.generatorId);
  });
}

export const createContractSchema = z
  .object({
    customerId: objectIdSchema,
    projectId: objectIdSchema,
    startDate: dateSchema,
    endDate: dateSchema,
    rentalMethod: billingMethodSchema,
    insurance: z
      .object({
        provider: z.string().trim().max(150).optional(),
        policyNumber: z.string().trim().max(100).optional(),
        amount: z.coerce.number().min(0).optional(),
      })
      .optional(),
    items: z.array(contractItemInputSchema).default([]),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  })
  .superRefine(refineUniqueGenerators);

export const updateContractSchema = z
  .object({
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    rentalMethod: billingMethodSchema.optional(),
    insurance: z
      .object({
        provider: z.string().trim().max(150).optional(),
        policyNumber: z.string().trim().max(100).optional(),
        amount: z.coerce.number().min(0).optional(),
      })
      .optional(),
    items: z.array(contractItemInputSchema).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' })
  .refine((data) => !data.startDate || !data.endDate || data.endDate >= data.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  })
  .superRefine(refineUniqueGenerators);

export const cancelContractSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required'),
});

export const listContractsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  customerId: objectIdSchema.optional(),
  projectId: objectIdSchema.optional(),
  status: z.enum(['Draft', 'Active', 'Expired', 'Cancelled']).optional(),
  startDateFrom: dateSchema.optional(),
  startDateTo: dateSchema.optional(),
});

export type ContractItemInput = z.infer<typeof contractItemInputSchema>;
export type CreateContractInput = z.infer<typeof createContractSchema>;
export type UpdateContractInput = z.infer<typeof updateContractSchema>;
export type CancelContractInput = z.infer<typeof cancelContractSchema>;
export type ListContractsQuery = z.infer<typeof listContractsQuerySchema>;
