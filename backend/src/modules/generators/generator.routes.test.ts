import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { resetTestDb, createTestUser, seedTestRoles, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { DEACTIVATION_GUARDS } from './deactivation-guards.js';

const app = createApp();

async function loginAs(email: string, password = 'password123') {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password });
  return agent;
}

const validPayload = {
  code: 'GEN-001',
  specifications: { kva: 500, brand: 'Cummins', model: 'C500D5', serialNumber: 'SN-0001' },
  normalFuelConsumption: 25,
};

describe('generator routes (TASK-008)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
    DEACTIVATION_GUARDS.length = 0;
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('rejects an unauthenticated request with 401', async () => {
    const response = await request(app).get('/api/generators');
    expect(response.status).toBe(401);
  });

  it('Section 17: every role can list generators (read), but only Admin/Ops Manager can create', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    await createTestUser({ email: 'tech@test.com', password: 'password123', roleId: roles.Technician._id });
    await createTestUser({ email: 'viewer@test.com', password: 'password123', roleId: roles.Viewer._id });

    const tech = await loginAs('tech@test.com');
    const list = await tech.get('/api/generators');
    expect(list.status).toBe(200);

    const viewer = await loginAs('viewer@test.com');
    const createAsViewer = await viewer.post('/api/generators').send(validPayload);
    expect(createAsViewer.status).toBe(403);

    const admin = await loginAs('admin@test.com');
    const createAsAdmin = await admin.post('/api/generators').send(validPayload);
    expect(createAsAdmin.status).toBe(201);
  });

  it('AC: creating a generator with a unique code/serial makes it appear as Available', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');

    const create = await admin.post('/api/generators').send(validPayload);
    expect(create.status).toBe(201);
    expect(create.body.data.status).toBe('Available');
    expect(create.body.data.commercialStatus).toBe('Unassigned');
    expect(create.body.data.currentMeter).toBe(0);
    expect(create.body.data.maintenanceCycleHours).toBe(250);

    const list = await admin.get('/api/generators');
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].code).toBe('GEN-001');
  });

  it('FR-001: rejects a duplicate code with 409', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    await admin.post('/api/generators').send(validPayload);

    const dup = await admin.post('/api/generators').send({
      ...validPayload,
      specifications: { ...validPayload.specifications, serialNumber: 'SN-DIFFERENT' },
    });

    expect(dup.status).toBe(409);
  });

  it('rejects a duplicate serial number with 409 even when the code differs', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    await admin.post('/api/generators').send(validPayload);

    const dup = await admin.post('/api/generators').send({ ...validPayload, code: 'GEN-002' });

    expect(dup.status).toBe(409);
  });

  it('rejects an invalid payload with 422', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');

    const response = await admin.post('/api/generators').send({
      code: 'G',
      specifications: { kva: -1, brand: '', model: '', serialNumber: '' },
      normalFuelConsumption: -5,
    });

    expect(response.status).toBe(422);
  });

  it('updates specification fields without touching currentMeter or status', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const create = await admin.post('/api/generators').send(validPayload);

    const update = await admin
      .patch(`/api/generators/${create.body.data.id}`)
      .send({ location: 'Site B', maintenanceCycleHours: 300 });

    expect(update.status).toBe(200);
    expect(update.body.data.location).toBe('Site B');
    expect(update.body.data.maintenanceCycleHours).toBe(300);
    expect(update.body.data.currentMeter).toBe(0);
    expect(update.body.data.status).toBe('Available');
  });

  it('AC: manualStatus="Stopped" makes the status Stopped regardless of anything else, and resume clears it', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const create = await admin.post('/api/generators').send(validPayload);
    const id = create.body.data.id;

    const missingReason = await admin.post(`/api/generators/${id}/stop`).send({});
    expect(missingReason.status).toBe(422);

    const stop = await admin.post(`/api/generators/${id}/stop`).send({ reason: 'Engine fault' });
    expect(stop.status).toBe(200);
    expect(stop.body.data.status).toBe('Stopped');
    expect(stop.body.data.manualStatus).toBe('Stopped');

    const resume = await admin.post(`/api/generators/${id}/resume`).send();
    expect(resume.status).toBe(200);
    expect(resume.body.data.status).toBe('Available');
    expect(resume.body.data.manualStatus).toBeNull();
  });

  it('Section 17: only Admin/Ops Manager can stop/resume, and only Admin can deactivate', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    await createTestUser({ email: 'ops@test.com', password: 'password123', roleId: roles['Operations Manager']._id });
    const admin = await loginAs('admin@test.com');
    const ops = await loginAs('ops@test.com');
    const create = await admin.post('/api/generators').send(validPayload);
    const id = create.body.data.id;

    const opsStop = await ops.post(`/api/generators/${id}/stop`).send({ reason: 'Maintenance' });
    expect(opsStop.status).toBe(200);

    const opsDeactivate = await ops.delete(`/api/generators/${id}`);
    expect(opsDeactivate.status).toBe(403);

    const adminDeactivate = await admin.delete(`/api/generators/${id}`);
    expect(adminDeactivate.status).toBe(200);
  });

  it('FR-004 edge case: deactivation is blocked with a clear reason while a guard reports one active', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const create = await admin.post('/api/generators').send(validPayload);

    DEACTIVATION_GUARDS.push(async () => 'Generator has an active rental contract');

    const response = await admin.delete(`/api/generators/${create.body.data.id}`);

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/active rental contract/);
  });

  it('a deactivated generator no longer appears in the default list', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const create = await admin.post('/api/generators').send(validPayload);

    await admin.delete(`/api/generators/${create.body.data.id}`);

    const list = await admin.get('/api/generators');
    expect(list.body.data).toHaveLength(0);
  });

  it('FR-002: only Admin can perform a meter correction, and it is reflected on the record', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    await createTestUser({ email: 'ops@test.com', password: 'password123', roleId: roles['Operations Manager']._id });
    const admin = await loginAs('admin@test.com');
    const ops = await loginAs('ops@test.com');
    const create = await admin.post('/api/generators').send(validPayload);
    const id = create.body.data.id;

    const opsAttempt = await ops.patch(`/api/generators/${id}/meter-correction`).send({ currentMeter: 100, reason: 'Initial reading' });
    expect(opsAttempt.status).toBe(403);

    const adminAttempt = await admin.patch(`/api/generators/${id}/meter-correction`).send({ currentMeter: 100, reason: 'Initial reading' });
    expect(adminAttempt.status).toBe(200);
    expect(adminAttempt.body.data.currentMeter).toBe(100);
  });

  it('supports search, status filter, and location filter', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    await admin.post('/api/generators').send(validPayload);
    await admin.post('/api/generators').send({
      code: 'GEN-002',
      specifications: { kva: 250, brand: 'Perkins', model: 'P250', serialNumber: 'SN-0002' },
      normalFuelConsumption: 15,
      location: 'Warehouse A',
    });

    const bySearch = await admin.get('/api/generators').query({ search: 'Perkins' });
    expect(bySearch.body.data).toHaveLength(1);
    expect(bySearch.body.data[0].code).toBe('GEN-002');

    const byLocation = await admin.get('/api/generators').query({ location: 'Warehouse' });
    expect(byLocation.body.data).toHaveLength(1);

    const byStatus = await admin.get('/api/generators').query({ status: 'Available' });
    expect(byStatus.body.data).toHaveLength(2);
  });
});
