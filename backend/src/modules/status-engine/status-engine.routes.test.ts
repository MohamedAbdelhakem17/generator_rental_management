import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { createTestUser, resetTestDb, seedTestRoles, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { ACTIVE_CONTRACT_CHECKS } from './status-engine.types.js';

const app = createApp();

async function loginAs(email: string, password = 'password123') {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password });
  return agent;
}

const validPayload = {
  code: 'GEN-001',
  specifications: { kva: 500, brand: 'Cummins', model: 'C500D5', serialNumber: 'SN-0001' },
  normalFuelConsumption: 25,
};

describe('status engine routes (TASK-009)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
    ACTIVE_CONTRACT_CHECKS.length = 0;
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('rejects an unauthenticated recalculation request with 401', async () => {
    const response = await request(app).post('/api/admin/status-engine/recalculate');
    expect(response.status).toBe(401);
  });

  it('Section 17: only Admin can force a full-fleet recalculation', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    await createTestUser({ email: 'ops@test.com', password: 'password123', roleId: roles['Operations Manager']._id });
    const admin = await loginAs('admin@test.com');
    const ops = await loginAs('ops@test.com');

    const opsAttempt = await ops.post('/api/admin/status-engine/recalculate');
    expect(opsAttempt.status).toBe(403);

    const adminAttempt = await admin.post('/api/admin/status-engine/recalculate');
    expect(adminAttempt.status).toBe(200);
    expect(adminAttempt.body.data).toEqual({ recalculated: 0, driftDetected: 0 });
  });

  it('AC: reconciliation self-heals drift without manual intervention', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    await admin.post('/api/generators').send(validPayload);

    ACTIVE_CONTRACT_CHECKS.push(async () => true);

    const recalc = await admin.post('/api/admin/status-engine/recalculate');
    expect(recalc.status).toBe(200);
    expect(recalc.body.data).toEqual({ recalculated: 1, driftDetected: 1 });

    const list = await admin.get('/api/generators');
    expect(list.body.data[0].status).toBe('Rented');
    expect(list.body.data[0].commercialStatus).toBe('Assigned');
  });

  it("Section 13: a generator's status history reflects stop/resume transitions", async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const create = await admin.post('/api/generators').send(validPayload);
    const id = create.body.data.id;

    await admin.post(`/api/generators/${id}/stop`).send({ reason: 'Engine fault' });
    await admin.post(`/api/generators/${id}/resume`).send();

    const history = await admin.get(`/api/generators/${id}/status-history`);
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(2);
    expect(history.body.data[0]).toMatchObject({ from: 'Stopped', to: 'Available', triggeredBy: 'user' });
    expect(history.body.data[1]).toMatchObject({ from: 'Available', to: 'Stopped', reason: 'Engine fault', triggeredBy: 'user' });
  });
});
