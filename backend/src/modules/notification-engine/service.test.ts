import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { resetTestDb, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { NotificationModel } from './notification.model.js';
import { NotificationEngineService } from './service.js';

describe('NotificationEngineService (TASK-026)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('lists only notifications visible to the current role and marks them read', async () => {
    const created = await NotificationModel.create({
      type: 'FuelAlert',
      severity: 'warning',
      title: 'Abnormal fuel use',
      message: 'Generator is using more fuel than expected',
      entityType: 'FuelAlert',
      entityId: '000000000000000000000001',
      recipientRoles: ['Operations Manager', 'System Admin'],
      status: 'Unread',
      readAt: null,
    });

    const result = await NotificationEngineService.listForUser(
      { id: '000000000000000000000099', role: 'Operations Manager' },
      { status: 'Unread' },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.message).toContain('fuel');

    const updated = await NotificationEngineService.markRead(String(created._id), {
      id: '000000000000000000000099',
      role: 'Operations Manager',
    });

    expect(updated.status).toBe('Read');
    expect(updated.readAt).not.toBeNull();
  });

  it('hides notifications outside a technician assignment', async () => {
    await NotificationModel.create({
      type: 'MaintenanceAlert',
      severity: 'critical',
      title: 'Maintenance overdue',
      message: 'GEN-01 is overdue',
      entityType: 'MaintenanceAlert',
      entityId: '000000000000000000000002',
      recipientRoles: ['Operations Manager'],
      assignedUserId: '000000000000000000000123',
      status: 'Unread',
      readAt: null,
    });

    const visible = await NotificationEngineService.listForUser(
      { id: '000000000000000000000456', role: 'Technician' },
      { status: 'Unread' },
    );

    expect(visible.items).toHaveLength(0);
  });

  it('marks all visible unread notifications as read in one action', async () => {
    await NotificationModel.create([
      {
        type: 'FuelAlert',
        severity: 'warning',
        title: 'Abnormal fuel use',
        message: 'Generator A is using more fuel than expected',
        entityType: 'FuelAlert',
        entityId: '000000000000000000000003',
        recipientRoles: ['Operations Manager'],
        status: 'Unread',
        readAt: null,
      },
      {
        type: 'FuelAlert',
        severity: 'warning',
        title: 'Abnormal fuel use',
        message: 'Generator B is using more fuel than expected',
        entityType: 'FuelAlert',
        entityId: '000000000000000000000004',
        recipientRoles: ['Operations Manager'],
        status: 'Unread',
        readAt: null,
      },
    ]);

    const user = { id: '000000000000000000000099', role: 'Operations Manager' };
    const { updated } = await NotificationEngineService.markAllRead(user);
    expect(updated).toBe(2);

    const remaining = await NotificationEngineService.listForUser(user, { status: 'Unread' });
    expect(remaining.items).toHaveLength(0);
  });

  it('rejects marking a notification not visible to the current user as read', async () => {
    const created = await NotificationModel.create({
      type: 'FuelAlert',
      severity: 'warning',
      title: 'Abnormal fuel use',
      message: 'Generator is using more fuel than expected',
      entityType: 'FuelAlert',
      entityId: '000000000000000000000005',
      recipientRoles: ['Finance Manager'],
      status: 'Unread',
      readAt: null,
    });

    await expect(
      NotificationEngineService.markRead(String(created._id), {
        id: '000000000000000000000099',
        role: 'Operations Manager',
      }),
    ).rejects.toThrow('Notification not found');
  });
});
