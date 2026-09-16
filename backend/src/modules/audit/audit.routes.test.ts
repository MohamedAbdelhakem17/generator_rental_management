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
import { AuditLogModel } from './audit.model.js';

const app = createApp();

async function loginAs(email: string, password = 'password123') {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password });
  return agent;
}

describe('audit-log routes (TASK-031)', () => {
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
    const response = await request(app).get('/api/audit-logs');
    expect(response.status).toBe(401);
  });

  it('AC: a non-Admin user is denied with 403', async () => {
    const roles = await seedTestRoles();
    await createTestUser({
      email: 'finance@test.com',
      password: 'password123',
      roleId: roles['Finance Manager']._id,
    });

    const finance = await loginAs('finance@test.com');
    const response = await finance.get('/api/audit-logs');
    expect(response.status).toBe(403);
  });

  it('FR-003: the audit log is append-only — no PATCH/DELETE route exists', async () => {
    const roles = await seedTestRoles();
    await createTestUser({
      email: 'admin@test.com',
      password: 'password123',
      roleId: roles['System Admin']._id,
    });

    const admin = await loginAs('admin@test.com');
    const entry = await AuditLogModel.create({ action: 'test.action', entityType: 'Test', entityId: 'x' });

    const patch = await admin.patch(`/api/audit-logs/${entry._id}`).send({ action: 'changed' });
    expect([404, 405]).toContain(patch.status);

    const del = await admin.delete(`/api/audit-logs/${entry._id}`);
    expect([404, 405]).toContain(del.status);
  });

  it('lets an Admin list and filter audit entries, with actor name resolved', async () => {
    const roles = await seedTestRoles();
    const admin = await createTestUser({
      email: 'admin2@test.com',
      password: 'password123',
      roleId: roles['System Admin']._id,
    });

    await AuditLogModel.create({
      action: 'generator.create',
      actorUserId: admin._id,
      entityType: 'Generator',
      entityId: 'gen-1',
      after: { code: 'GEN-001' },
    });
    await AuditLogModel.create({
      action: 'customer.create',
      entityType: 'Customer',
      entityId: 'cust-1',
    });

    const session = await loginAs('admin2@test.com');
    const response = await session.get('/api/audit-logs').query({ action: 'generator.create' });
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].action).toBe('generator.create');
    expect(response.body.data[0].actorName).toBe('Test User');
  });

  it('AC: an Extract approval produces an audit entry with the correct before/after status diff', async () => {
    await seedTestSettings();
    const roles = await seedTestRoles();
    await createTestUser({
      email: 'admin3@test.com',
      password: 'password123',
      roleId: roles['System Admin']._id,
    });
    const admin = await loginAs('admin3@test.com');

    const customerRes = await admin
      .post('/api/customers')
      .send({ code: 'C-AUD-1', companyName: 'Audit Customer' });
    const customerId = customerRes.body.data.id as string;

    const projectRes = await admin.post('/api/projects').send({
      code: 'PRJ-AUD-1',
      name: 'Audit Project',
      customerId,
      startDate: '2026-01-01',
    });
    const projectId = projectRes.body.data.id as string;

    const generatorRes = await admin.post('/api/generators').send({
      code: 'GEN-AUD-1',
      specifications: { kva: 100, brand: 'CAT', model: '400', serialNumber: 'SN-AUD-1' },
      normalFuelConsumption: 5,
    });
    const generatorId = generatorRes.body.data.id as string;

    const contractRes = await admin.post('/api/contracts').send({
      customerId,
      projectId,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      rentalMethod: 'monthly',
      items: [{ generatorId, unitPrice: 15000 }],
    });
    const contractId = contractRes.body.data.id as string;
    await admin.post(`/api/contracts/${contractId}/activate`);

    const extractRes = await admin.post('/api/extracts').send({
      customerId,
      projectId,
      contractIds: [contractId],
      period: { start: '2026-01-01', end: '2026-01-31' },
      lineItems: [{ type: 'rent', description: 'Monthly rent', amount: '1000.00' }],
      discounts: '0.00',
    });
    const extractId = extractRes.body.data.id as string;
    await admin.post(`/api/extracts/${extractId}/submit-review`);

    const approve = await admin.post(`/api/extracts/${extractId}/approve`);
    expect(approve.status).toBe(200);

    const auditResponse = await admin
      .get('/api/audit-logs')
      .query({ action: 'extract.approve', entityId: extractId });
    expect(auditResponse.status).toBe(200);
    expect(auditResponse.body.data).toHaveLength(1);
    const [entry] = auditResponse.body.data;
    expect(entry.before.status).toBe('Under Review');
    expect(entry.after.status).toBe('Approved');
  });
});
