import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { createTestUser, resetTestDb, seedTestRoles, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { runContractExpiryJob } from './expire-contracts.job.js';

const app = createApp();
type Agent = ReturnType<typeof request.agent>;

/** Business Rule 6.1 treats "Active" as Rented only while today falls within the contract's
 * dates — tests that expect a Rented generator must use dates spanning the real current date. */
function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function loginAs(email: string, password = 'password123') {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password });
  return agent;
}

async function createCustomer(admin: Agent, overrides: Record<string, unknown> = {}) {
  const response = await admin.post('/api/customers').send({
    code: `CUST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    companyName: 'Acme Construction',
    ...overrides,
  });
  return response.body.data.id as string;
}

async function createProject(admin: Agent, customerId: string, overrides: Record<string, unknown> = {}) {
  const response = await admin.post('/api/projects').send({
    code: `PROJ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: 'Site A',
    customerId,
    startDate: '2026-01-01',
    ...overrides,
  });
  return response.body.data.id as string;
}

let generatorSeq = 0;

async function createGenerator(admin: Agent, overrides: Record<string, unknown> = {}) {
  generatorSeq += 1;
  const suffix = `${Date.now().toString(36)}${generatorSeq}`.slice(-10);
  const response = await admin.post('/api/generators').send({
    code: `GEN-${suffix}`,
    specifications: { kva: 500, brand: 'Cummins', model: 'C500D5', serialNumber: `SN-${suffix}` },
    normalFuelConsumption: 25,
    ...overrides,
  });
  return response.body.data.id as string;
}

interface ContractContext {
  admin: Agent;
  customerId: string;
  projectId: string;
  generatorId: string;
}

async function setupContext(): Promise<ContractContext> {
  const roles = await seedTestRoles();
  await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
  const admin = await loginAs('admin@test.com');
  const customerId = await createCustomer(admin);
  const projectId = await createProject(admin, customerId);
  const generatorId = await createGenerator(admin);
  return { admin, customerId, projectId, generatorId };
}

function draftPayload(ctx: Pick<ContractContext, 'customerId' | 'projectId' | 'generatorId'>, overrides: Record<string, unknown> = {}) {
  return {
    customerId: ctx.customerId,
    projectId: ctx.projectId,
    startDate: isoDate(-15),
    endDate: isoDate(15),
    rentalMethod: 'monthly',
    items: [{ generatorId: ctx.generatorId, unitPrice: 15000 }],
    ...overrides,
  };
}

