/**
 * Minimal, idempotent fixture seed for the frontend Playwright E2E suite: the 6 roles
 * plus one login-capable user per role family the TASK-006 E2E scenarios need (Admin,
 * a write-capable operational role, a read-only role). This is NOT the full baseline
 * seed (`pnpm --filter backend seed`) — that command, with an initial Admin and
 * `SystemSetting` defaults, is TASK-007's job. This script only unblocks TASK-006's own
 * "login → dashboard", "logout → /login", "Viewer can't see write actions" E2E cases,
 * which can't wait for TASK-007 since TASK-006 doesn't depend on it.
 *
 * Run directly: `pnpm --filter backend exec tsx src/scripts/seedE2eFixtures.ts`
 */
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { UserModel } from '../modules/users/user.model.js';
import { RoleModel } from '../modules/roles/role.model.js';
import { seedRoles } from '../modules/roles/role.seed.js';
import { hashPassword } from '../utils/password.js';

export const E2E_PASSWORD = 'Password123!';

export const E2E_USERS = [
  { email: 'e2e-admin@test.local', name: 'E2E Admin', roleName: 'System Admin' as const },
  { email: 'e2e-technician@test.local', name: 'E2E Technician', roleName: 'Technician' as const },
  { email: 'e2e-viewer@test.local', name: 'E2E Viewer', roleName: 'Viewer' as const },
];

export async function seedE2eFixtures(): Promise<void> {
  await seedRoles();
  const passwordHash = await hashPassword(E2E_PASSWORD);

  for (const fixture of E2E_USERS) {
    const role = await RoleModel.findOne({ name: fixture.roleName });
    if (!role) throw new Error(`Role "${fixture.roleName}" was not seeded`);

    await UserModel.updateOne(
      { email: fixture.email },
      { $set: { name: fixture.name, email: fixture.email, passwordHash, role: role._id, active: true, isDeleted: false } },
      { upsert: true },
    );
  }
}

async function main() {
  await connectDatabase();
  await seedE2eFixtures();
  await disconnectDatabase();
  console.log('[seedE2eFixtures] done');
}

main().catch((error) => {
  console.error('[seedE2eFixtures] failed', error);
  process.exit(1);
});
