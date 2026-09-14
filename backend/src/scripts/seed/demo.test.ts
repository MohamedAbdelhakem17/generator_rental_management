import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { RoleModel } from '../../modules/roles/role.model.js';
import { resetTestDb, startTestDb, stopTestDb } from '../../test/authFixtures.js';
import { seedDemo } from './demo.js';

describe('seedDemo (TASK-007 FR-002)', () => {
  beforeAll(async () => {
    await startTestDb();
  }, 60_000);

  afterEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it('refuses to run and creates nothing when NODE_ENV=production', async () => {
    await expect(seedDemo('production')).rejects.toThrow(/production/i);
    expect(await RoleModel.countDocuments()).toBe(0);
  });

  it('runs the baseline seed when NODE_ENV is development', async () => {
    await seedDemo('development');
    expect(await RoleModel.countDocuments()).toBeGreaterThan(0);
  });
});
