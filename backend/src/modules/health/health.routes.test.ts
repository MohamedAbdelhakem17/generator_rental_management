import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { healthRouter } from './health.routes.js';

function buildApp() {
  const app = express();
  app.use('/api', healthRouter);
  return app;
}

function setReadyState(state: number): void {
  (mongoose.connection as unknown as { readyState: number }).readyState = state;
}

describe('GET /api/health', () => {
  const originalReadyState = mongoose.connection.readyState;

  afterEach(() => {
    setReadyState(originalReadyState);
  });

  it('returns 200 with db connected when Mongoose is connected', async () => {
    setReadyState(1);

    const response = await request(buildApp()).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { status: 'ok', db: 'connected' },
      message: null,
      meta: {},
    });
  });

  it('returns 503 with db disconnected when Mongoose is not connected', async () => {
    setReadyState(0);

    const response = await request(buildApp()).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      data: { status: 'error', db: 'disconnected' },
      message: 'Database unavailable',
      meta: {},
    });
  });
});
