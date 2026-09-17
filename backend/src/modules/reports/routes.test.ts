import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { createTestUser, resetTestDb, seedTestRoles, startTestDb, stopTestDb } from '../../test/authFixtures.js';

const app = createApp();

async function loginAs(email: string, password = 'password123') {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password });
  return agent;
}

/** TASK-033: reports/service.test.ts only exercises the query logic — permission enforcement
 * lives entirely in the route middleware and was never checked at the HTTP layer. This closes
 * that gap for Section 25's own acceptance criterion. */
describe('reports routes (TASK-028, permission layer closed for TASK-033)', () => {
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
    const response = await request(app).get('/api/reports/revenue');
    expect(response.status).toBe(401);
  });

  it('AC (Section 25): a Viewer is denied the Profitability report with 403', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'viewer@test.com', password: 'password123', roleId: roles.Viewer._id });
    const viewer = await loginAs('viewer@test.com');

    const response = await viewer.get('/api/reports/profitability');
    expect(response.status).toBe(403);
  });

  it('Section 6 matrix: Fuel Consumption/Maintenance reports are Admin/Ops Manager only — Finance Manager is denied', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'finance@test.com', password: 'password123', roleId: roles['Finance Manager']._id });
    const finance = await loginAs('finance@test.com');

    expect((await finance.get('/api/reports/fuel-consumption')).status).toBe(403);
    expect((await finance.get('/api/reports/maintenance')).status).toBe(403);
  });

  it('Section 6 matrix: Customer Statement/Uncollected Extracts are Admin/Finance Mgr/Accountant — Ops Manager is denied', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'ops@test.com', password: 'password123', roleId: roles['Operations Manager']._id });
    const ops = await loginAs('ops@test.com');

    expect((await ops.get('/api/reports/customer-statement')).status).toBe(403);
    expect((await ops.get('/api/reports/uncollected-extracts')).status).toBe(403);
  });

  it('Section 6 matrix: Operations report is available to Admin/Finance Mgr/Ops Mgr/Accountant', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'accountant@test.com', password: 'password123', roleId: roles.Accountant._id });
    const accountant = await loginAs('accountant@test.com');

    const response = await accountant.get('/api/reports/operations');
    expect(response.status).toBe(200);
  });

  it('Validation Rule: customer-statement without a customerId is rejected with 422', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');

    const response = await admin.get('/api/reports/customer-statement');
    expect(response.status).toBe(422);
  });
});
