import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const dateSchema = z.coerce.date({ errorMap: () => ({ message: 'Enter a valid date' }) });
const moneySchema = z.coerce.number().min(0);

const allocationSchema = z.object({
  extractId: objectIdSchema,
  amount: moneySchema,
});

export const createReceiptSchema = z
  .object({
    customerId: objectIdSchema,
    date: dateSchema.refine((value) => value.getTime() <= Date.now(), {
      message: 'date cannot be in the future',
    }),
    amount: moneySchema.refine((value) => value > 0, { message: 'amount must be greater than 0' }),
    paymentMethod: z.enum(['Cash', 'BankTransfer', 'Cheque', 'Card']),
    account: z.string().trim().max(80).optional().default(''),
    transferNumber: z.string().trim().max(80).optional().default(''),
    allocations: z.array(allocationSchema).default([]),
  })
  .refine(
    (value) =>
      value.paymentMethod === 'BankTransfer' ? value.transferNumber.trim().length > 0 : true,
    { message: 'transferNumber is required for BankTransfer', path: ['transferNumber'] },
  )
  .refine(
    (value) =>
      value.paymentMethod === 'BankTransfer' || value.paymentMethod === 'Cheque'
        ? value.account.trim().length > 0
        : true,
    { message: 'account is required for BankTransfer and Cheque', path: ['account'] },
  );

export const cancelReceiptSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required'),
});

export const listReceiptsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  customerId: objectIdSchema.optional(),
  paymentMethod: z.enum(['Cash', 'BankTransfer', 'Cheque', 'Card']).optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});

export type CreateReceiptInput = z.infer<typeof createReceiptSchema>;
export type CancelReceiptInput = z.infer<typeof cancelReceiptSchema>;
export type ListReceiptsQuery = z.infer<typeof listReceiptsQuerySchema>;
