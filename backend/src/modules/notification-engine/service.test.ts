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

    const items = await NotificationEngineService.listForUser(
      { id: '000000000000000000000099', role: 'Operations Manager' },
      { status: 'Unread' },
    );

    expect(items).toHaveLength(1);
    expect(items[0]!.message).toContain('fuel');

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

    expect(visible).toHaveLength(0);
  });
});
