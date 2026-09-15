import { z } from 'zod';

const phoneSchema = z
  .string()
  .trim()
  .max(30)
  .regex(/^[0-9+()\-\s]*$/, 'Enter a valid phone number')
  .optional();

export const createCustomerSchema = z.object({
  code: z.string().trim().min(1, 'Code is required').max(30),
  companyName: z.string().trim().min(1, 'Company name is required').max(150),
  contactPerson: z.string().trim().max(100).optional(),
  phone: phoneSchema,
  taxNumber: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
  active: z.boolean().optional(),
});

export const updateCustomerSchema = z
  .object({
    companyName: z.string().trim().min(1).max(150).optional(),
    contactPerson: z.string().trim().max(100).optional(),
    phone: phoneSchema,
    taxNumber: z.string().trim().max(30).optional(),
    address: z.string().trim().max(300).optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' });

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  search: z.string().trim().optional(),
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
