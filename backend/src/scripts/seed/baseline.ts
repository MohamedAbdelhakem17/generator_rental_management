/**
 * TASK-007 — baseline seed: the 6 roles, one Admin user, and default SystemSetting
 * values. Idempotent (FR-001) — re-running never duplicates roles/settings, and never
 * overwrites an existing Admin user's password or an existing role's permissions
 * (Section 20 edge case).
 *
 * Run via: `pnpm --filter backend seed`
 */
import { pathToFileURL } from 'node:url';

import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import { AuditService } from '../../modules/audit/audit.service.js';
import { RoleModel } from '../../modules/roles/role.model.js';
import { seedRoles } from '../../modules/roles/role.seed.js';
import { SINGLETON_KEY, SystemSettingModel } from '../../modules/settings/systemSetting.model.js';
import { UserModel } from '../../modules/users/user.model.js';
import { hashPassword } from '../../utils/password.js';

const DEFAULT_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
const DEFAULT_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
const DEFAULT_ADMIN_NAME = 'System Administrator';

async function seedAdminUser(): Promise<boolean> {
  const existingAdmin = await UserModel.findOne({ email: DEFAULT_ADMIN_EMAIL });
  if (existingAdmin) return false;

  const adminRole = await RoleModel.findOne({ name: 'System Admin' });
  if (!adminRole) {
    throw new Error('System Admin role was not seeded — seedRoles() must run first');
  }

  await UserModel.create({
    name: DEFAULT_ADMIN_NAME,
    email: DEFAULT_ADMIN_EMAIL,
    passwordHash: await hashPassword(DEFAULT_ADMIN_PASSWORD),
    role: adminRole._id,
    active: true,
  });

  return true;
}

async function seedDefaultSettings(): Promise<boolean> {
  const existing = await SystemSettingModel.findOne({ key: SINGLETON_KEY });
  if (existing) return false;

  await SystemSettingModel.create({
    key: SINGLETON_KEY,
    vatRatePercent: '14',
    currency: 'EGP',
    fuelTolerancePercent: '15',
    fuelCriticalTolerancePercent: '30',
  });

  return true;
}

export async function seedBaseline(): Promise<void> {
  await seedRoles();
  const adminCreated = await seedAdminUser();
  const settingsCreated = await seedDefaultSettings();

  // Section 21: seed-created records are attributed to a system actor, not a real user.
  await AuditService.record({
    action: 'seed.baseline.run',
    actorUserId: null,
    metadata: { adminCreated, settingsCreated },
  });

  if (adminCreated) {
    console.log(`[seed] Created Admin user ${DEFAULT_ADMIN_EMAIL} — change this password after first login.`);
  }
}

async function main() {
  await connectDatabase();
  await seedBaseline();
  await disconnectDatabase();
  console.log('[seed] baseline complete');
}

// Guards the CLI entrypoint from firing on import (baseline.ts is imported directly by
// demo.ts and by tests) — `pathToFileURL` (not a raw string join) so this compares
// correctly on Windows, where `process.argv[1]` uses backslashes.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[seed] baseline failed', error);
    process.exit(1);
  });
}
