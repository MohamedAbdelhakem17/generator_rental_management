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

async function createCustomer(admin: Agent) {
  const response = await admin.post('/api/customers').send({
    code: `CUST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    companyName: 'Acme Construction',
  });
  return response.body.data.id as string;
}

async function createProject(admin: Agent, customerId: string) {
  const response = await admin.post('/api/projects').send({
    code: `PROJ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: 'Site A',
    customerId,
    startDate: '2026-01-01',
  });
  return response.body.data.id as string;
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

async function createActiveContract(admin: Agent, customerId: string, projectId: string, generatorId: string) {
  const create = await admin.post('/api/contracts').send({
    customerId,
    projectId,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    rentalMethod: 'monthly',
    items: [{ generatorId, unitPrice: 15000 }],
  });
  await admin.post(`/api/contracts/${create.body.data.id}/activate`);
  return create.body.data.id as string;
}

interface Context {
  admin: Agent;
  customerId: string;
  projectId: string;
  contractId: string;
}

async function setupContext(): Promise<Context> {
  await seedTestSettings();
  const roles = await seedTestRoles();
  await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
  const admin = await loginAs('admin@test.com');
  const customerId = await createCustomer(admin);
  const projectId = await createProject(admin, customerId);
  const generatorId = await createGenerator(admin);
  const contractId = await createActiveContract(admin, customerId, projectId, generatorId);
  return { admin, customerId, projectId, contractId };
}

function draftPayload(ctx: Pick<Context, 'customerId' | 'projectId' | 'contractId'>, overrides: Record<string, unknown> = {}) {
  return {
    customerId: ctx.customerId,
    projectId: ctx.projectId,
    contractIds: [ctx.contractId],
    period: { start: '2026-01-01', end: '2026-01-31' },
    lineItems: [],
    ...overrides,
  };
}

describe('extract routes (TASK-020)', () => {
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
    const response = await request(app).get('/api/extracts');
    expect(response.status).toBe(401);
  });

  it('Section 17: Operations Manager/Viewer can view but not create; Technician has no access at all', async () => {
    const ctx = await setupContext();
    const roles = await seedTestRoles();

    for (const [email, roleName] of [
      ['ops@test.com', 'Operations Manager'],
      ['viewer@test.com', 'Viewer'],
    ] as const) {
      await createTestUser({ email, password: 'password123', roleId: roles[roleName]._id });
      const agent = await loginAs(email);
      expect((await agent.get('/api/extracts')).status).toBe(200);
      expect((await agent.post('/api/extracts').send(draftPayload(ctx))).status).toBe(403);
    }

    await createTestUser({ email: 'tech@test.com', password: 'password123', roleId: roles.Technician._id });
    const tech = await loginAs('tech@test.com');
    expect((await tech.get('/api/extracts')).status).toBe(403);
  });

  it('Section 17: Accountant can create but not approve/cancel', async () => {
    const ctx = await setupContext();
    const roles = await seedTestRoles();
    await createTestUser({ email: 'acct@test.com', password: 'password123', roleId: roles.Accountant._id });
    const accountant = await loginAs('acct@test.com');

    const create = await accountant.post('/api/extracts').send(draftPayload(ctx));
    expect(create.status).toBe(201);

    const id = create.body.data.id;
    await accountant.patch(`/api/extracts/${id}`).send({ lineItems: [{ type: 'rent', description: 'Rent', amount: 1000 }] });
    await accountant.post(`/api/extracts/${id}/submit-review`);

    const approve = await accountant.post(`/api/extracts/${id}/approve`);
    expect(approve.status).toBe(403);

    const cancel = await accountant.post(`/api/extracts/${id}/cancel`).send({ reason: 'test' });
    expect(cancel.status).toBe(403);
  });

  it('AC/DoD: full lifecycle create -> approve -> verify locked, matching Business Rule 6.7 verbatim', async () => {
    const ctx = await setupContext();

    const create = await ctx.admin.post('/api/extracts').send(
      draftPayload(ctx, {
        lineItems: [
          { type: 'rent', description: 'Rent', amount: 100000 },
          { type: 'transport', description: 'Transport', amount: 10000 },
          { type: 'services', description: 'Services', amount: 5000 },
        ],
        discounts: 15000,
      }),
    );
    expect(create.status).toBe(201);
    expect(create.body.data.status).toBe('Draft');
    // Live preview before approval, VAT-inclusive.
    expect(create.body.data.finalTotal).toBe('114000.00');

    const id = create.body.data.id;
    const review = await ctx.admin.post(`/api/extracts/${id}/submit-review`);
    expect(review.status).toBe(200);
    expect(review.body.data.status).toBe('Under Review');

    const approve = await ctx.admin.post(`/api/extracts/${id}/approve`);
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('Approved');
    expect(approve.body.data.vatRateSnapshot).toBe(0.14);
    expect(approve.body.data.vat).toBe('14000.00');
    expect(approve.body.data.finalTotal).toBe('114000.00');
    expect(approve.body.data.customerNameSnapshot).toBe('Acme Construction');

    const editLocked = await ctx.admin.patch(`/api/extracts/${id}`).send({ discounts: 0 });
    expect(editLocked.status).toBe(409);
    expect(editLocked.body.message).toMatch(/cancel and reissue/i);
  });

  it('Section 19: discounts exceeding total work rejected with 422; approve with zero line items rejected with 409', async () => {
    const ctx = await setupContext();

    const badDiscount = await ctx.admin.post('/api/extracts').send(
      draftPayload(ctx, {
        lineItems: [{ type: 'rent', description: 'Rent', amount: 1000 }],
        discounts: 1000.01,
      }),
    );
    expect(badDiscount.status).toBe(422);

    const empty = await ctx.admin.post('/api/extracts').send(draftPayload(ctx, { lineItems: [] }));
    const emptyId = empty.body.data.id;
    await ctx.admin.patch(`/api/extracts/${emptyId}`).send({});
    const submitEmpty = await ctx.admin.post(`/api/extracts/${emptyId}/submit-review`);
    expect(submitEmpty.status).toBe(409);
  });

  it('POST /api/extracts/preview-totals matches Business Rule 6.7 verbatim', async () => {
    const ctx = await setupContext();

    const preview = await ctx.admin.post('/api/extracts/preview-totals').send({
      rent: 100000,
      transport: 10000,
      services: 5000,
      discounts: 15000,
    });

    expect(preview.status).toBe(200);
    expect(preview.body.data.totalWork).toBe('115000.00');
    expect(preview.body.data.netBeforeVat).toBe('100000.00');
    expect(preview.body.data.vat).toBe('14000.00');
    expect(preview.body.data.finalTotal).toBe('114000.00');
    expect(preview.body.data.vatRateUsed).toBe(0.14);
  });
});
