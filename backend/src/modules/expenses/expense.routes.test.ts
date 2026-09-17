import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import {
  createTestUser,
  resetTestDb,
  seedTestRoles,
  seedTestSettings,
  startTestDb,
  stopTestDb,
} from '../../test/authFixtures.js';

const app = createApp();

async function loginAs(email: string, password = 'password123') {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password });
  return agent;
}

describe('expense routes (TASK-024, closed for TASK-033)', () => {
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
    const response = await request(app).get('/api/expenses');
    expect(response.status).toBe(401);
  });

  it('Section 17: Viewer can view but not create; Ops Manager can now also view (permission-matrix fix)', async () => {
    await seedTestSettings();
    const roles = await seedTestRoles();
    await createTestUser({ email: 'viewer@test.com', password: 'password123', roleId: roles.Viewer._id });
    await createTestUser({ email: 'ops@test.com', password: 'password123', roleId: roles['Operations Manager']._id });

    const viewer = await loginAs('viewer@test.com');
    const viewerRead = await viewer.get('/api/expenses');
    expect(viewerRead.status).toBe(200);
    const viewerWrite = await viewer
      .post('/api/expenses')
      .send({ category: 'Transport', date: '2026-01-01', amount: 100 });
    expect(viewerWrite.status).toBe(403);

    const ops = await loginAs('ops@test.com');
    const opsRead = await ops.get('/api/expenses');
    expect(opsRead.status).toBe(200);
    const opsWrite = await ops
      .post('/api/expenses')
      .send({ category: 'Transport', date: '2026-01-01', amount: 100 });
    expect(opsWrite.status).toBe(403);
  });

  it('creates an expense with a category from the configured System Settings list', async () => {
    await seedTestSettings();
    const roles = await seedTestRoles();
    await createTestUser({ email: 'accountant@test.com', password: 'password123', roleId: roles.Accountant._id });
    const accountant = await loginAs('accountant@test.com');

    const response = await accountant
      .post('/api/expenses')
      .send({ category: 'Office', date: '2026-01-05', amount: 250, description: 'Supplies' });

    expect(response.status).toBe(201);
    expect(response.body.data.category).toBe('Office');
    expect(response.body.data.amount).toBe('250.00');
  });

  it('FR-001 (TASK-030): rejects a category not in the configured expenseCategories list with 422', async () => {
    await seedTestSettings();
    const roles = await seedTestRoles();
    await createTestUser({ email: 'accountant2@test.com', password: 'password123', roleId: roles.Accountant._id });
    const accountant = await loginAs('accountant2@test.com');

    const response = await accountant
      .post('/api/expenses')
      .send({ category: 'NotARealCategory', date: '2026-01-05', amount: 100 });
    expect(response.status).toBe(422);
  });

  it('Validation Rule: rejects a future date and a non-positive amount with 422', async () => {
    await seedTestSettings();
    const roles = await seedTestRoles();
    await createTestUser({ email: 'accountant3@test.com', password: 'password123', roleId: roles.Accountant._id });
    const accountant = await loginAs('accountant3@test.com');

    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const future = await accountant
      .post('/api/expenses')
      .send({ category: 'Office', date: futureDate, amount: 100 });
    expect(future.status).toBe(422);

    const zeroAmount = await accountant
      .post('/api/expenses')
      .send({ category: 'Office', date: '2026-01-01', amount: 0 });
    expect(zeroAmount.status).toBe(422);
  });

  it('rejects fetching or updating an unknown expense with 404', async () => {
    await seedTestSettings();
    const roles = await seedTestRoles();
    await createTestUser({ email: 'accountant4@test.com', password: 'password123', roleId: roles.Accountant._id });
    const accountant = await loginAs('accountant4@test.com');

    const get = await accountant.get('/api/expenses/65f000000000000000000000');
    expect(get.status).toBe(404);

    const patch = await accountant
      .patch('/api/expenses/65f000000000000000000000')
      .send({ amount: 50 });
    expect(patch.status).toBe(404);
  });

  it('AC/Section 17: Allocate is Admin/Finance Manager only — Accountant is denied with 403', async () => {
    await seedTestSettings();
    const roles = await seedTestRoles();
    await createTestUser({ email: 'accountant5@test.com', password: 'password123', roleId: roles.Accountant._id });
    const accountant = await loginAs('accountant5@test.com');

    const created = await accountant
      .post('/api/expenses')
      .send({ category: 'Bulk', date: '2026-01-01', amount: 1000 });
    const expenseId = created.body.data.id as string;

    const allocateAttempt = await accountant.post(`/api/expenses/${expenseId}/allocate`).send({
      splits: [{ generatorId: '65f000000000000000000000', percentage: 100 }],
    });
    expect(allocateAttempt.status).toBe(403);
  });

  it('FR-003: allocation splits not summing to 100% are rejected with 422', async () => {
    await seedTestSettings();
    const roles = await seedTestRoles();
    await createTestUser({ email: 'finance@test.com', password: 'password123', roleId: roles['Finance Manager']._id });
    const finance = await loginAs('finance@test.com');

    const created = await finance
      .post('/api/expenses')
      .send({ category: 'Bulk', date: '2026-01-01', amount: 1000 });
    const expenseId = created.body.data.id as string;

    const response = await finance.post(`/api/expenses/${expenseId}/allocate`).send({
      splits: [{ generatorId: '65f000000000000000000000', percentage: 60 }],
    });
    expect(response.status).toBe(422);
  });

  it('Edge Case: an already-allocated expense cannot be edited (409)', async () => {
    await seedTestSettings();
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    await createTestUser({ email: 'finance2@test.com', password: 'password123', roleId: roles['Finance Manager']._id });
    const admin = await loginAs('admin@test.com');
    const finance = await loginAs('finance2@test.com');

    const generatorRes = await admin.post('/api/generators').send({
      code: 'GEN-EXP-1',
      specifications: { kva: 100, brand: 'CAT', model: '400', serialNumber: 'SN-EXP-1' },
      normalFuelConsumption: 5,
    });
    const generatorId = generatorRes.body.data.id as string;

    const created = await finance
      .post('/api/expenses')
      .send({ category: 'Bulk', date: '2026-01-01', amount: 1000 });
    const expenseId = created.body.data.id as string;

    const allocate = await finance
      .post(`/api/expenses/${expenseId}/allocate`)
      .send({ splits: [{ generatorId, percentage: 100 }] });
    expect(allocate.status).toBe(200);

    const editAttempt = await finance.patch(`/api/expenses/${expenseId}`).send({ amount: 500 });
    expect(editAttempt.status).toBe(409);
  });
});
