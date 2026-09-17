import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { rateLimit } from './rateLimit.js';

/** `bypassInTest: false` forces the real logic to run under vitest's NODE_ENV=test — see the
 * middleware's own doc comment for why the default is to skip in test. */
function buildApp(overrides: Partial<Parameters<typeof rateLimit>[0]> = {}) {
  const app = express();
  app.use(express.json());
  app.post(
    '/ping',
    rateLimit({
      max: 3,
      windowMs: 1000,
      keyFor: (req) => `${req.ip}:${String(req.body?.email ?? '')}`,
      bypassInTest: false,
      ...overrides,
    }),
    (_req, res) => res.status(200).json({ ok: true }),
  );
  app.use((err: { statusCode?: number; message: string }, _req: unknown, res: express.Response, _next: unknown) => {
    res.status(err.statusCode ?? 500).json({ ok: false, message: err.message });
  });
  return app;
}

describe('rateLimit middleware (TASK-034 FR-001)', () => {
  it('allows requests up to the configured max, then rejects with 429 and Retry-After', async () => {
    const app = buildApp();

    for (let i = 0; i < 3; i++) {
      const response = await request(app).post('/ping').send({ email: 'a@test.com' });
      expect(response.status).toBe(200);
    }

    const blocked = await request(app).post('/ping').send({ email: 'a@test.com' });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('sets X-RateLimit-Limit/Remaining headers on every response', async () => {
    const app = buildApp();
    const response = await request(app).post('/ping').send({ email: 'b@test.com' });
    expect(response.headers['x-ratelimit-limit']).toBe('3');
    expect(response.headers['x-ratelimit-remaining']).toBe('2');
  });

  it('Section 20: keys by IP+email — a different email from the same IP is not blocked', async () => {
    const app = buildApp();
    for (let i = 0; i < 3; i++) {
      await request(app).post('/ping').send({ email: 'c@test.com' });
    }
    const blockedC = await request(app).post('/ping').send({ email: 'c@test.com' });
    expect(blockedC.status).toBe(429);

    const differentEmail = await request(app).post('/ping').send({ email: 'd@test.com' });
    expect(differentEmail.status).toBe(200);
  });

  it('resets after the window elapses', async () => {
    const app = buildApp({ windowMs: 50 });
    for (let i = 0; i < 3; i++) {
      await request(app).post('/ping').send({ email: 'e@test.com' });
    }
    expect((await request(app).post('/ping').send({ email: 'e@test.com' })).status).toBe(429);

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect((await request(app).post('/ping').send({ email: 'e@test.com' })).status).toBe(200);
  });
});
