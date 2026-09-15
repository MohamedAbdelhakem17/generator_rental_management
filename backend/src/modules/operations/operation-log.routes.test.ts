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

async function createProject(admin: Agent) {
  const customer = await admin.post('/api/customers').send({
    code: `CUST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    companyName: 'Acme Construction',
  });
  const project = await admin.post('/api/projects').send({
    code: `PROJ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: 'Site A',
    customerId: customer.body.data.id,
    startDate: '2026-01-01',
  });
  return project.body.data.id as string;
}

let generatorSeq = 0;
async function createGenerator(admin: Agent, overrides: Record<string, unknown> = {}) {
  generatorSeq += 1;
  const suffix = `${Date.now().toString(36)}${generatorSeq}`.slice(-10);
  const response = await admin.post('/api/generators').send({
    code: `GEN-${suffix}`,
    specifications: { kva: 300, brand: 'Cummins', model: 'C300D5', serialNumber: `SN-${suffix}` },
    normalFuelConsumption: 18,
    ...overrides,
  });
  return response.body.data.id as string;
}

describe('operation log routes (TASK-015)', () => {
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
    const response = await request(app).get('/api/operations');
    expect(response.status).toBe(401);
  });

  it('AC: creating a log computes operatingHours and updates Generator.currentMeter', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const projectId = await createProject(admin);
    const generatorId = await createGenerator(admin);

    const create = await admin.post('/api/operations').send({
      date: '2026-01-05',
      projectId,
      generatorId,
      startMeter: 1230,
      endMeter: 1250,
    });

    expect(create.status).toBe(201);
    expect(create.body.data.operatingHours).toBe(20);
    expect(create.body.data.status).toBe('Active');

    const generator = await admin.get(`/api/generators/${generatorId}`);
    expect(generator.body.data.currentMeter).toBe(1250);
  });

  it('Edge Case: a zero-operating-hours entry (startMeter == endMeter) is valid', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const projectId = await createProject(admin);
    const generatorId = await createGenerator(admin);

    const create = await admin.post('/api/operations').send({
      date: '2026-01-05',
      projectId,
      generatorId,
      startMeter: 100,
      endMeter: 100,
    });

    expect(create.status).toBe(201);
    expect(create.body.data.operatingHours).toBe(0);
  });

  it('FR-002: rejects endMeter < startMeter on the normal create endpoint with 422', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const projectId = await createProject(admin);
    const generatorId = await createGenerator(admin);

    const response = await admin.post('/api/operations').send({
      date: '2026-01-05',
      projectId,
      generatorId,
      startMeter: 100,
      endMeter: 50,
    });

    expect(response.status).toBe(422);
  });

  it('FR-003: rejects a startMeter below Generator.currentMeter with 409', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const projectId = await createProject(admin);
    const generatorId = await createGenerator(admin);

    await admin.post('/api/operations').send({ date: '2026-01-05', projectId, generatorId, startMeter: 100, endMeter: 150 });

    const backward = await admin
      .post('/api/operations')
      .send({ date: '2026-01-06', projectId, generatorId, startMeter: 140, endMeter: 160 });

    expect(backward.status).toBe(409);
  });

  it('rejects a future-dated entry with 422', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const projectId = await createProject(admin);
    const generatorId = await createGenerator(admin);

    const future = new Date();
    future.setDate(future.getDate() + 5);

    const response = await admin.post('/api/operations').send({
      date: future.toISOString().slice(0, 10),
      projectId,
      generatorId,
      startMeter: 0,
      endMeter: 10,
    });

    expect(response.status).toBe(422);
  });

  it('Section 17/20: a Technician can only log for their assigned generators (403 otherwise)', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const projectId = await createProject(admin);
    const assignedGenerator = await createGenerator(admin);
    const unassignedGenerator = await createGenerator(admin);

    await createTestUser({
      email: 'tech@test.com',
      password: 'password123',
      roleId: roles.Technician._id,
    });
    // Assign after creation via PATCH, exercising TASK-015's own User.assignedGenerators field.
    const techList = await admin.get('/api/users').query({ search: 'tech@test.com' });
    const techId = techList.body.data[0].id;
    await admin.patch(`/api/users/${techId}`).send({ assignedGenerators: [assignedGenerator] });

    const tech = await loginAs('tech@test.com');

    const allowed = await tech.post('/api/operations').send({
      date: '2026-01-05',
      projectId,
      generatorId: assignedGenerator,
      startMeter: 0,
      endMeter: 5,
    });
    expect(allowed.status).toBe(201);

    const forbidden = await tech.post('/api/operations').send({
      date: '2026-01-05',
      projectId,
      generatorId: unassignedGenerator,
      startMeter: 0,
      endMeter: 5,
    });
    expect(forbidden.status).toBe(403);
  });

  it("Section 17: a Technician's list is restricted to their assigned generators", async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const projectId = await createProject(admin);
    const assignedGenerator = await createGenerator(admin);
    const otherGenerator = await createGenerator(admin);

    await admin.post('/api/operations').send({ date: '2026-01-05', projectId, generatorId: assignedGenerator, startMeter: 0, endMeter: 5 });
    await admin.post('/api/operations').send({ date: '2026-01-05', projectId, generatorId: otherGenerator, startMeter: 0, endMeter: 5 });

    await createTestUser({ email: 'tech@test.com', password: 'password123', roleId: roles.Technician._id });
    const techList = await admin.get('/api/users').query({ search: 'tech@test.com' });
    await admin.patch(`/api/users/${techList.body.data[0].id}`).send({ assignedGenerators: [assignedGenerator] });
    const tech = await loginAs('tech@test.com');

    const list = await tech.get('/api/operations');
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].generator.id).toBe(assignedGenerator);
  });

  it('FR-005: correction supersedes the original, both remain queryable, and only Admin/Ops Manager may correct', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    await createTestUser({ email: 'ops@test.com', password: 'password123', roleId: roles['Operations Manager']._id });
    await createTestUser({ email: 'tech@test.com', password: 'password123', roleId: roles.Technician._id });
    const admin = await loginAs('admin@test.com');
    const ops = await loginAs('ops@test.com');
    const tech = await loginAs('tech@test.com');
    const projectId = await createProject(admin);
    const generatorId = await createGenerator(admin);

    const create = await admin.post('/api/operations').send({ date: '2026-01-05', projectId, generatorId, startMeter: 100, endMeter: 130 });
    const originalId = create.body.data.id;

    const techAttempt = await tech.patch(`/api/operations/${originalId}/correct`).send({ endMeter: 125, reason: 'Misread' });
    expect(techAttempt.status).toBe(403);

    const missingReason = await ops.patch(`/api/operations/${originalId}/correct`).send({ endMeter: 125 });
    expect(missingReason.status).toBe(422);

    const correction = await ops.patch(`/api/operations/${originalId}/correct`).send({ endMeter: 125, reason: 'Misread the dial' });
    expect(correction.status).toBe(200);
    expect(correction.body.data.operatingHours).toBe(25);
    expect(correction.body.data.correctionOf).toBe(originalId);

    const original = await admin.get(`/api/operations/${originalId}`);
    expect(original.body.data.status).toBe('Superseded');

    const list = await admin.get('/api/operations');
    expect(list.body.data).toHaveLength(2);

    const generator = await admin.get(`/api/generators/${generatorId}`);
    expect(generator.body.data.currentMeter).toBe(125);
  });

  it('FR-004/TASK-014 integration: Hourly rent preview sums Active (non-superseded) operating hours', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const projectId = await createProject(admin);
    const generatorId = await createGenerator(admin);

    const log1 = await admin.post('/api/operations').send({ date: '2026-01-05', projectId, generatorId, startMeter: 0, endMeter: 30 });
    await admin.post('/api/operations').send({ date: '2026-01-06', projectId, generatorId, startMeter: 30, endMeter: 62 });
    // Correct the first entry so its Active replacement carries 40 hours instead of 30 —
    // the superseded original (30h) must not double-count.
    await admin.patch(`/api/operations/${log1.body.data.id}/correct`).send({ endMeter: 40, reason: 'Recount' });

    const projectDetail = await admin.get(`/api/projects/${projectId}`);
    const contract = await admin.post('/api/contracts').send({
      customerId: projectDetail.body.data.customer.id,
      projectId,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      rentalMethod: 'hourly',
      items: [{ generatorId, billingMethod: 'hourly', unitPrice: 100 }],
    });

    const preview = await admin.post(`/api/contracts/${contract.body.data.id}/preview-rent`).send({
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
    });

    expect(preview.status).toBe(200);
    // 40 (corrected) + 32 (second entry) = 72 hours x 100 = 7200.00
    expect(preview.body.data.items[0]).toMatchObject({ amount: '7200.00' });
    expect(preview.body.data.items[0].breakdown.hours).toBe(72);
    expect(preview.body.data.items[0].breakdown.operationLogIds).toHaveLength(2);
  });
});
