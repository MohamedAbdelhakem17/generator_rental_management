import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { errorHandler } from '../../middleware/errorHandler.js';
import { loginRateLimiter } from '../../middleware/rateLimit.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { createTestUser, resetTestDb, seedTestRoles, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { login } from './auth.controller.js';

/** Exercises the real `/api/auth/login` controller behind the real rate-limit middleware —
 * `auth.routes.ts` wires the same `loginRateLimiter()` with its default (production) options,
 * which are skipped under NODE_ENV=test by design (see rateLimit.ts); this test forces the
 * real limiter on (`bypassInTest: false`) with a small max/window so Section 25's AC is proven
 * end-to-end without waiting on the real 15-minute window or breaking the ~300 other tests that
 * log in as the same test account repeatedly per file.
 */
function buildRateLimitedAuthApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.post('/api/auth/login', loginRateLimiter({ max: 10, windowMs: 15 * 60 * 1000, bypassInTest: false }), asyncHandler(login));
  app.use(errorHandler);
  return app;
}

describe('POST /api/auth/login rate limiting (TASK-034 FR-001/AC)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('AC: the 11th login attempt within the window for the same IP+email is rejected with 429 and Retry-After, the 10th still gets a normal auth response', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'bruteforce@test.com', password: 'password123', roleId: roles.Viewer._id });
    const app = buildRateLimitedAuthApp();

    for (let attempt = 1; attempt <= 10; attempt++) {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'bruteforce@test.com', password: 'wrong-password' });
      // Each of the first 10 attempts reaches the real auth logic (401 for a wrong password),
      // never the rate limiter's 429 — the limiter counts requests, not just failures.
      expect(response.status).toBe(401);
    }

    const eleventh = await request(app)
      .post('/api/auth/login')
      .send({ email: 'bruteforce@test.com', password: 'wrong-password' });
    expect(eleventh.status).toBe(429);
    expect(eleventh.headers['retry-after']).toBeDefined();
  });

  it("Section 20: doesn't block a different email from the same source, avoiding a shared-IP false positive", async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'victim@test.com', password: 'password123', roleId: roles.Viewer._id });
    const app = buildRateLimitedAuthApp();

    for (let attempt = 0; attempt < 10; attempt++) {
      await request(app).post('/api/auth/login').send({ email: 'attacker@test.com', password: 'x' });
    }

    const legitimateLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'victim@test.com', password: 'password123' });
    expect(legitimateLogin.status).toBe(200);
  });
});
