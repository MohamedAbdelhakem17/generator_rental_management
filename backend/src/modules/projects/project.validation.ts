import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const dateSchema = z.coerce.date({ errorMap: () => ({ message: 'Enter a valid date' }) });

export const createProjectSchema = z
  .object({
    code: z.string().trim().min(1, 'Code is required').max(30),
    name: z.string().trim().min(1, 'Name is required').max(150),
    customerId: objectIdSchema,
    location: z.string().trim().max(200).optional(),
    siteManager: z.string().trim().max(100).optional(),
    startDate: dateSchema,
    endDate: dateSchema.optional(),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  });

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    location: z.string().trim().max(200).optional(),
    siteManager: z.string().trim().max(100).optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.nullable().optional(),
    status: z.enum(['Active', 'Closed']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' })
  .refine((data) => !data.startDate || !data.endDate || data.endDate >= data.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  });

export const listProjectsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  customerId: objectIdSchema.optional(),
  status: z.enum(['Active', 'Closed']).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
