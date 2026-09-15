import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { createTestUser, resetTestDb, seedTestRoles, seedTestSettings, startTestDb, stopTestDb } from '../../test/authFixtures.js';

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

async function completeMaintenanceAt(admin: Agent, generatorId: string, meter: number) {
  const open = await admin.post('/api/maintenance').send({ generatorId, type: 'Preventive', date: '2026-01-01', meter });
  await admin.post(`/api/maintenance/${open.body.data.id}/complete`);
}

describe('maintenance alert routes (TASK-019)', () => {
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
    const response = await request(app).get('/api/maintenance-alerts');
    expect(response.status).toBe(401);
  });

  it('Section 17: Finance Manager/Accountant/Viewer cannot view maintenance alerts', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });

    for (const [email, roleName] of [
      ['finance@test.com', 'Finance Manager'],
      ['acct@test.com', 'Accountant'],
      ['viewer@test.com', 'Viewer'],
    ] as const) {
      await createTestUser({ email, password: 'password123', roleId: roles[roleName]._id });
      const agent = await loginAs(email);
      const list = await agent.get('/api/maintenance-alerts');
      expect(list.status).toBe(403);
    }
  });

  it('AC: an Operation Log write that crosses the due meter creates an Overdue alert immediately, and it can be acknowledged', async () => {
    await seedTestSettings();
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const generatorId = await createGenerator(admin, { currentMeter: 5000, maintenanceCycleHours: 250 });

    await completeMaintenanceAt(admin, generatorId, 5000); // nextMaintenanceMeter = 5250

    const customer = await admin.post('/api/customers').send({ code: `CUST-${Date.now()}`, companyName: 'Acme' });
    const project = await admin
      .post('/api/projects')
      .send({ code: `PROJ-${Date.now()}`, name: 'Site A', customerId: customer.body.data.id, startDate: '2026-01-01' });

    await admin.post('/api/operations').send({
      date: '2026-01-05',
      projectId: project.body.data.id,
      generatorId,
      startMeter: 5000,
      endMeter: 5260,
    });

    const list = await admin.get('/api/maintenance-alerts');
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].level).toBe('Overdue');
    expect(list.body.data[0].status).toBe('Open');

    const alertId = list.body.data[0].id;
    const ack = await admin.post(`/api/maintenance-alerts/${alertId}/acknowledge`);
    expect(ack.status).toBe(200);
    expect(ack.body.data.status).toBe('Acknowledged');
  });

  it('Edge Case: opening a new Maintenance record auto-resolves the outstanding schedule alert', async () => {
    await seedTestSettings();
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const generatorId = await createGenerator(admin, { currentMeter: 5000, maintenanceCycleHours: 250 });

    await completeMaintenanceAt(admin, generatorId, 5000);

    const customer = await admin.post('/api/customers').send({ code: `CUST-${Date.now()}`, companyName: 'Acme' });
    const project = await admin
      .post('/api/projects')
      .send({ code: `PROJ-${Date.now()}`, name: 'Site A', customerId: customer.body.data.id, startDate: '2026-01-01' });
    await admin.post('/api/operations').send({ date: '2026-01-05', projectId: project.body.data.id, generatorId, startMeter: 5000, endMeter: 5260 });

    const beforeOpen = await admin.get('/api/maintenance-alerts').query({ status: 'Open' });
    expect(beforeOpen.body.data).toHaveLength(1);

    await admin.post('/api/maintenance').send({ generatorId, type: 'Corrective', date: '2026-01-06', meter: 5260 });

    const afterOpen = await admin.get('/api/maintenance-alerts').query({ status: 'Open' });
    expect(afterOpen.body.data).toHaveLength(0);
    const resolved = await admin.get('/api/maintenance-alerts').query({ status: 'Resolved' });
    expect(resolved.body.data).toHaveLength(1);
  });

  it('Section 17: a Technician can only view/acknowledge alerts for their assigned generators', async () => {
    await seedTestSettings();
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const assignedGenerator = await createGenerator(admin, { currentMeter: 5000, maintenanceCycleHours: 250 });
    const unassignedGenerator = await createGenerator(admin, { currentMeter: 5000, maintenanceCycleHours: 250 });

    await completeMaintenanceAt(admin, assignedGenerator, 5000);
    await completeMaintenanceAt(admin, unassignedGenerator, 5000);

    const customer = await admin.post('/api/customers').send({ code: `CUST-${Date.now()}`, companyName: 'Acme' });
    const project = await admin
      .post('/api/projects')
      .send({ code: `PROJ-${Date.now()}`, name: 'Site A', customerId: customer.body.data.id, startDate: '2026-01-01' });
    await admin.post('/api/operations').send({ date: '2026-01-05', projectId: project.body.data.id, generatorId: assignedGenerator, startMeter: 5000, endMeter: 5260 });
    await admin.post('/api/operations').send({ date: '2026-01-05', projectId: project.body.data.id, generatorId: unassignedGenerator, startMeter: 5000, endMeter: 5260 });

    await createTestUser({ email: 'tech@test.com', password: 'password123', roleId: roles.Technician._id });
    const techList = await admin.get('/api/users').query({ search: 'tech@test.com' });
    const techId = techList.body.data[0].id;
    await admin.patch(`/api/users/${techId}`).send({ assignedGenerators: [assignedGenerator] });

    const tech = await loginAs('tech@test.com');
    const list = await tech.get('/api/maintenance-alerts');
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].generator.id).toBe(assignedGenerator);
  });
});
