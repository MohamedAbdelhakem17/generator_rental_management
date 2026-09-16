import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import {
  createTestUser,
  resetTestDb,
  seedTestRoles,
  seedTestSettings,
  startTestDb,
  stopTestDb,
} from '../../test/authFixtures.js';

const app = createApp();

async function loginAs(email: string, password = 'password123') {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password });
  return agent;
}

describe('settings routes (TASK-030)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('rejects an unauthenticated request with 401', async () => {
    const response = await request(app).get('/api/settings');
    expect(response.status).toBe(401);
  });

  it('rejects a role with neither settings:manage nor settings:finance with 403', async () => {
    await seedTestSettings();
    const roles = await seedTestRoles();
    await createTestUser({
      email: 'viewer@test.com',
      password: 'password123',
      roleId: roles.Viewer._id,
    });

    const viewer = await loginAs('viewer@test.com');
    const response = await viewer.get('/api/settings');
    expect(response.status).toBe(403);
  });

  it('returns every category for an Admin', async () => {
    await seedTestSettings();
    const roles = await seedTestRoles();
    await createTestUser({
      email: 'admin@test.com',
      password: 'password123',
      roleId: roles['System Admin']._id,
    });

    const admin = await loginAs('admin@test.com');
    const response = await admin.get('/api/settings');
    expect(response.status).toBe(200);
    expect(response.body.data.Financial.vatRate).toBe(14);
    expect(response.body.data.Operational.fuelAlertTolerancePercent).toBe(15);
    expect(response.body.data.ReferenceList.expenseCategories).toBeInstanceOf(Array);
  });

  it('AC: a Finance Manager only sees the Financial category', async () => {
    await seedTestSettings();
    const roles = await seedTestRoles();
    await createTestUser({
      email: 'finance@test.com',
      password: 'password123',
      roleId: roles['Finance Manager']._id,
    });

    const finance = await loginAs('finance@test.com');
    const response = await finance.get('/api/settings');
    expect(response.status).toBe(200);
    expect(response.body.data.Financial.currency).toBe('EGP');
    expect(Object.keys(response.body.data.Operational)).toHaveLength(0);
    expect(Object.keys(response.body.data.ReferenceList)).toHaveLength(0);
  });

  it('AC: Finance Manager editing defaultMaintenanceCycleHours is rejected with 403', async () => {
    await seedTestSettings();
    const roles = await seedTestRoles();
    await createTestUser({
      email: 'finance2@test.com',
      password: 'password123',
      roleId: roles['Finance Manager']._id,
    });

    const finance = await loginAs('finance2@test.com');
    const response = await finance
      .patch('/api/settings/defaultMaintenanceCycleHours')
      .send({ value: 300 });
    expect(response.status).toBe(403);
  });

  it('AC: changing vatRate from 14% to 15% only affects reads after the change', async () => {
    await seedTestSettings();
    const roles = await seedTestRoles();
    await createTestUser({
      email: 'admin2@test.com',
      password: 'password123',
      roleId: roles['System Admin']._id,
    });

    const admin = await loginAs('admin2@test.com');
    const before = await admin.get('/api/settings');
    expect(before.body.data.Financial.vatRate).toBe(14);

    const patch = await admin.patch('/api/settings/vatRate').send({ value: 15 });
    expect(patch.status).toBe(200);

    const after = await admin.get('/api/settings');
    expect(after.body.data.Financial.vatRate).toBe(15);
  });

  it('accepts vatRate as a 0-1 fraction and normalizes it to the percent scale', async () => {
    await seedTestSettings();
    const roles = await seedTestRoles();
    await createTestUser({
      email: 'admin3@test.com',
      password: 'password123',
      roleId: roles['System Admin']._id,
    });

    const admin = await loginAs('admin3@test.com');
    const patch = await admin.patch('/api/settings/vatRate').send({ value: 0.15 });
    expect(patch.status).toBe(200);

    const after = await admin.get('/api/settings');
    expect(after.body.data.Financial.vatRate).toBe(15);
  });

  it('rejects fuelAlertTolerancePercent >= fuelAlertCriticalPercent with 422', async () => {
    await seedTestSettings();
    const roles = await seedTestRoles();
    await createTestUser({
      email: 'admin4@test.com',
      password: 'password123',
      roleId: roles['System Admin']._id,
    });

    const admin = await loginAs('admin4@test.com');
    const response = await admin
      .patch('/api/settings/fuelAlertTolerancePercent')
      .send({ value: 30 });
    expect(response.status).toBe(422);
  });

  it('rejects an unknown setting key with 404', async () => {
    await seedTestSettings();
    const roles = await seedTestRoles();
    await createTestUser({
      email: 'admin5@test.com',
      password: 'password123',
      roleId: roles['System Admin']._id,
    });

    const admin = await loginAs('admin5@test.com');
    const response = await admin.patch('/api/settings/notAKey').send({ value: 1 });
    expect(response.status).toBe(404);
  });
});
