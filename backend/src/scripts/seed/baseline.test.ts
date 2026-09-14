import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ROLE_NAMES } from '../../modules/auth/permissions.js';
import { AuditLogModel } from '../../modules/audit/audit.model.js';
import { RoleModel } from '../../modules/roles/role.model.js';
import { SINGLETON_KEY, SystemSettingModel } from '../../modules/settings/systemSetting.model.js';
import { UserModel } from '../../modules/users/user.model.js';
import { resetTestDb, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { seedBaseline } from './baseline.js';

describe('seedBaseline (TASK-007 FR-001)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('creates all 6 roles, one Admin user, and default settings from an empty database', async () => {
    await seedBaseline();

    const roles = await RoleModel.find();
    expect(roles).toHaveLength(ROLE_NAMES.length);

    const admins = await UserModel.find({ email: 'admin@example.com' });
    expect(admins).toHaveLength(1);
    expect(admins[0]?.active).toBe(true);

    const settings = await SystemSettingModel.findOne({ key: SINGLETON_KEY });
    expect(settings).not.toBeNull();
    expect(settings?.currency).toBe('EGP');
  });

  it('is idempotent: running it twice creates no duplicates', async () => {
    await seedBaseline();
    await seedBaseline();

    expect(await RoleModel.countDocuments()).toBe(ROLE_NAMES.length);
    expect(await UserModel.countDocuments({ email: 'admin@example.com' })).toBe(1);
    expect(await SystemSettingModel.countDocuments({ key: SINGLETON_KEY })).toBe(1);
  });

  it('Section 20 edge case: never overwrites a role whose permissions were hand-edited', async () => {
    await seedBaseline();
    await RoleModel.updateOne({ name: 'Viewer' }, { $set: { permissions: ['reports:read'] } });

    await seedBaseline();

    const viewer = await RoleModel.findOne({ name: 'Viewer' });
    expect(viewer?.permissions).toEqual(['reports:read']);
  });

  it('Section 21: audits the seed run under a system actor, not a real user', async () => {
    await seedBaseline();

    const entry = await AuditLogModel.findOne({ action: 'seed.baseline.run' });
    expect(entry).not.toBeNull();
    expect(entry?.actorUserId).toBeNull();
  });
});
