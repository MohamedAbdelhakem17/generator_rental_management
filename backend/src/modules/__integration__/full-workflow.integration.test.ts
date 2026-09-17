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
type Agent = ReturnType<typeof request.agent>;

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

/**
 * Full-chain integration test required by TASK-033: Generator -> Contract -> Operations ->
 * Extract -> Receipt -> Ledger -> Dashboard, driven entirely through real HTTP requests
 * against the real Express app + an in-memory MongoDB (mongodb-memory-server), so every
 * business rule (Status Engine, Financial Calculation Engine, Customer Ledger Engine,
 * Dashboard aggregation, Audit Log Engine) actually executes rather than being mocked.
 *
 * No local/Docker MongoDB is available in this environment, so this integration test (real
 * MongoDB via mongodb-memory-server, same harness the rest of the backend suite already
 * depends on) is the environment-appropriate equivalent of a full-stack Playwright E2E run —
 * see full-workflow.e2e.spec.ts in frontend/e2e for the browser-driven version to run once a
 * real MongoDB instance is reachable.
 */
describe('full workflow integration (TASK-033): Generator -> Contract -> Operations -> Extract -> Receipt -> Ledger -> Dashboard', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('propagates real data and calculations across every module in the chain', async () => {
    await seedTestSettings();
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin: Agent = await loginAs('admin@test.com');

    // 1. Authenticated as Admin (loginAs above) — verify session actually works.
    const me = await admin.get('/api/customers');
    expect(me.status).toBe(200);

    // 2. Create Customer, Project, Generator.
    const customerRes = await admin.post('/api/customers').send({
      code: `CUST-${Date.now()}`,
      companyName: 'Acme Construction',
    });
    expect(customerRes.status).toBe(201);
    const customerId = customerRes.body.data.id as string;

    const projectRes = await admin.post('/api/projects').send({
      code: `PROJ-${Date.now()}`,
      name: 'Site A',
      customerId,
      startDate: isoDate(-70),
    });
    expect(projectRes.status).toBe(201);
    const projectId = projectRes.body.data.id as string;

    const generatorRes = await admin.post('/api/generators').send({
      specifications: { kva: 500, brand: 'Cummins', model: 'C500D5', serialNumber: `SN-${Date.now()}` },
      normalFuelConsumption: 25,
    });
    expect(generatorRes.status).toBe(201);
    const generatorId = generatorRes.body.data.id as string;
    expect(generatorRes.body.data.code).toMatch(/^GEN-\d{4}$/);

    // 3. Create + activate a RentalContract; verify Active status and the Status Engine's
    // effect on the Generator (Rented / Assigned).
    const contractRes = await admin.post('/api/contracts').send({
      customerId,
      projectId,
      startDate: isoDate(-60),
      endDate: isoDate(15),
      rentalMethod: 'monthly',
      items: [{ generatorId, unitPrice: 15000 }],
    });
    expect(contractRes.status).toBe(201);
    const contractId = contractRes.body.data.id as string;

    const activateRes = await admin.post(`/api/contracts/${contractId}/activate`);
    expect(activateRes.status).toBe(200);
    expect(activateRes.body.data.status).toBe('Active');

    const generatorAfterActivate = await admin.get(`/api/generators/${generatorId}`);
    expect(generatorAfterActivate.body.data.status).toBe('Rented');
    expect(generatorAfterActivate.body.data.commercialStatus).toBe('Assigned');

    // 4. Log a daily Operation entry; verify Generator.currentMeter updates.
    const operationRes = await admin.post('/api/operations').send({
      date: isoDate(-50),
      projectId,
      generatorId,
      startMeter: 1000,
      endMeter: 1020,
    });
    expect(operationRes.status).toBe(201);
    expect(operationRes.body.data.operatingHours).toBe(20);

    const generatorAfterOperation = await admin.get(`/api/generators/${generatorId}`);
    expect(generatorAfterOperation.body.data.currentMeter).toBe(1020);

    // 5. Create an Extract for a period ending 35 days ago (past the 30-day default overdue
    // grace period, exercising the new aging logic later), verify Financial Calculation
    // Engine's VAT-inclusive totals.
    const extractRes = await admin.post('/api/extracts').send({
      customerId,
      projectId,
      contractIds: [contractId],
      period: { start: isoDate(-60), end: isoDate(-35) },
      lineItems: [{ type: 'rent', description: 'Rent', amount: 15000 }],
      discounts: 0,
    });
    expect(extractRes.status).toBe(201);
    expect(extractRes.body.data.status).toBe('Draft');
    expect(extractRes.body.data.finalTotal).toBe('17100.00');
    const extractId = extractRes.body.data.id as string;

    // 6. Submit for review, then approve; verify the status transition and that an audit log
    // entry exists for the approval (TASK-031).
    const submitRes = await admin.post(`/api/extracts/${extractId}/submit-review`);
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.status).toBe('Under Review');

    const approveRes = await admin.post(`/api/extracts/${extractId}/approve`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('Approved');
    expect(approveRes.body.data.vat).toBe('2100.00');
    expect(approveRes.body.data.finalTotal).toBe('17100.00');

    const auditRes = await admin
      .get('/api/audit-logs')
      .query({ entityType: 'Extract', entityId: extractId, action: 'extract.approve' });
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(auditRes.body.data[0].entityId).toBe(extractId);

    // 7. Record a partial Receipt against the Extract; verify the Extract's collected state
    // updates and it moves to Partially Collected (not fully Collected).
    const receiptRes = await admin.post('/api/receipts').send({
      customerId,
      date: isoDate(0),
      amount: 10000,
      paymentMethod: 'Cash',
      allocations: [{ extractId, amount: 10000 }],
    });
    expect(receiptRes.status).toBe(201);
    expect(receiptRes.body.data.status).toBe('Confirmed');

    const extractAfterReceipt = await admin.get(`/api/extracts/${extractId}`);
    expect(extractAfterReceipt.body.data.status).toBe('Partially Collected');
    expect(extractAfterReceipt.body.data.collectedAmount).toBe('10000.00');

    // 8. Query the Customer Ledger; verify real arithmetic: 17100.00 charged - 10000.00
    // collected = 7100.00 outstanding, and the statement's closing balance agrees.
    const balanceRes = await admin.get(`/api/customers/${customerId}/balance`);
    expect(balanceRes.status).toBe(200);
    expect(balanceRes.body.data).toBe('7100.00');

    const statementRes = await admin.get(`/api/customers/${customerId}/statement`);
    expect(statementRes.status).toBe(200);
    expect(statementRes.body.data.closingBalance).toBe('7100.00');

    // 9. Query the Dashboard summary; verify cross-module aggregation actually sees this
    // customer's real state: the outstanding-receivables KPI reflects the 7100.00 balance,
    // and the overdue-customer aging KPI (fixed in this hardening pass) now counts this
    // customer as overdue, since their unpaid extract's period ended 35 days ago — well past
    // the 30-day default grace period.
    const dashboardRes = await admin.get('/api/dashboard');
    expect(dashboardRes.status).toBe(200);
    expect(dashboardRes.body.data.financial.outstanding).toBe('7100.00');
    expect(dashboardRes.body.data.alerts.overdueCustomers).toBe(1);
  });
});
