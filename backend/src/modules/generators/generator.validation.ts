import { z } from 'zod';

const specificationsSchema = z.object({
  kva: z.coerce.number().positive('kVA must be a positive number'),
  brand: z.string().trim().min(1, 'Brand is required').max(50),
  model: z.string().trim().min(1, 'Model is required').max(50),
  serialNumber: z.string().trim().min(1, 'Serial number is required'),
});

export const createGeneratorSchema = z.object({
  specifications: specificationsSchema,
  currentMeter: z.coerce.number().min(0).optional(),
  location: z.string().trim().max(200).optional(),
  normalFuelConsumption: z.coerce.number().positive('Normal fuel consumption must be a positive number'),
  maintenanceCycleHours: z.coerce.number().positive('Maintenance cycle hours must be a positive number').optional(),
});

export const updateGeneratorSchema = z
  .object({
    specifications: specificationsSchema.partial().optional(),
    location: z.string().trim().max(200).optional(),
    normalFuelConsumption: z.coerce.number().positive().optional(),
    maintenanceCycleHours: z.coerce.number().positive().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' });

export const stopGeneratorSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required'),
});

export const meterCorrectionSchema = z.object({
  currentMeter: z.coerce.number().min(0, 'Meter reading cannot be negative'),
  reason: z.string().trim().min(1, 'A reason is required'),
});

export const listGeneratorsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  search: z.string().trim().optional(),
  status: z.enum(['Available', 'Rented', 'Under Maintenance', 'Stopped']).optional(),
  location: z.string().trim().optional(),
});

export type CreateGeneratorInput = z.infer<typeof createGeneratorSchema>;
export type UpdateGeneratorInput = z.infer<typeof updateGeneratorSchema>;
export type StopGeneratorInput = z.infer<typeof stopGeneratorSchema>;
export type MeterCorrectionInput = z.infer<typeof meterCorrectionSchema>;
export type ListGeneratorsQuery = z.infer<typeof listGeneratorsQuerySchema>;
