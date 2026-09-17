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
import { NotificationModel } from './notification.model.js';

const app = createApp();

async function loginAs(email: string, password = 'password123') {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password });
  return agent;
}

describe('notification routes (TASK-026/TASK-033 coverage)', () => {
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
    const response = await request(app).get('/api/notifications');
    expect(response.status).toBe(401);
  });

  it('a user only sees notifications addressed to their own role', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    await createTestUser({ email: 'viewer@test.com', password: 'password123', roleId: roles.Viewer._id });

    await NotificationModel.create({
      type: 'ContractExpiry',
      severity: 'warning',
      title: 'For admins',
      message: 'Admin-only notice',
      entityType: 'RentalContract',
      entityId: '000000000000000000000001',
      recipientRoles: ['System Admin'],
      status: 'Unread',
    });
    await NotificationModel.create({
      type: 'OverdueCustomer',
      severity: 'critical',
      title: 'For viewers',
      message: 'Viewer-only notice',
      entityType: 'Customer',
      entityId: '000000000000000000000002',
      recipientRoles: ['Viewer'],
      status: 'Unread',
    });

    const admin = await loginAs('admin@test.com');
    const adminList = await admin.get('/api/notifications');
    expect(adminList.status).toBe(200);
    expect(adminList.body.data).toHaveLength(1);
    expect(adminList.body.data[0].title).toBe('For admins');

    const viewer = await loginAs('viewer@test.com');
    const viewerList = await viewer.get('/api/notifications');
    expect(viewerList.body.data).toHaveLength(1);
    expect(viewerList.body.data[0].title).toBe('For viewers');
  });

  it('a Technician only sees notifications unassigned or assigned to them (ownership scoping)', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'tech1@test.com', password: 'password123', roleId: roles.Technician._id });
    const tech2 = await createTestUser({
      email: 'tech2@test.com',
      password: 'password123',
      roleId: roles.Technician._id,
    });

    const assignedToTech2 = await NotificationModel.create({
      type: 'MaintenanceAlert',
      severity: 'warning',
      title: 'Assigned to tech2',
      message: 'msg',
      entityType: 'Generator',
      entityId: '000000000000000000000003',
      recipientRoles: ['Technician'],
      assignedUserId: tech2._id,
      status: 'Unread',
    });

    const tech1 = await loginAs('tech1@test.com');
    const tech1List = await tech1.get('/api/notifications');
    expect(tech1List.body.data).toHaveLength(0);

    const forbidden = await tech1.patch(`/api/notifications/${String(assignedToTech2._id)}/read`);
    expect(forbidden.status).toBe(404);

    const tech2Agent = await loginAs('tech2@test.com');
    const tech2List = await tech2Agent.get('/api/notifications');
    expect(tech2List.body.data).toHaveLength(1);
  });

  it('marks a single notification read and updates the unread count', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const notification = await NotificationModel.create({
      type: 'FuelAlert',
      severity: 'warning',
      title: 'Fuel alert',
      message: 'msg',
      entityType: 'Generator',
      entityId: '000000000000000000000004',
      recipientRoles: ['System Admin'],
      status: 'Unread',
    });

    const admin = await loginAs('admin@test.com');
    const before = await admin.get('/api/notifications/unread-count');
    expect(before.body.data.count).toBe(1);

    const marked = await admin.patch(`/api/notifications/${String(notification._id)}/read`);
    expect(marked.status).toBe(200);
    expect(marked.body.data.status).toBe('Read');
    expect(marked.body.data.readAt).not.toBeNull();

    const after = await admin.get('/api/notifications/unread-count');
    expect(after.body.data.count).toBe(0);
  });

  it('404s when marking a nonexistent notification read', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const admin = await loginAs('admin@test.com');

    const response = await admin.patch('/api/notifications/000000000000000000000099/read');
    expect(response.status).toBe(404);
  });

  it('marks all unread notifications read in bulk', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    await NotificationModel.create([
      {
        type: 'FuelAlert',
        severity: 'warning',
        title: 'A',
        message: 'msg',
        entityType: 'Generator',
        entityId: '000000000000000000000005',
        recipientRoles: ['System Admin'],
        status: 'Unread',
      },
      {
        type: 'MaintenanceAlert',
        severity: 'critical',
        title: 'B',
        message: 'msg',
        entityType: 'Generator',
        entityId: '000000000000000000000006',
        recipientRoles: ['System Admin'],
        status: 'Unread',
      },
    ]);

    const admin = await loginAs('admin@test.com');
    const result = await admin.patch('/api/notifications/read-all');
    expect(result.status).toBe(200);
    expect(result.body.data.updated).toBe(2);

    const count = await admin.get('/api/notifications/unread-count');
    expect(count.body.data.count).toBe(0);
  });

  it('paginates the list and filters by status/severity/type', async () => {
    const roles = await seedTestRoles();
    await createTestUser({ email: 'admin@test.com', password: 'password123', roleId: roles['System Admin']._id });
    const docs = Array.from({ length: 3 }, (_, i) => ({
      type: 'FuelAlert' as const,
      severity: i === 0 ? ('critical' as const) : ('warning' as const),
      title: `Notice ${i}`,
      message: 'msg',
      entityType: 'Generator',
      entityId: `00000000000000000000001${i}`,
      recipientRoles: ['System Admin'],
      status: i === 2 ? ('Read' as const) : ('Unread' as const),
    }));
    await NotificationModel.create(docs);

    const admin = await loginAs('admin@test.com');

    const paged = await admin.get('/api/notifications').query({ page: 1, limit: 2 });
    expect(paged.body.data).toHaveLength(2);
    expect(paged.body.meta.total).toBe(3);

    const byStatus = await admin.get('/api/notifications').query({ status: 'Unread' });
    expect(byStatus.body.data).toHaveLength(2);

    const bySeverity = await admin.get('/api/notifications').query({ severity: 'critical' });
    expect(bySeverity.body.data).toHaveLength(1);

    const byType = await admin.get('/api/notifications').query({ type: 'FuelAlert' });
    expect(byType.body.data).toHaveLength(3);
  });
});
