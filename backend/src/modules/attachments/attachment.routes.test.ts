import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { createTestUser, resetTestDb, seedTestRoles, startTestDb, stopTestDb } from '../../test/authFixtures.js';

const app = createApp();
type Agent = ReturnType<typeof request.agent>;

async function loginAs(email: string, password = 'password123') {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password });
  return agent;
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

async function createMaintenance(admin: Agent, generatorId: string) {
  const response = await admin
    .post('/api/maintenance')
    .send({ generatorId, type: 'Preventive', date: '2026-01-01', meter: 100 });
  return response.body.data.id as string;
}

describe('attachment routes (TASK-032)', () => {
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
    const response = await request(app).get('/api/attachments').query({ entityType: 'Maintenance', entityId: 'x' });
    expect(response.status).toBe(401);
  });

  it('AC: a valid PDF under the size limit uploads, appears in the list, and downloads', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');
    const generatorId = await createGenerator(admin);
    const maintenanceId = await createMaintenance(admin, generatorId);

    const upload = await admin
      .post('/api/attachments')
      .field('entityType', 'Maintenance')
      .field('entityId', maintenanceId)
      .attach('file', Buffer.from('%PDF-1.4 fake pdf content'), 'inspection.pdf');

    expect(upload.status).toBe(201);
    expect(upload.body.data.fileName).toBe('inspection.pdf');
    expect(upload.body.data.fileType).toBe('pdf');

    const list = await admin
      .get('/api/attachments')
      .query({ entityType: 'Maintenance', entityId: maintenanceId });
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);

    const download = await admin.get(`/api/attachments/${upload.body.data.id}/download`);
    expect(download.status).toBe(200);
    expect((download.body as Buffer).toString()).toContain('fake pdf content');
  });

  it('AC: a disallowed file type is rejected before any file is stored', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin2@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin2@test.com');
    const generatorId = await createGenerator(admin);
    const maintenanceId = await createMaintenance(admin, generatorId);

    const upload = await admin
      .post('/api/attachments')
      .field('entityType', 'Maintenance')
      .field('entityId', maintenanceId)
      .attach('file', Buffer.from('bad'), 'malware.exe');

    expect(upload.status).toBe(422);
  });

  it('Section 17: permission inherits from the parent entity — Viewer can view Maintenance attachments but not upload', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin3@test.com', password: 'password123', roleId: roles['System Admin']._id });
    await createTestUser({ email: 'viewer@test.com', password: 'password123', roleId: roles.Viewer._id });
    const admin = await loginAs('admin3@test.com');
    const generatorId = await createGenerator(admin);
    const maintenanceId = await createMaintenance(admin, generatorId);

    const viewer = await loginAs('viewer@test.com');
    const listAsViewer = await viewer
      .get('/api/attachments')
      .query({ entityType: 'Maintenance', entityId: maintenanceId });
    expect(listAsViewer.status).toBe(200);

    const uploadAsViewer = await viewer
      .post('/api/attachments')
      .field('entityType', 'Maintenance')
      .field('entityId', maintenanceId)
      .attach('file', Buffer.from('x'), 'photo.png');
    expect(uploadAsViewer.status).toBe(403);
  });

  it('rejects uploading against a non-existent entity with 422', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin4@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin4@test.com');

    const upload = await admin
      .post('/api/attachments')
      .field('entityType', 'Maintenance')
      .field('entityId', '65f000000000000000000000')
      .attach('file', Buffer.from('x'), 'photo.png');

    expect(upload.status).toBe(422);
  });

  it('FR-003/Section 17: an Admin hard-deletes a Maintenance attachment', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin5@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin5@test.com');
    const generatorId = await createGenerator(admin);
    const maintenanceId = await createMaintenance(admin, generatorId);

    const upload = await admin
      .post('/api/attachments')
      .field('entityType', 'Maintenance')
      .field('entityId', maintenanceId)
      .attach('file', Buffer.from('x'), 'photo.png');

    const del = await admin.delete(`/api/attachments/${upload.body.data.id}`);
    expect(del.status).toBe(200);

    const download = await admin.get(`/api/attachments/${upload.body.data.id}/download`);
    expect(download.status).toBe(404);
  });
});
