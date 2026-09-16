import { z } from 'zod';

export const createCreditNoteSchema = z.object({
  customerId: z.string().regex(/^[0-9a-fA-F]{24}$/u, 'Invalid customerId'),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters'),
  relatedExtractId: z.string().regex(/^[0-9a-fA-F]{24}$/u, 'Invalid relatedExtractId').optional().nullable(),
});
