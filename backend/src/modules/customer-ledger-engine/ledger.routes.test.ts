import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import {
  createTestUser,
  resetTestDb,
  seedTestRoles,
  startTestDb,
  stopTestDb,
} from '../../test/authFixtures.js';

const app = createApp();
type Agent = ReturnType<typeof request.agent>;

async function loginAs(email: string, password = 'password123') {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password });
  return agent;
}

async function createCustomer(admin: Agent) {
  const response = await admin.post('/api/customers').send({
    code: `CUST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    companyName: 'Acme Construction',
  });
  return response.body.data.id as string;
}

describe('customer ledger routes (TASK-023/TASK-033 coverage)', () => {
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
    const response = await request(app).get('/api/customers/000000000000000000000001/balance');
    expect(response.status).toBe(401);
  });

  it('Section 17: Admin/Ops Manager/Finance Manager/Accountant/Viewer can read balance and statement', async () => {
    // Five sequential bcrypt logins in one test regularly exceed the default 5s timeout.
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const customerId = await createCustomer(admin);

    const permittedRoles: Array<[string, string]> = [
      ['ops@test.com', 'Operations Manager'],
      ['finance@test.com', 'Finance Manager'],
      ['acct@test.com', 'Accountant'],
      ['viewer@test.com', 'Viewer'],
    ];

    for (const [email, roleName] of permittedRoles) {
      await createTestUser({ email, password: 'password123', roleId: roles[roleName as keyof typeof roles]._id });
      const agent = await loginAs(email);

      const balance = await agent.get(`/api/customers/${customerId}/balance`);
      expect(balance.status, `${roleName} balance`).toBe(200);

      const statement = await agent.get(`/api/customers/${customerId}/statement`);
      expect(statement.status, `${roleName} statement`).toBe(200);
    }
  }, 15_000);

  it('Section 17: Technician is denied balance and statement access (no customers:read)', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const customerId = await createCustomer(admin);

    await createTestUser({ email: 'tech@test.com', password: 'password123', roleId: roles.Technician._id });
    const tech = await loginAs('tech@test.com');

    expect((await tech.get(`/api/customers/${customerId}/balance`)).status).toBe(403);
    expect((await tech.get(`/api/customers/${customerId}/statement`)).status).toBe(403);
  });

  it('404s balance/statement for a nonexistent customer id', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');

    const missingId = '000000000000000000000099';
    expect((await admin.get(`/api/customers/${missingId}/balance`)).status).toBe(404);
    expect((await admin.get(`/api/customers/${missingId}/statement`)).status).toBe(404);
  });

  it('422s on an invalid ObjectId in the URL param', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');

    expect((await admin.get('/api/customers/not-an-id/balance')).status).toBe(422);
    expect((await admin.get('/api/customers/not-an-id/statement')).status).toBe(422);
  });

  it('422s on an invalid date range for the statement filter', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const customerId = await createCustomer(admin);

    const response = await admin
      .get(`/api/customers/${customerId}/statement`)
      .query({ from: 'not-a-date', to: 'also-not-a-date' });
    expect(response.status).toBe(422);
  });

  it('applies a valid date-range filter to the statement', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const customerId = await createCustomer(admin);

    const response = await admin
      .get(`/api/customers/${customerId}/statement`)
      .query({ from: '2026-01-01', to: '2026-12-31' });
    expect(response.status).toBe(200);
  });
});
