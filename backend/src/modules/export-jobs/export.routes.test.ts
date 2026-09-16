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
import { CustomerModel } from '../customers/customer.model.js';
import { ExpenseModel } from '../expenses/expense.model.js';
import { ExportJobModel } from './export-job.model.js';
import { SYNC_EXPORT_ROW_THRESHOLD } from './export.service.js';

const app = createApp();

async function loginAs(email: string, password = 'password123') {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password });
  return agent;
}

describe('export routes (TASK-029)', () => {
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
    const response = await request(app)
      .post('/api/exports')
      .send({ reportType: 'expenses', format: 'csv' });
    expect(response.status).toBe(401);
  });

  it('streams a CSV file synchronously for a small dataset, matching the on-screen filters', async () => {
    const roles = await seedTestRoles();
    await createTestUser({
      email: 'finance@test.com',
      password: 'password123',
      roleId: roles['Finance Manager']._id,
    });

    await ExpenseModel.create({
      category: 'Transport',
      date: new Date('2026-01-05'),
      amount: '150.00',
      description: 'Fuel truck rental',
      status: 'Confirmed',
    });
    await ExpenseModel.create({
      category: 'Office',
      date: new Date('2026-02-05'),
      amount: '80.00',
      description: 'Supplies',
      status: 'Confirmed',
    });

    const finance = await loginAs('finance@test.com');
    const response = await finance
      .post('/api/exports')
      .send({ reportType: 'expenses', format: 'csv', filters: { category: 'Transport' } });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.text).toContain('Fuel truck rental');
    expect(response.text).not.toContain('Supplies');
  });

  it('rejects exporting a report the role has no permission for with 403', async () => {
    const roles = await seedTestRoles();
    await createTestUser({
      email: 'viewer@test.com',
      password: 'password123',
      roleId: roles.Viewer._id,
    });

    const viewer = await loginAs('viewer@test.com');
    const response = await viewer
      .post('/api/exports')
      .send({ reportType: 'profitability', format: 'csv' });

    expect(response.status).toBe(403);
  });

  it('rejects an unknown reportType with 422', async () => {
    const roles = await seedTestRoles();
    await createTestUser({
      email: 'admin@test.com',
      password: 'password123',
      roleId: roles['System Admin']._id,
    });

    const admin = await loginAs('admin@test.com');
    const response = await admin.post('/api/exports').send({ reportType: 'not-a-report', format: 'csv' });
    expect(response.status).toBe(422);
  });

  it('rejects the pdf format, pointing to the client-side print view instead', async () => {
    const roles = await seedTestRoles();
    await createTestUser({
      email: 'admin2@test.com',
      password: 'password123',
      roleId: roles['System Admin']._id,
    });

    const admin = await loginAs('admin2@test.com');
    const response = await admin.post('/api/exports').send({ reportType: 'expenses', format: 'pdf' });
    expect(response.status).toBe(422);
  });

  it('AC: a dataset exceeding the sync threshold returns 202 with a job id that becomes Ready and downloadable', async () => {
    const roles = await seedTestRoles();
    await createTestUser({
      email: 'admin3@test.com',
      password: 'password123',
      roleId: roles['System Admin']._id,
    });

    const customer = await CustomerModel.create({ code: 'C-EXP-1', companyName: 'Bulk Customer' });
    const rowCount = SYNC_EXPORT_ROW_THRESHOLD + 1;
    await ExpenseModel.insertMany(
      Array.from({ length: rowCount }, (_, index) => ({
        category: 'Bulk',
        date: new Date('2026-01-01'),
        amount: '10.00',
        description: `row-${index}`,
        status: 'Confirmed',
      })),
    );
    void customer;

    const admin = await loginAs('admin3@test.com');
    const created = await admin.post('/api/exports').send({ reportType: 'expenses', format: 'csv' });
    expect(created.status).toBe(202);
    const jobId = created.body.data.jobId as string;
    expect(created.body.data.status).toBe('Processing');

    let job = await ExportJobModel.findById(jobId);
    for (let attempt = 0; attempt < 20 && job?.status === 'Processing'; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      job = await ExportJobModel.findById(jobId);
    }
    expect(job?.status).toBe('Ready');

    const download = await admin.get(`/api/exports/${jobId}/download`);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('text/csv');
  }, 15_000);
});
