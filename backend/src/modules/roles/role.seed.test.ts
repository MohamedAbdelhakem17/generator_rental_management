import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ROLE_NAMES, ROLE_PERMISSIONS } from '../auth/permissions.js';
import { resetTestDb, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { RoleModel } from './role.model.js';
import { seedRoles } from './role.seed.js';

describe('seedRoles', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('creates all 6 roles from PRD Section 7 with their Section 7.2 permission sets', async () => {
    await seedRoles();

    const roles = await RoleModel.find().sort('name');
    expect(roles).toHaveLength(ROLE_NAMES.length);

    for (const role of roles) {
      expect(role.permissions.sort()).toEqual([...ROLE_PERMISSIONS[role.name as keyof typeof ROLE_PERMISSIONS]].sort());
    }
  });

  it('is idempotent — re-running it does not create duplicates or lose an existing role id', async () => {
    await seedRoles();
    const firstRun = await RoleModel.find().sort('name');
    const adminId = firstRun.find((r) => r.name === 'System Admin')!._id;

    await seedRoles();
    const secondRun = await RoleModel.find().sort('name');

    expect(secondRun).toHaveLength(ROLE_NAMES.length);
    expect(secondRun.find((r) => r.name === 'System Admin')!._id).toEqual(adminId);
  });
});
