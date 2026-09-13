import type { FieldError } from './AppError.js';

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  message: string | null;
  meta: Record<string, unknown>;
}

export interface ErrorEnvelope {
  success: false;
  data: null;
  message: string;
  errors: FieldError[];
}

export function successResponse<T>(
  data: T,
  message: string | null = null,
  meta: Record<string, unknown> = {},
): SuccessEnvelope<T> {
  return { success: true, data, message, meta };
}

export function errorResponse(message: string, errors: FieldError[] = []): ErrorEnvelope {
  return { success: false, data: null, message, errors };
}
