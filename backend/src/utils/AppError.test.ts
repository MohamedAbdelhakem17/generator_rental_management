import { describe, expect, it } from 'vitest';

import {
  AppError,
  AuthError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from './AppError.js';

describe('AppError hierarchy', () => {
  it('exposes the correct status code and default message for each subclass', () => {
    expect(new ValidationError().statusCode).toBe(422);
    expect(new NotFoundError().statusCode).toBe(404);
    expect(new ConflictError().statusCode).toBe(409);
    expect(new AuthError().statusCode).toBe(401);
    expect(new ForbiddenError().statusCode).toBe(403);
  });

  it('carries field-level errors on ValidationError', () => {
    const error = new ValidationError('Invalid input', [{ field: 'email', message: 'Required' }]);

    expect(error.errors).toEqual([{ field: 'email', message: 'Required' }]);
  });

  it('is an instance of Error and AppError for every subclass', () => {
    const error = new NotFoundError('Generator not found');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.message).toBe('Generator not found');
  });
});
