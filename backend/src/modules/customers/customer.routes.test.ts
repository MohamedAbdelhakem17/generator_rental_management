import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { createTestUser, resetTestDb, seedTestRoles, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { DEACTIVATION_GUARDS } from './deactivation-guards.js';

const app = createApp();

async function loginAs(email: string, password = 'password123') {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password });
  return agent;
}

const validPayload = {
  code: 'CUST-001',
  companyName: 'Acme Construction',
  contactPerson: 'Jane Doe',
  phone: '+20 100 123 4567',
  taxNumber: '123456789',
  address: '1 Industrial Zone',
};

describe('customer routes (TASK-010)', () => {
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
    const response = await request(app).get('/api/customers');
    expect(response.status).toBe(401);
  });

  it('Section 17: every role can view customers except Technician, but only Admin/Ops Manager/Finance Manager can create', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    await createTestUser({ email: 'accountant@test.com', password: 'password123', roleId: roles.Accountant._id });
    await createTestUser({ email: 'tech@test.com', password: 'password123', roleId: roles.Technician._id });

    const accountant = await loginAs('accountant@test.com');
    const list = await accountant.get('/api/customers');
    expect(list.status).toBe(200);

    const tech = await loginAs('tech@test.com');
    const techList = await tech.get('/api/customers');
    expect(techList.status).toBe(403);

    const createAsAccountant = await accountant.post('/api/customers').send(validPayload);
    expect(createAsAccountant.status).toBe(403);

    const admin = await loginAs('admin@test.com');
    const createAsAdmin = await admin.post('/api/customers').send(validPayload);
    expect(createAsAdmin.status).toBe(201);
  });

  it('AC: creating a customer with a unique code makes it appear immediately in the list', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');

    const create = await admin.post('/api/customers').send(validPayload);
    expect(create.status).toBe(201);
    expect(create.body.data.active).toBe(true);
    expect(create.body.data.companyName).toBe('Acme Construction');

    const list = await admin.get('/api/customers');
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].code).toBe('CUST-001');
  });

  it('FR-001: rejects a duplicate code with 409', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    await admin.post('/api/customers').send(validPayload);

    const dup = await admin.post('/api/customers').send({ ...validPayload, companyName: 'Different Co' });
    expect(dup.status).toBe(409);
  });

  it('rejects an invalid payload with 422', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');

    const response = await admin.post('/api/customers').send({ code: '', companyName: '' });
    expect(response.status).toBe(422);
  });

  it('updates fields, including toggling active, without requiring taxNumber', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const create = await admin.post('/api/customers').send({ code: 'CUST-002', companyName: 'No Tax Co' });
    expect(create.status).toBe(201);

    const update = await admin
      .patch(`/api/customers/${create.body.data.id}`)
      .send({ contactPerson: 'New Contact', active: false });

    expect(update.status).toBe(200);
    expect(update.body.data.contactPerson).toBe('New Contact');
    expect(update.body.data.active).toBe(false);
  });

  it('Section 17: only Admin/Finance Manager can delete, not Ops Manager', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    await createTestUser({ email: 'ops@test.com', password: 'password123', roleId: roles['Operations Manager']._id });
    await createTestUser({ email: 'finance@test.com', password: 'password123', roleId: roles['Finance Manager']._id });
    const admin = await loginAs('admin@test.com');
    const ops = await loginAs('ops@test.com');
    const finance = await loginAs('finance@test.com');

    const create = await admin.post('/api/customers').send(validPayload);
    const id = create.body.data.id;

    const opsDelete = await ops.delete(`/api/customers/${id}`);
    expect(opsDelete.status).toBe(403);

    const financeDelete = await finance.delete(`/api/customers/${id}`);
    expect(financeDelete.status).toBe(200);
  });

  it('FR-002 edge case: deactivation is blocked with a clear reason while a guard reports one active', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const create = await admin.post('/api/customers').send(validPayload);

    DEACTIVATION_GUARDS.push(async () => 'Customer has an outstanding positive balance');

    const response = await admin.delete(`/api/customers/${create.body.data.id}`);

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/outstanding positive balance/);
  });

  it('a deleted customer no longer appears in the default list', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const create = await admin.post('/api/customers').send(validPayload);

    await admin.delete(`/api/customers/${create.body.data.id}`);

    const list = await admin.get('/api/customers');
    expect(list.body.data).toHaveLength(0);
  });

  it('FR-003: supports search by company name, contact, and tax number, and filters by active', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    await admin.post('/api/customers').send(validPayload);
    const second = await admin.post('/api/customers').send({
      code: 'CUST-002',
      companyName: 'Beta Industries',
      contactPerson: 'John Smith',
      taxNumber: '987654321',
    });
    await admin.patch(`/api/customers/${second.body.data.id}`).send({ active: false });

    const bySearch = await admin.get('/api/customers').query({ search: 'Beta' });
    expect(bySearch.body.data).toHaveLength(1);
    expect(bySearch.body.data[0].code).toBe('CUST-002');

    const byTaxNumber = await admin.get('/api/customers').query({ search: '987654321' });
    expect(byTaxNumber.body.data).toHaveLength(1);

    const activeOnly = await admin.get('/api/customers').query({ active: 'true' });
    expect(activeOnly.body.data).toHaveLength(1);
    expect(activeOnly.body.data[0].code).toBe('CUST-001');

    const inactiveOnly = await admin.get('/api/customers').query({ active: 'false' });
    expect(inactiveOnly.body.data).toHaveLength(1);
    expect(inactiveOnly.body.data[0].code).toBe('CUST-002');
  });
});
