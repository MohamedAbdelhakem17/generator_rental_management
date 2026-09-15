import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { createTestUser, resetTestDb, seedTestRoles, startTestDb, stopTestDb } from '../../test/authFixtures.js';

const app = createApp();
type Agent = ReturnType<typeof request.agent>;

async function loginAs(email: string, password = 'password123') {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password });
  return agent;
}

let generatorSeq = 0;
async function createGenerator(admin: Agent, overrides: Record<string, unknown> = {}) {
  generatorSeq += 1;
  const suffix = `${Date.now().toString(36)}${generatorSeq}`.slice(-10);
  const response = await admin.post('/api/generators').send({
    code: `GEN-${suffix}`,
    specifications: { kva: 300, brand: 'Cummins', model: 'C300D5', serialNumber: `SN-${suffix}` },
    normalFuelConsumption: 18,
    maintenanceCycleHours: 250,
    ...overrides,
  });
  return response.body.data.id as string;
}

describe('maintenance routes (TASK-018)', () => {
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
    const response = await request(app).get('/api/maintenance');
    expect(response.status).toBe(401);
  });

  it('Section 17: Finance Manager/Accountant/Viewer can view but not open a maintenance record', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const generatorId = await createGenerator(admin);

    for (const [email, roleName] of [
      ['finance@test.com', 'Finance Manager'],
      ['acct@test.com', 'Accountant'],
      ['viewer@test.com', 'Viewer'],
    ] as const) {
      await createTestUser({ email, password: 'password123', roleId: roles[roleName]._id });
      const agent = await loginAs(email);

      const list = await agent.get('/api/maintenance');
      expect(list.status).toBe(200);

      const open = await agent.post('/api/maintenance').send({
        generatorId,
        type: 'Preventive',
        date: '2026-01-01',
        meter: 0,
      });
      expect(open.status).toBe(403);
    }
  });

  it('AC: parts 1000 + oil 200 + labor 500 + transport 300 yields totalCost 2000.00, and opens the generator into Under Maintenance', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const generatorId = await createGenerator(admin);

    const open = await admin.post('/api/maintenance').send({
      generatorId,
      type: 'Preventive',
      date: '2026-01-01',
      meter: 0,
      partsCost: 1000,
      oilCost: 200,
      laborCost: 500,
      transportCost: 300,
    });

    expect(open.status).toBe(201);
    expect(open.body.data.totalCost).toBe('2000.00');
    expect(open.body.data.status).toBe('Open');

    const generator = await admin.get(`/api/generators/${generatorId}`);
    expect(generator.body.data.status).toBe('Under Maintenance');
  });

  it('FR-002: a second Open attempt for a generator with an existing Open record is rejected with 409', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const generatorId = await createGenerator(admin);

    await admin.post('/api/maintenance').send({ generatorId, type: 'Preventive', date: '2026-01-01', meter: 0 });
    const second = await admin.post('/api/maintenance').send({ generatorId, type: 'Corrective', date: '2026-01-02', meter: 5 });

    expect(second.status).toBe(409);
  });

  it('AC: completing at meter 5000 with a 250-hour cycle sets nextMaintenanceMeter to 5250, and generator returns to Available', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const generatorId = await createGenerator(admin, { currentMeter: 5000, maintenanceCycleHours: 250 });

    const open = await admin.post('/api/maintenance').send({ generatorId, type: 'Preventive', date: '2026-01-01', meter: 5000 });
    const id = open.body.data.id;

    await admin.post(`/api/maintenance/${id}/start`);
    const complete = await admin.post(`/api/maintenance/${id}/complete`);

    expect(complete.status).toBe(200);
    expect(complete.body.data.status).toBe('Completed');
    expect(complete.body.data.nextMaintenanceMeter).toBe(5250);

    const generator = await admin.get(`/api/generators/${generatorId}`);
    expect(generator.body.data.status).toBe('Available');
  });

  it('Edge Case: cancelling requires a reason and never computes nextMaintenanceMeter', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const generatorId = await createGenerator(admin);

    const open = await admin.post('/api/maintenance').send({ generatorId, type: 'Preventive', date: '2026-01-01', meter: 0 });
    const id = open.body.data.id;

    const missingReason = await admin.post(`/api/maintenance/${id}/cancel`).send({});
    expect(missingReason.status).toBe(422);

    const cancel = await admin.post(`/api/maintenance/${id}/cancel`).send({ reason: 'Duplicate entry' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe('Cancelled');
    expect(cancel.body.data.nextMaintenanceMeter).toBeNull();
  });

  it('Section 17: a Technician can open/start for their assigned generator only, and cannot complete or cancel', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const assignedGenerator = await createGenerator(admin);
    const unassignedGenerator = await createGenerator(admin);

    await createTestUser({ email: 'tech@test.com', password: 'password123', roleId: roles.Technician._id });
    const techList = await admin.get('/api/users').query({ search: 'tech@test.com' });
    const techId = techList.body.data[0].id;
    await admin.patch(`/api/users/${techId}`).send({ assignedGenerators: [assignedGenerator] });

    const tech = await loginAs('tech@test.com');

    const forbidden = await tech.post('/api/maintenance').send({
      generatorId: unassignedGenerator,
      type: 'Preventive',
      date: '2026-01-01',
      meter: 0,
    });
    expect(forbidden.status).toBe(403);

    const allowed = await tech.post('/api/maintenance').send({
      generatorId: assignedGenerator,
      type: 'Preventive',
      date: '2026-01-01',
      meter: 0,
    });
    expect(allowed.status).toBe(201);
    const id = allowed.body.data.id;

    const start = await tech.post(`/api/maintenance/${id}/start`);
    expect(start.status).toBe(200);

    const complete = await tech.post(`/api/maintenance/${id}/complete`);
    expect(complete.status).toBe(403);

    const cancel = await tech.post(`/api/maintenance/${id}/cancel`).send({ reason: 'test' });
    expect(cancel.status).toBe(403);
  });

  it('PATCH updates cost fields and recomputes totalCost while Open', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const generatorId = await createGenerator(admin);

    const open = await admin.post('/api/maintenance').send({ generatorId, type: 'Preventive', date: '2026-01-01', meter: 0, partsCost: 100 });
    const id = open.body.data.id;

    const update = await admin.patch(`/api/maintenance/${id}`).send({ partsCost: 150, laborCost: 50 });
    expect(update.status).toBe(200);
    expect(update.body.data.totalCost).toBe('200.00');
  });

  it('rejects editing a Completed record with 409', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const generatorId = await createGenerator(admin);

    const open = await admin.post('/api/maintenance').send({ generatorId, type: 'Preventive', date: '2026-01-01', meter: 0 });
    const id = open.body.data.id;
    await admin.post(`/api/maintenance/${id}/complete`);

    const update = await admin.patch(`/api/maintenance/${id}`).send({ partsCost: 10 });
    expect(update.status).toBe(409);
  });
});