describe('contract routes (TASK-012)', () => {
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
    const response = await request(app).get('/api/contracts');
    expect(response.status).toBe(401);
  });

  it('Section 17: Finance Manager/Accountant/Viewer can view but not create; Technician cannot even view', async () => {
    const ctx = await setupContext();
    const roles = await seedTestRoles();
    await createTestUser({ email: 'finance@test.com', password: 'password123', roleId: roles['Finance Manager']._id });
    await createTestUser({ email: 'tech@test.com', password: 'password123', roleId: roles.Technician._id });
    const finance = await loginAs('finance@test.com');
    const tech = await loginAs('tech@test.com');

    expect((await finance.get('/api/contracts')).status).toBe(200);
    expect((await tech.get('/api/contracts')).status).toBe(403);
    expect((await finance.post('/api/contracts').send(draftPayload(ctx))).status).toBe(403);
  });

  it('AC: creating a Draft with a unique auto-generated sequential number', async () => {
    const ctx = await setupContext();
    const create = await ctx.admin.post('/api/contracts').send(draftPayload(ctx));

    expect(create.status).toBe(201);
    expect(create.body.data.status).toBe('Draft');
    expect(create.body.data.number).toMatch(/^CN-\d{4}-0001$/);
    expect(create.body.data.customer.id).toBe(ctx.customerId);
    expect(create.body.data.project.id).toBe(ctx.projectId);

    const second = await ctx.admin.post('/api/contracts').send(draftPayload(ctx));
    expect(second.body.data.number).toMatch(/^CN-\d{4}-0002$/);
  });

  it('rejects a project that does not belong to the given customer with 422', async () => {
    const ctx = await setupContext();
    const otherCustomerId = await createCustomer(ctx.admin, { companyName: 'Other Co' });

    const response = await ctx.admin.post('/api/contracts').send(draftPayload(ctx, { customerId: otherCustomerId }));
    expect(response.status).toBe(422);
  });

  it('Edge Case: rejects a duplicate generator within the same Draft contract with 422', async () => {
    const ctx = await setupContext();
    const response = await ctx.admin.post('/api/contracts').send(
      draftPayload(ctx, {
        items: [
          { generatorId: ctx.generatorId, unitPrice: 15000 },
          { generatorId: ctx.generatorId, unitPrice: 12000 },
        ],
      }),
    );
    expect(response.status).toBe(422);
  });

  it('rejects endDate before startDate, and unitPrice <= 0, with 422', async () => {
    const ctx = await setupContext();
    const badDates = await ctx.admin.post('/api/contracts').send(draftPayload(ctx, { endDate: '2025-12-01' }));
    expect(badDates.status).toBe(422);

    const badPrice = await ctx.admin
      .post('/api/contracts')
      .send(draftPayload(ctx, { items: [{ generatorId: ctx.generatorId, unitPrice: 0 }] }));
    expect(badPrice.status).toBe(422);
  });

  it('FR-002: a Draft contract can freely edit dates and replace items; a non-Draft contract cannot be edited', async () => {
    const ctx = await setupContext();
    const create = await ctx.admin.post('/api/contracts').send(draftPayload(ctx));
    const id = create.body.data.id;
    const otherGenerator = await createGenerator(ctx.admin);

    const newEndDate = isoDate(45);
    const update = await ctx.admin
      .patch(`/api/contracts/${id}`)
      .send({ endDate: newEndDate, items: [{ generatorId: otherGenerator, unitPrice: 9000 }] });
    expect(update.status).toBe(200);
    expect(update.body.data.endDate).toContain(newEndDate);

    const detail = await ctx.admin.get(`/api/contracts/${id}`);
    expect(detail.body.data.items).toHaveLength(1);
    expect(detail.body.data.items[0].generatorId).toBe(otherGenerator);

    await ctx.admin.post(`/api/contracts/${id}/activate`);
    const editAfterActivate = await ctx.admin.patch(`/api/contracts/${id}`).send({ endDate: '2026-03-31' });
    expect(editAfterActivate.status).toBe(409);
  });

  it('AC: activating a Draft with a non-conflicting generator flips it to Active and the generator to Rented', async () => {
    const ctx = await setupContext();
    const create = await ctx.admin.post('/api/contracts').send(draftPayload(ctx));
    const id = create.body.data.id;

    const activate = await ctx.admin.post(`/api/contracts/${id}/activate`);
    expect(activate.status).toBe(200);
    expect(activate.body.data.status).toBe('Active');
    expect(activate.body.data.items).toBeUndefined();

    const detail = await ctx.admin.get(`/api/contracts/${id}`);
    expect(detail.body.data.items[0].priceSnapshot).toBe('15000.00');

    const generator = await ctx.admin.get(`/api/generators/${ctx.generatorId}`);
    expect(generator.body.data.status).toBe('Rented');
    expect(generator.body.data.commercialStatus).toBe('Assigned');
  });

  it('rejects activating a Draft with zero items with 422', async () => {
    const ctx = await setupContext();
    const create = await ctx.admin.post('/api/contracts').send(draftPayload(ctx, { items: [] }));

    const activate = await ctx.admin.post(`/api/contracts/${create.body.data.id}/activate`);
    expect(activate.status).toBe(422);
  });

  it('AC: activation is blocked when the generator is already Active on an overlapping contract, naming that contract', async () => {
    const ctx = await setupContext();
    const first = await ctx.admin
      .post('/api/contracts')
      .send(draftPayload(ctx, { startDate: '2026-01-01', endDate: '2026-01-31' }));
    await ctx.admin.post(`/api/contracts/${first.body.data.id}/activate`);

    const second = await ctx.admin
      .post('/api/contracts')
      .send(draftPayload(ctx, { startDate: '2026-01-15', endDate: '2026-02-15' }));
    const activateSecond = await ctx.admin.post(`/api/contracts/${second.body.data.id}/activate`);

    expect(activateSecond.status).toBe(409);
    expect(activateSecond.body.message).toBe('Conflicting generator assignment');
    expect(activateSecond.body.errors[0].message).toContain(first.body.data.number);
  });

  it('a non-overlapping (back-to-back after end) contract for the same generator activates without conflict', async () => {
    const ctx = await setupContext();
    const first = await ctx.admin
      .post('/api/contracts')
      .send(draftPayload(ctx, { startDate: '2026-01-01', endDate: '2026-01-31' }));
    await ctx.admin.post(`/api/contracts/${first.body.data.id}/activate`);

    const second = await ctx.admin
      .post('/api/contracts')
      .send(draftPayload(ctx, { startDate: '2026-02-01', endDate: '2026-02-28' }));
    const activateSecond = await ctx.admin.post(`/api/contracts/${second.body.data.id}/activate`);

    expect(activateSecond.status).toBe(200);
  });

  it('FR-005: cancelling requires a reason, is allowed from Draft or Active, and recalculates status only when it was Active', async () => {
    const ctx = await setupContext();
    const draftContract = await ctx.admin.post('/api/contracts').send(draftPayload(ctx));
    const missingReason = await ctx.admin.post(`/api/contracts/${draftContract.body.data.id}/cancel`).send({});
    expect(missingReason.status).toBe(422);

    const cancelDraft = await ctx.admin
      .post(`/api/contracts/${draftContract.body.data.id}/cancel`)
      .send({ reason: 'No longer needed' });
    expect(cancelDraft.status).toBe(200);
    expect(cancelDraft.body.data.status).toBe('Cancelled');
    expect(cancelDraft.body.data.cancelReason).toBe('No longer needed');

    const recancel = await ctx.admin
      .post(`/api/contracts/${draftContract.body.data.id}/cancel`)
      .send({ reason: 'Again' });
    expect(recancel.status).toBe(409);

    const activeContract = await ctx.admin.post('/api/contracts').send(draftPayload(ctx));
    await ctx.admin.post(`/api/contracts/${activeContract.body.data.id}/activate`);
    const cancelActive = await ctx.admin
      .post(`/api/contracts/${activeContract.body.data.id}/cancel`)
      .send({ reason: 'Customer requested early termination' });
    expect(cancelActive.status).toBe(200);

    const generator = await ctx.admin.get(`/api/generators/${ctx.generatorId}`);
    expect(generator.body.data.status).toBe('Available');
  });

  it('FR-006: the expiry job transitions an Active contract past its endDate to Expired and recalculates status', async () => {
    const ctx = await setupContext();
    const create = await ctx.admin
      .post('/api/contracts')
      .send(draftPayload(ctx, { startDate: '2020-01-01', endDate: '2020-01-31' }));
    await ctx.admin.post(`/api/contracts/${create.body.data.id}/activate`);

    const result = await runContractExpiryJob();
    expect(result.expired).toBe(1);

    const detail = await ctx.admin.get(`/api/contracts/${create.body.data.id}`);
    expect(detail.body.data.status).toBe('Expired');

    const generator = await ctx.admin.get(`/api/generators/${ctx.generatorId}`);
    expect(generator.body.data.status).toBe('Available');
  });

  it('integration: an active contract blocks Generator/Customer deactivation and Project close', async () => {
    const ctx = await setupContext();
    const create = await ctx.admin.post('/api/contracts').send(draftPayload(ctx));
    await ctx.admin.post(`/api/contracts/${create.body.data.id}/activate`);

    const generatorDelete = await ctx.admin.delete(`/api/generators/${ctx.generatorId}`);
    expect(generatorDelete.status).toBe(409);
    expect(generatorDelete.body.message).toMatch(/active rental contract/);

    const customerDelete = await ctx.admin.delete(`/api/customers/${ctx.customerId}`);
    expect(customerDelete.status).toBe(409);
    expect(customerDelete.body.message).toMatch(/active rental contract/);

    const projectClose = await ctx.admin.delete(`/api/projects/${ctx.projectId}`);
    expect(projectClose.status).toBe(409);
    expect(projectClose.body.message).toMatch(/active contract/);
  });

  it("integration: the project profile's assigned generators reflect an active contract's items", async () => {
    const ctx = await setupContext();
    const create = await ctx.admin.post('/api/contracts').send(draftPayload(ctx));
    await ctx.admin.post(`/api/contracts/${create.body.data.id}/activate`);

    const project = await ctx.admin.get(`/api/projects/${ctx.projectId}`);
    expect(project.body.data.assignedGenerators).toEqual([{ generatorId: ctx.generatorId, code: expect.any(String), status: 'Rented' }]);
  });

  it('FR-003: filters by customerId, projectId, and status', async () => {
    const ctx = await setupContext();
    const otherCustomerId = await createCustomer(ctx.admin, { companyName: 'Other Co' });
    const otherProjectId = await createProject(ctx.admin, otherCustomerId);
    const otherGenerator = await createGenerator(ctx.admin);

    const mine = await ctx.admin.post('/api/contracts').send(draftPayload(ctx));
    await ctx.admin.post(`/api/contracts/${mine.body.data.id}/activate`);
    await ctx.admin.post('/api/contracts').send(
      draftPayload(
        { customerId: otherCustomerId, projectId: otherProjectId, generatorId: otherGenerator },
        {},
      ),
    );

    const byCustomer = await ctx.admin.get('/api/contracts').query({ customerId: ctx.customerId });
    expect(byCustomer.body.data).toHaveLength(1);
    expect(byCustomer.body.data[0].itemCount).toBe(1);

    const byStatus = await ctx.admin.get('/api/contracts').query({ status: 'Draft' });
    expect(byStatus.body.data).toHaveLength(1);
    expect(byStatus.body.data[0].customer.id).toBe(otherCustomerId);
  });
});
