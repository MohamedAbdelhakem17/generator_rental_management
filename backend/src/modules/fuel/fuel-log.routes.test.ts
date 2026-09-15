import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app.js';
import { createTestUser, resetTestDb, seedTestRoles, seedTestSettings, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { FuelAlertEngineService } from '../fuel-alert-engine/service.js';

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
async function createGenerator(admin: Agent) {
  generatorSeq += 1;
  const suffix = `${Date.now().toString(36)}${generatorSeq}`.slice(-10);
  const response = await admin.post('/api/generators').send({
    code: `GEN-${suffix}`,
    specifications: { kva: 300, brand: 'Cummins', model: 'C300D5', serialNumber: `SN-${suffix}` },
    normalFuelConsumption: 18,
  });
  return response.body.data.id as string;
}

describe('fuel log routes (TASK-016)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('rejects an unauthenticated request with 401', async () => {
    const response = await request(app).get('/api/fuel');
    expect(response.status).toBe(401);
  });

  it('Section 17: Finance Manager/Accountant/Viewer can view but not create', async () => {
    const roles = await seedTestRoles();
    await seedTestSettings();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    await createTestUser({ email: 'finance@test.com', password: 'password123', roleId: roles['Finance Manager']._id });
    const admin = await loginAs('admin@test.com');
    const finance = await loginAs('finance@test.com');
    const projectId = await createProject(admin);
    const generatorId = await createGenerator(admin);

    expect((await finance.get('/api/fuel')).status).toBe(200);
    expect(
      (await finance.post('/api/fuel').send({ date: '2026-01-05', generatorId, projectId, liters: 50, pricePerLiter: 10 }))
        .status,
    ).toBe(403);
  });

  it('AC: 200 liters over 100 operating hours yields a consumption rate of 2, and totalCost is computed server-side', async () => {
    const roles = await seedTestRoles();
    await seedTestSettings();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const projectId = await createProject(admin);
    const generatorId = await createGenerator(admin);

    await admin.post('/api/operations').send({ date: '2026-01-05', projectId, generatorId, startMeter: 0, endMeter: 100 });

    const create = await admin
      .post('/api/fuel')
      .send({ date: '2026-01-06', generatorId, projectId, liters: 200, pricePerLiter: 15 });

    expect(create.status).toBe(201);
    expect(create.body.data.operatingHoursRef).toBe(100);
    expect(create.body.data.consumptionRate).toBe(2);
    expect(create.body.data.totalCost).toBe('3000.00');
  });

  it('AC/Edge Case: zero operating hours in the reference window yields consumptionRate null ("N/A"), never an error or zero', async () => {
    const roles = await seedTestRoles();
    await seedTestSettings();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const projectId = await createProject(admin);
    const generatorId = await createGenerator(admin);

    const create = await admin
      .post('/api/fuel')
      .send({ date: '2026-01-05', generatorId, projectId, liters: 50, pricePerLiter: 10 });

    expect(create.status).toBe(201);
    expect(create.body.data.operatingHoursRef).toBeNull();
    expect(create.body.data.consumptionRate).toBeNull();
    expect(create.body.data.totalCost).toBe('500.00');
  });

  it('rejects non-positive liters/pricePerLiter with 422', async () => {
    const roles = await seedTestRoles();
    await seedTestSettings();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const projectId = await createProject(admin);
    const generatorId = await createGenerator(admin);

    const badLiters = await admin.post('/api/fuel').send({ date: '2026-01-05', generatorId, projectId, liters: 0, pricePerLiter: 10 });
    expect(badLiters.status).toBe(422);

    const badPrice = await admin.post('/api/fuel').send({ date: '2026-01-05', generatorId, projectId, liters: 50, pricePerLiter: -1 });
    expect(badPrice.status).toBe(422);
  });

  it('Section 17/20: a Technician can only log fuel for their assigned generators', async () => {
    const roles = await seedTestRoles();
    await seedTestSettings();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const projectId = await createProject(admin);
    const assignedGenerator = await createGenerator(admin);
    const unassignedGenerator = await createGenerator(admin);

    await createTestUser({ email: 'tech@test.com', password: 'password123', roleId: roles.Technician._id });
    const techList = await admin.get('/api/users').query({ search: 'tech@test.com' });
    await admin.patch(`/api/users/${techList.body.data[0].id}`).send({ assignedGenerators: [assignedGenerator] });
    const tech = await loginAs('tech@test.com');

    const allowed = await tech.post('/api/fuel').send({ date: '2026-01-05', generatorId: assignedGenerator, projectId, liters: 50, pricePerLiter: 10 });
    expect(allowed.status).toBe(201);

    const forbidden = await tech.post('/api/fuel').send({ date: '2026-01-05', generatorId: unassignedGenerator, projectId, liters: 50, pricePerLiter: 10 });
    expect(forbidden.status).toBe(403);
  });

  it('Edge Case: multiple same-day fill-ups are each evaluated against their own reference window, not double-counted', async () => {
    const roles = await seedTestRoles();
    await seedTestSettings();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const projectId = await createProject(admin);
    const generatorId = await createGenerator(admin);

    await admin.post('/api/operations').send({ date: '2026-01-04', projectId, generatorId, startMeter: 0, endMeter: 40 });
    const first = await admin.post('/api/fuel').send({ date: '2026-01-05', generatorId, projectId, liters: 80, pricePerLiter: 10 });
    expect(first.body.data.operatingHoursRef).toBe(40);

    await admin.post('/api/operations').send({ date: '2026-01-05', projectId, generatorId, startMeter: 40, endMeter: 70 });
    const second = await admin.post('/api/fuel').send({ date: '2026-01-05', generatorId, projectId, liters: 60, pricePerLiter: 10 });
    // Second fill-up's window starts right after the first fuel log's date — only the 30h
    // logged on/after 2026-01-05 counts, not the 40h already attributed to the first fill-up.
    expect(second.body.data.operatingHoursRef).toBe(30);
  });

  it("detail includes the contributing Operation Log ids for the operatingHoursRef", async () => {
    const roles = await seedTestRoles();
    await seedTestSettings();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const projectId = await createProject(admin);
    const generatorId = await createGenerator(admin);

    const op = await admin.post('/api/operations').send({ date: '2026-01-05', projectId, generatorId, startMeter: 0, endMeter: 40 });
    const create = await admin.post('/api/fuel').send({ date: '2026-01-06', generatorId, projectId, liters: 80, pricePerLiter: 10 });

    const detail = await admin.get(`/api/fuel/${create.body.data.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.contributingOperationLogIds).toEqual([op.body.data.id]);
  });

  it('FR-003/DoD: the fuel alert engine is invoked on every fuel log creation', async () => {
    const roles = await seedTestRoles();
    await seedTestSettings();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const projectId = await createProject(admin);
    const generatorId = await createGenerator(admin);

    const evaluateSpy = vi.spyOn(FuelAlertEngineService, 'evaluate').mockResolvedValue(undefined);

    const create = await admin.post('/api/fuel').send({ date: '2026-01-05', generatorId, projectId, liters: 50, pricePerLiter: 10 });

    expect(evaluateSpy).toHaveBeenCalledWith(create.body.data.id);
  });
});
