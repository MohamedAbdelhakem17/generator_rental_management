import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { createTestUser, resetTestDb, seedTestRoles, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { CLOSE_GUARDS } from './close-guards.js';

const app = createApp();

async function loginAs(email: string, password = 'password123') {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password });
  return agent;
}

async function createCustomer(admin: ReturnType<typeof request.agent>, overrides: Record<string, unknown> = {}) {
  const response = await admin.post('/api/customers').send({
    code: `CUST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    companyName: 'Acme Construction',
    ...overrides,
  });
  return response.body.data.id as string;
}

const basePayload = {
  code: 'PROJ-001',
  name: 'Site A Build-out',
  location: 'Industrial Zone 1',
  siteManager: 'Sam Site',
  startDate: '2026-01-01',
};

describe('project routes (TASK-011)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
    CLOSE_GUARDS.length = 0;
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('rejects an unauthenticated request with 401', async () => {
    const response = await request(app).get('/api/projects');
    expect(response.status).toBe(401);
  });

  it('Section 17: every non-Technician role can view, but only Admin/Ops Manager can create', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    await createTestUser({ email: 'finance@test.com', password: 'password123', roleId: roles['Finance Manager']._id });
    await createTestUser({ email: 'tech@test.com', password: 'password123', roleId: roles.Technician._id });
    const admin = await loginAs('admin@test.com');
    const finance = await loginAs('finance@test.com');
    const tech = await loginAs('tech@test.com');

    const financeList = await finance.get('/api/projects');
    expect(financeList.status).toBe(200);

    const techList = await tech.get('/api/projects');
    expect(techList.status).toBe(403);

    const customerId = await createCustomer(admin);
    const createAsFinance = await finance.post('/api/projects').send({ ...basePayload, customerId });
    expect(createAsFinance.status).toBe(403);

    const createAsAdmin = await admin.post('/api/projects').send({ ...basePayload, customerId });
    expect(createAsAdmin.status).toBe(201);
  });

  it('AC: creating a project under a customer makes it appear with that customer embedded', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const customerId = await createCustomer(admin, { companyName: 'Beta Co' });

    const create = await admin.post('/api/projects').send({ ...basePayload, customerId });
    expect(create.status).toBe(201);
    expect(create.body.data.status).toBe('Active');
    expect(create.body.data.customer).toMatchObject({ id: customerId, companyName: 'Beta Co' });
    expect(create.body.data.assignedGenerators).toBeUndefined();

    const detail = await admin.get(`/api/projects/${create.body.data.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.assignedGenerators).toEqual([]);
  });

  it('FR-001: rejects a duplicate code with 409, and creating against an unknown customer with 422', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const customerId = await createCustomer(admin);
    await admin.post('/api/projects').send({ ...basePayload, customerId });

    const dup = await admin.post('/api/projects').send({ ...basePayload, customerId });
    expect(dup.status).toBe(409);

    const unknownCustomer = await admin
      .post('/api/projects')
      .send({ ...basePayload, code: 'PROJ-002', customerId: '000000000000000000000000' });
    expect(unknownCustomer.status).toBe(422);
  });

  it('rejects creating a project against an inactive customer with 422', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const customerId = await createCustomer(admin);
    await admin.patch(`/api/customers/${customerId}`).send({ active: false });

    const response = await admin.post('/api/projects').send({ ...basePayload, customerId });
    expect(response.status).toBe(422);
  });

  it('FR-002: rejects an endDate before startDate on create and update with 422', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const customerId = await createCustomer(admin);

    const badCreate = await admin
      .post('/api/projects')
      .send({ ...basePayload, customerId, endDate: '2025-12-31' });
    expect(badCreate.status).toBe(422);

    const create = await admin.post('/api/projects').send({ ...basePayload, customerId });
    const badUpdate = await admin.patch(`/api/projects/${create.body.data.id}`).send({ endDate: '2025-12-31' });
    expect(badUpdate.status).toBe(422);

    const goodUpdate = await admin.patch(`/api/projects/${create.body.data.id}`).send({ endDate: '2026-06-30' });
    expect(goodUpdate.status).toBe(200);
  });

  it('rejects an invalid payload with 422', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');

    const response = await admin.post('/api/projects').send({ code: '', name: '' });
    expect(response.status).toBe(422);
  });

  it('updates fields without touching the immutable customerId', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const customerId = await createCustomer(admin, { companyName: 'Original Co' });
    const otherCustomerId = await createCustomer(admin, { companyName: 'Other Co' });
    const create = await admin.post('/api/projects').send({ ...basePayload, customerId });

    const update = await admin
      .patch(`/api/projects/${create.body.data.id}`)
      .send({ siteManager: 'New Manager', customerId: otherCustomerId });

    expect(update.status).toBe(200);
    expect(update.body.data.siteManager).toBe('New Manager');
    expect(update.body.data.customer.id).toBe(customerId);
  });

  it('AC/FR-002 edge case: closing is blocked while a guard reports an active contract, and succeeds otherwise', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const customerId = await createCustomer(admin);
    const create = await admin.post('/api/projects').send({ ...basePayload, customerId });

    CLOSE_GUARDS.push(async () => 'Project has 2 active contract(s)');
    const blocked = await admin.delete(`/api/projects/${create.body.data.id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toMatch(/active contract/);

    CLOSE_GUARDS.length = 0;
    const closed = await admin.delete(`/api/projects/${create.body.data.id}`);
    expect(closed.status).toBe(200);
    expect(closed.body.data.status).toBe('Closed');
  });

  it('a closed project remains visible in the default list (Section 20 edge case)', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const customerId = await createCustomer(admin);
    const create = await admin.post('/api/projects').send({ ...basePayload, customerId });
    await admin.delete(`/api/projects/${create.body.data.id}`);

    const list = await admin.get('/api/projects');
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].status).toBe('Closed');
  });

  it('FR-003: filters by customerId and status', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const customerA = await createCustomer(admin, { companyName: 'Customer A' });
    const customerB = await createCustomer(admin, { companyName: 'Customer B' });
    await admin.post('/api/projects').send({ ...basePayload, customerId: customerA });
    const projectB = await admin
      .post('/api/projects')
      .send({ ...basePayload, code: 'PROJ-B', customerId: customerB });
    await admin.delete(`/api/projects/${projectB.body.data.id}`);

    const byCustomer = await admin.get('/api/projects').query({ customerId: customerB });
    expect(byCustomer.body.data).toHaveLength(1);
    expect(byCustomer.body.data[0].code).toBe('PROJ-B');

    const byStatus = await admin.get('/api/projects').query({ status: 'Closed' });
    expect(byStatus.body.data).toHaveLength(1);
    expect(byStatus.body.data[0].code).toBe('PROJ-B');
  });
});
