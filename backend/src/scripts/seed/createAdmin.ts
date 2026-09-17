/**
 * One-off script to create a specific Admin user. Not part of the standard seed flow —
 * run manually via: `ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_NAME=... tsx src/scripts/seed/createAdmin.ts`
 *
 * ADMIN_PASSWORD is required and has no default — never hardcode a real credential here.
 */
import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import { AuditService } from '../../modules/audit/audit.service.js';
import { RoleModel } from '../../modules/roles/role.model.js';
import { seedRoles } from '../../modules/roles/role.seed.js';
import { UserModel } from '../../modules/users/user.model.js';
import { hashPassword } from '../../utils/password.js';

const NAME = process.env.ADMIN_NAME ?? 'Admin User';
const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const PASSWORD = process.env.ADMIN_PASSWORD;

async function main() {
  if (!PASSWORD) {
    throw new Error('ADMIN_PASSWORD environment variable is required and was not set.');
  }

  await connectDatabase();

  await seedRoles();
  const adminRole = await RoleModel.findOne({ name: 'System Admin' });
  if (!adminRole) {
    throw new Error('System Admin role was not seeded — seedRoles() must run first');
  }

  const existing = await UserModel.findOne({ email: EMAIL });
  if (existing) {
    console.log(`[create-admin] User ${EMAIL} already exists — no changes made.`);
    await disconnectDatabase();
    return;
  }

  const user = await UserModel.create({
    name: NAME,
    email: EMAIL,
    passwordHash: await hashPassword(PASSWORD),
    role: adminRole._id,
    active: true,
  });

  await AuditService.record({
    action: 'user.create',
    actorUserId: null,
    actorType: 'system',
    entityType: 'User',
    entityId: String(user._id),
    metadata: { email: EMAIL, role: 'System Admin', source: 'createAdmin script' },
  });

  console.log(`[create-admin] Created Admin user ${EMAIL}.`);
  await disconnectDatabase();
}

main().catch((error) => {
  console.error('[create-admin] failed', error);
  process.exit(1);
});
