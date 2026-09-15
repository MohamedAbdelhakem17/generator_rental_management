import { z, type ZodType, type ZodTypeDef } from 'zod';

import { ValidationError } from './AppError.js';

/** Shared shape for `:id` route params — also closes the `noUncheckedIndexedAccess` gap on `req.params.id`. */
export const idParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id'),
});

/**
 * Zod-at-the-boundary parsing (CLAUDE.md: Zod at the API boundary, Mongoose at persistence).
 * Accepts any input shape (not just `ZodSchema<T>`'s Input === Output) so a query schema
 * that transforms a raw string param (e.g. `"true"`) into a typed value (`boolean`) still
 * type-checks against its output type `T`.
 */
export function parseOrThrow<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input);

  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || undefined,
      message: issue.message,
    }));
    throw new ValidationError('Validation failed', errors);
  }

  return result.data;
}
