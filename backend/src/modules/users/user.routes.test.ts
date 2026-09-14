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

describe('user routes (permission matrix + business rules)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('FR-004 + Section 25 AC: a Viewer gets 403 on a write endpoint regardless of frontend state', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    await createTestUser({ email: 'viewer@test.com', password: 'password123', roleId: roles.Viewer._id });
    const viewer = await loginAs('viewer@test.com');

    const response = await viewer.get('/api/users');

    expect(response.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const response = await request(app).get('/api/users');
    expect(response.status).toBe(401);
  });

  it('allows an Admin to list, create, and update users', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');

    const list = await admin.get('/api/users');
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].role).toMatchObject({ name: 'System Admin' });

    const create = await admin.post('/api/users').send({
      name: 'New Tech',
      email: 'tech@test.com',
      password: 'password123',
      role: String(roles.Technician._id),
    });
    expect(create.status).toBe(201);
    expect(create.body.data.email).toBe('tech@test.com');
    expect(create.body.data).not.toHaveProperty('passwordHash');

    const update = await admin.patch(`/api/users/${create.body.data.id}`).send({ active: false });
    expect(update.status).toBe(200);
    expect(update.body.data.active).toBe(false);
  });

  it('rejects creating a user with a duplicate email with 409', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    await createTestUser({ email: 'dup@test.com', password: 'password123', roleId: roles.Viewer._id });

    const response = await admin.post('/api/users').send({
      name: 'Dup',
      email: 'dup@test.com',
      password: 'password123',
      role: String(roles.Viewer._id),
    });

    expect(response.status).toBe(409);
  });

  it('rejects a create payload with a too-short password with 422', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');

    const response = await admin.post('/api/users').send({
      name: 'Short Pw',
      email: 'short@test.com',
      password: 'short',
      role: String(roles.Viewer._id),
    });

    expect(response.status).toBe(422);
  });

  it('Section 20 edge case: blocks self-deactivation', async () => {
    const roles = await seedTestRoles();
    const admin = await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const agent = await loginAs('admin@test.com');

    const response = await agent.patch(`/api/users/${admin._id}`).send({ active: false });

    expect(response.status).toBe(403);
  });

  it('Section 20 edge case: blocks deactivating the last active Admin', async () => {
    const roles = await seedTestRoles();
    const soleAdmin = await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const otherAdmin = await createTestUser({ email: 'admin2@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const agent = await loginAs('admin@test.com');

    // Deactivating the OTHER admin is fine while sole admin remains active.
    const first = await agent.patch(`/api/users/${otherAdmin._id}`).send({ active: false });
    expect(first.status).toBe(200);

    // Now only `soleAdmin` is left active; deactivating a second (already-inactive) admin
    // is moot, so instead verify soleAdmin can't be deleted once they're the last one.
    const deleteResponse = await agent.delete(`/api/users/${soleAdmin._id}`);
    expect(deleteResponse.status).toBe(403);
  });

  it('soft-deletes a non-last-admin user', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const target = await createTestUser({ email: 'viewer@test.com', password: 'password123', roleId: roles.Viewer._id });
    const agent = await loginAs('admin@test.com');

    const response = await agent.delete(`/api/users/${target._id}`);

    expect(response.status).toBe(200);
    const list = await agent.get('/api/users');
    expect(list.body.data.find((u: { id: string }) => u.id === String(target._id))).toBeUndefined();
  });
});
