import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { resetTestDb, createTestUser, seedTestRoles, startTestDb, stopTestDb } from '../../test/authFixtures.js';

const app = createApp();

async function loginAs(email: string, password = 'password123') {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password });
  return agent;
}

describe('role routes', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('lists all 6 seeded roles for an Admin', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');

    const response = await admin.get('/api/roles');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(6);
  });

  it('rejects a non-Admin role from managing roles (Ops Manager, per Section 7.2)', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'ops@test.com', password: 'password123', roleId: roles['Operations Manager']._id });
    const opsManager = await loginAs('ops@test.com');

    const response = await opsManager.get('/api/roles');

    expect(response.status).toBe(403);
  });

  it('lets an Admin update a role permission set', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');

    const response = await admin
      .patch(`/api/roles/${roles.Viewer._id}`)
      .send({ permissions: ['generators:read', 'reports:read'] });

    expect(response.status).toBe(200);
    expect(response.body.data.permissions).toEqual(['generators:read', 'reports:read']);
  });

  it('Validation Rule: rejects an empty permission set with 422', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');

    const response = await admin.patch(`/api/roles/${roles.Viewer._id}`).send({ permissions: [] });

    expect(response.status).toBe(422);
  });

  it('rejects an unknown permission key with 422', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');

    const response = await admin.patch(`/api/roles/${roles.Viewer._id}`).send({ permissions: ['not:a-real-key'] });

    expect(response.status).toBe(422);
  });
});
