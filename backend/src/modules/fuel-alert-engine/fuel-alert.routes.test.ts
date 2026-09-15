import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { createTestUser, resetTestDb, seedTestRoles, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { SINGLETON_KEY, SystemSettingModel } from '../settings/systemSetting.model.js';

const app = createApp();
type Agent = ReturnType<typeof request.agent>;

async function loginAs(email: string, password = 'password123') {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password });
  return agent;
}

async function seedSettings() {
  await SystemSettingModel.create({
    key: SINGLETON_KEY,
    vatRatePercent: '14',
    currency: 'EGP',
    fuelTolerancePercent: '15',
    fuelCriticalTolerancePercent: '30',
  });
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
async function createGenerator(admin: Agent, normalFuelConsumption = 10) {
  generatorSeq += 1;
  const suffix = `${Date.now().toString(36)}${generatorSeq}`.slice(-10);
  const response = await admin.post('/api/generators').send({
    code: `GEN-${suffix}`,
    specifications: { kva: 300, brand: 'Cummins', model: 'C300D5', serialNumber: `SN-${suffix}` },
    normalFuelConsumption,
  });
  return response.body.data.id as string;
}

/** Triggers a Warning alert: 100L / 8h = 12.5 L/h against a 10 L/h normal rate (+25%). */
async function triggerWarningAlert(admin: Agent, generatorId: string, projectId: string) {
  await admin.post('/api/operations').send({ date: '2026-01-05', projectId, generatorId, startMeter: 0, endMeter: 8 });
  await admin.post('/api/fuel').send({ date: '2026-01-06', generatorId, projectId, liters: 100, pricePerLiter: 10 });
}

describe('fuel alert routes (TASK-017)', () => {
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
    const response = await request(app).get('/api/fuel-alerts');
    expect(response.status).toBe(401);
  });

  it('Section 17: Finance Manager/Accountant/Viewer cannot view fuel alerts at all', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'finance@test.com', password: 'password123', roleId: roles['Finance Manager']._id });
    const finance = await loginAs('finance@test.com');

    expect((await finance.get('/api/fuel-alerts')).status).toBe(403);
  });

  it('AC: a fuel log 20%+ above normal creates a Warning alert visible via the list endpoint', async () => {
    await seedSettings();
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const projectId = await createProject(admin);
    const generatorId = await createGenerator(admin, 10);

    await triggerWarningAlert(admin, generatorId, projectId);

    const list = await admin.get('/api/fuel-alerts');
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ severity: 'Warning', status: 'Open', generator: { id: generatorId } });
  });

  it('Section 17: a Technician can acknowledge (assigned only) but not resolve', async () => {
    await seedSettings();
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const projectId = await createProject(admin);
    const assignedGenerator = await createGenerator(admin, 10);
    const unassignedGenerator = await createGenerator(admin, 10);

    await triggerWarningAlert(admin, assignedGenerator, projectId);
    await triggerWarningAlert(admin, unassignedGenerator, projectId);

    await createTestUser({ email: 'tech@test.com', password: 'password123', roleId: roles.Technician._id });
    const techList = await admin.get('/api/users').query({ search: 'tech@test.com' });
    await admin.patch(`/api/users/${techList.body.data[0].id}`).send({ assignedGenerators: [assignedGenerator] });
    const tech = await loginAs('tech@test.com');

    const techView = await tech.get('/api/fuel-alerts');
    expect(techView.body.data).toHaveLength(1);
    expect(techView.body.data[0].generator.id).toBe(assignedGenerator);

    const assignedAlert = techView.body.data[0].id;
    const ack = await tech.post(`/api/fuel-alerts/${assignedAlert}/acknowledge`);
    expect(ack.status).toBe(200);
    expect(ack.body.data.status).toBe('Acknowledged');

    const resolveAttempt = await tech.post(`/api/fuel-alerts/${assignedAlert}/resolve`).send({ resolutionNote: 'Investigated on site' });
    expect(resolveAttempt.status).toBe(403);

    const allAlerts = await admin.get('/api/fuel-alerts');
    const unassignedAlertId = allAlerts.body.data.find((a: { generator: { id: string } }) => a.generator.id === unassignedGenerator).id;
    const forbiddenAck = await tech.post(`/api/fuel-alerts/${unassignedAlertId}/acknowledge`);
    expect(forbiddenAck.status).toBe(403);
  });

  it('FR-004/Section 19: manual resolve without a note is rejected with 422', async () => {
    await seedSettings();
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const projectId = await createProject(admin);
    const generatorId = await createGenerator(admin, 10);
    await triggerWarningAlert(admin, generatorId, projectId);

    const list = await admin.get('/api/fuel-alerts');
    const alertId = list.body.data[0].id;

    const missingNote = await admin.post(`/api/fuel-alerts/${alertId}/resolve`).send({});
    expect(missingNote.status).toBe(422);

    const resolved = await admin.post(`/api/fuel-alerts/${alertId}/resolve`).send({ resolutionNote: 'Confirmed leak, fixed on site' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.status).toBe('Resolved');
    expect(resolved.body.data.resolvedBy).toBe('user');
  });

  it('filters by status, severity, and generatorId', async () => {
    await seedSettings();
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const projectId = await createProject(admin);
    const generatorId = await createGenerator(admin, 10);
    await triggerWarningAlert(admin, generatorId, projectId);

    const byStatus = await admin.get('/api/fuel-alerts').query({ status: 'Open' });
    expect(byStatus.body.data).toHaveLength(1);

    const bySeverity = await admin.get('/api/fuel-alerts').query({ severity: 'Critical' });
    expect(bySeverity.body.data).toHaveLength(0);

    const byGenerator = await admin.get('/api/fuel-alerts').query({ generatorId });
    expect(byGenerator.body.data).toHaveLength(1);
  });
});
