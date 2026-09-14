import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { resetTestDb, createTestUser, seedTestRoles, startTestDb, stopTestDb } from '../../test/authFixtures.js';

const app = createApp();

describe('auth routes', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('logs in with correct credentials and sets session cookies', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });

    const response = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'password123' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { user: { name: 'Test User', role: 'System Admin' } },
    });
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('access_token='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
  });

  it('FR-002: returns a generic 401 for a wrong password without revealing the email exists', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });

    const wrongPassword = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'nope' });
    const unknownEmail = await request(app).post('/api/auth/login').send({ email: 'nobody@test.com', password: 'nope' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it('FR-003: blocks a disabled account with 403, even with correct credentials', async () => {
    const roles = await seedTestRoles();
    await createTestUser({
      email: 'disabled@test.com',
      password: 'password123',
      roleId: roles['System Admin']._id,
      active: false,
    });

    const response = await request(app).post('/api/auth/login').send({ email: 'disabled@test.com', password: 'password123' });

    expect(response.status).toBe(403);
  });

  it('rejects a malformed login body with 422', async () => {
    const response = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });
    expect(response.status).toBe(422);
  });

  it('returns the current session user from /api/auth/me', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'password123' });

    const response = await agent.get('/api/auth/me');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ email: 'admin@test.com', role: 'System Admin' });
    expect(response.body.data.permissions).toContain('users:manage');
  });

  it('rejects /api/auth/me with 401 when unauthenticated', async () => {
    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(401);
  });

  it('rotates the refresh token on use and revokes the old one', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'password123' });
    const originalRefreshCookie = (login.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('refresh_token='));

    const refreshResponse = await agent.post('/api/auth/refresh');
    expect(refreshResponse.status).toBe(200);

    // Reusing the original (now-rotated) refresh token must fail and revoke the whole session.
    const reuseResponse = await request(app).post('/api/auth/refresh').set('Cookie', originalRefreshCookie!);
    expect(reuseResponse.status).toBe(401);

    // The rotated (new) token issued by the legitimate refresh must now also be dead.
    const secondRefreshAfterReuse = await agent.post('/api/auth/refresh');
    expect(secondRefreshAfterReuse.status).toBe(401);
  });

  it('logs out and clears session cookies', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'admin@test.com', password: 'password123' });

    const logoutResponse = await agent.post('/api/auth/logout');
    expect(logoutResponse.status).toBe(200);

    const meAfterLogout = await agent.get('/api/auth/me');
    expect(meAfterLogout.status).toBe(401);
  });
});
