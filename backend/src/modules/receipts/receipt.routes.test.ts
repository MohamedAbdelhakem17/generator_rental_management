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

async function createCustomer(admin: ReturnType<typeof request.agent>) {
  const response = await admin.post('/api/customers').send({
    code: `CUST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    companyName: 'Receipt Customer',
  });
  return response.body.data.id as string;
}

describe('receipt routes (TASK-022, closed for TASK-033)', () => {
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
    const response = await request(app).get('/api/receipts');
    expect(response.status).toBe(401);
  });

  it('Section 17: View — Admin/Finance Mgr/Accountant/Ops Mgr/Viewer can view, Technician cannot', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'ops@test.com', password: 'password123', roleId: roles['Operations Manager']._id });
    await createTestUser({ email: 'tech@test.com', password: 'password123', roleId: roles.Technician._id });

    const ops = await loginAs('ops@test.com');
    expect((await ops.get('/api/receipts')).status).toBe(200);

    const tech = await loginAs('tech@test.com');
    expect((await tech.get('/api/receipts')).status).toBe(403);
  });

  it('Section 17: Create — Admin/Finance Mgr/Accountant only; Ops Manager is denied', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'finance@test.com', password: 'password123', roleId: roles['Finance Manager']._id });
    await createTestUser({ email: 'ops2@test.com', password: 'password123', roleId: roles['Operations Manager']._id });
    const finance = await loginAs('finance@test.com');
    const customerId = await createCustomer(finance);

    const created = await finance.post('/api/receipts').send({
      customerId,
      date: '2026-01-05',
      amount: 500,
      paymentMethod: 'Cash',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('Confirmed');

    const ops = await loginAs('ops2@test.com');
    const opsAttempt = await ops.post('/api/receipts').send({
      customerId,
      date: '2026-01-05',
      amount: 100,
      paymentMethod: 'Cash',
    });
    expect(opsAttempt.status).toBe(403);
  });

  it('Validation Rule: BankTransfer requires a transferNumber and an account', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'finance2@test.com', password: 'password123', roleId: roles['Finance Manager']._id });
    const finance = await loginAs('finance2@test.com');
    const customerId = await createCustomer(finance);

    const response = await finance.post('/api/receipts').send({
      customerId,
      date: '2026-01-05',
      amount: 500,
      paymentMethod: 'BankTransfer',
    });
    expect(response.status).toBe(422);
  });

  it('rejects a future date and a non-positive amount with 422', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'finance3@test.com', password: 'password123', roleId: roles['Finance Manager']._id });
    const finance = await loginAs('finance3@test.com');
    const customerId = await createCustomer(finance);

    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const future = await finance
      .post('/api/receipts')
      .send({ customerId, date: futureDate, amount: 100, paymentMethod: 'Cash' });
    expect(future.status).toBe(422);

    const zero = await finance
      .post('/api/receipts')
      .send({ customerId, date: '2026-01-05', amount: 0, paymentMethod: 'Cash' });
    expect(zero.status).toBe(422);
  });

  it('rejects fetching an unknown receipt with 404', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'finance4@test.com', password: 'password123', roleId: roles['Finance Manager']._id });
    const finance = await loginAs('finance4@test.com');

    const response = await finance.get('/api/receipts/65f000000000000000000000');
    expect(response.status).toBe(404);
  });

  it('Section 17: Cancel — Admin/Finance Mgr only; Accountant is denied with 403', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'finance5@test.com', password: 'password123', roleId: roles['Finance Manager']._id });
    await createTestUser({ email: 'accountant@test.com', password: 'password123', roleId: roles.Accountant._id });
    const finance = await loginAs('finance5@test.com');
    const customerId = await createCustomer(finance);

    const created = await finance
      .post('/api/receipts')
      .send({ customerId, date: '2026-01-05', amount: 500, paymentMethod: 'Cash' });
    const receiptId = created.body.data.id as string;

    const accountant = await loginAs('accountant@test.com');
    const accountantAttempt = await accountant
      .post(`/api/receipts/${receiptId}/cancel`)
      .send({ reason: 'Duplicate entry' });
    expect(accountantAttempt.status).toBe(403);

    const cancelled = await finance.post(`/api/receipts/${receiptId}/cancel`).send({ reason: 'Duplicate entry' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('Cancelled');
  });

  it('Validation Rule: cancel requires a reason', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'finance6@test.com', password: 'password123', roleId: roles['Finance Manager']._id });
    const finance = await loginAs('finance6@test.com');
    const customerId = await createCustomer(finance);

    const created = await finance
      .post('/api/receipts')
      .send({ customerId, date: '2026-01-05', amount: 500, paymentMethod: 'Cash' });

    const response = await finance.post(`/api/receipts/${created.body.data.id}/cancel`).send({});
    expect(response.status).toBe(422);
  });
});
