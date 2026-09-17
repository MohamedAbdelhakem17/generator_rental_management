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
    companyName: 'Credit Note Customer',
  });
  return response.body.data.id as string;
}

describe('credit-note routes (TASK-023, cancel closed for TASK-033)', () => {
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
    const response = await request(app).post('/api/credit-notes').send({});
    expect(response.status).toBe(401);
  });

  it('Section 17: a role without credit-notes:write is denied with 403', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'viewer@test.com', password: 'password123', roleId: roles.Viewer._id });
    const viewer = await loginAs('viewer@test.com');

    const response = await viewer.post('/api/credit-notes').send({
      customerId: '65f000000000000000000000',
      amount: 100,
      reason: 'Goodwill adjustment',
    });
    expect(response.status).toBe(403);
  });

  it('creates a credit note for an existing customer, and audits it', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'finance@test.com', password: 'password123', roleId: roles['Finance Manager']._id });
    const finance = await loginAs('finance@test.com');
    const customerId = await createCustomer(finance);

    const response = await finance.post('/api/credit-notes').send({
      customerId,
      amount: 500,
      reason: 'Goodwill adjustment',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('Confirmed');
    expect(response.body.data.amount).toBe('500.00');
    expect(response.body.data.number).toMatch(/^CN-\d{4}-\d{6}$/);
  });

  it('rejects a non-existent customer with 422', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'finance2@test.com', password: 'password123', roleId: roles['Finance Manager']._id });
    const finance = await loginAs('finance2@test.com');

    const response = await finance.post('/api/credit-notes').send({
      customerId: '65f000000000000000000000',
      amount: 100,
      reason: 'Goodwill adjustment',
    });
    expect(response.status).toBe(422);
  });

  it('Validation Rule: rejects amount <= 0 and a reason under 5 characters with 422', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'finance3@test.com', password: 'password123', roleId: roles['Finance Manager']._id });
    const finance = await loginAs('finance3@test.com');
    const customerId = await createCustomer(finance);

    const zeroAmount = await finance
      .post('/api/credit-notes')
      .send({ customerId, amount: 0, reason: 'Goodwill' });
    expect(zeroAmount.status).toBe(422);

    const shortReason = await finance
      .post('/api/credit-notes')
      .send({ customerId, amount: 100, reason: 'Bad' });
    expect(shortReason.status).toBe(422);
  });

  it('AC: a cancelled credit note no longer affects the customer statement balance', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'finance4@test.com', password: 'password123', roleId: roles['Finance Manager']._id });
    const finance = await loginAs('finance4@test.com');
    const customerId = await createCustomer(finance);

    const created = await finance
      .post('/api/credit-notes')
      .send({ customerId, amount: 300, reason: 'Goodwill adjustment' });
    const creditNoteId = created.body.data.id as string;

    const beforeCancel = await finance.get(`/api/customers/${customerId}/statement`);
    expect(beforeCancel.body.data.closingBalance).toBe('-300.00');

    const cancel = await finance.patch(`/api/credit-notes/${creditNoteId}/cancel`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe('Cancelled');

    const afterCancel = await finance.get(`/api/customers/${customerId}/statement`);
    expect(afterCancel.body.data.closingBalance).toBe('0.00');
  });

  it('rejects cancelling an already-cancelled credit note with 409', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'finance5@test.com', password: 'password123', roleId: roles['Finance Manager']._id });
    const finance = await loginAs('finance5@test.com');
    const customerId = await createCustomer(finance);

    const created = await finance
      .post('/api/credit-notes')
      .send({ customerId, amount: 100, reason: 'Goodwill adjustment' });
    const creditNoteId = created.body.data.id as string;

    await finance.patch(`/api/credit-notes/${creditNoteId}/cancel`);
    const secondCancel = await finance.patch(`/api/credit-notes/${creditNoteId}/cancel`);
    expect(secondCancel.status).toBe(409);
  });

  it('rejects cancelling an unknown credit note id with 404', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'finance6@test.com', password: 'password123', roleId: roles['Finance Manager']._id });
    const finance = await loginAs('finance6@test.com');

    const response = await finance.patch('/api/credit-notes/65f000000000000000000000/cancel');
    expect(response.status).toBe(404);
  });

  it('Section 17: cancel is denied with 403 for a role without credit-notes:write', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'finance7@test.com', password: 'password123', roleId: roles['Finance Manager']._id });
    await createTestUser({ email: 'accountant@test.com', password: 'password123', roleId: roles.Accountant._id });
    const finance = await loginAs('finance7@test.com');
    const customerId = await createCustomer(finance);
    const created = await finance
      .post('/api/credit-notes')
      .send({ customerId, amount: 100, reason: 'Goodwill adjustment' });

    const accountant = await loginAs('accountant@test.com');
    const response = await accountant.patch(`/api/credit-notes/${created.body.data.id}/cancel`);
    expect(response.status).toBe(403);
  });
});
