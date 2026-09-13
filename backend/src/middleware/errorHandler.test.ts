import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import {
  AuthError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../utils/AppError.js';
import { errorHandler } from './errorHandler.js';

function buildTestApp(throwError: (req: Request, res: Response, next: NextFunction) => void) {
  const app = express();
  app.use(express.json());
  app.get('/throw', throwError);
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it.each([
    ['ValidationError', new ValidationError('Bad input', [{ field: 'name', message: 'Required' }]), 422],
    ['NotFoundError', new NotFoundError('Missing'), 404],
    ['ConflictError', new ConflictError('Conflict'), 409],
    ['AuthError', new AuthError('Unauthorized'), 401],
    ['ForbiddenError', new ForbiddenError('Forbidden'), 403],
  ])('maps %s to status %i with a matching envelope', async (_name, error, statusCode) => {
    const app = buildTestApp((_req, _res, next) => next(error));

    const response = await request(app).get('/throw');

    expect(response.status).toBe(statusCode);
    expect(response.body.success).toBe(false);
    expect(response.body.data).toBeNull();
    expect(response.body.message).toBe(error.message);
  });

  it('maps an unknown thrown error to 500 without leaking internals in production', async () => {
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const app = buildTestApp((_req, _res, next) => next(new Error('secret db connection string')));

    const response = await request(app).get('/throw');

    expect(response.status).toBe(500);
    expect(response.body.message).toBe('Internal server error');
    expect(response.body.message).not.toContain('secret');

    process.env.NODE_ENV = previousEnv;
  });

  it('returns 400 with a generic message for malformed JSON bodies', async () => {
    const app = buildTestApp((_req, res) => res.json({ ok: true }));

    const response = await request(app)
      .post('/throw')
      .set('Content-Type', 'application/json')
      .send('{ invalid json');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      data: null,
      message: 'Invalid JSON body',
      errors: [],
    });
  });
});
