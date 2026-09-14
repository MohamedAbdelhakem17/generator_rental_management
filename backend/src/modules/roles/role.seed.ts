import { ROLE_PERMISSIONS } from '../auth/permissions.js';
import { RoleModel } from './role.model.js';

/**
 * Idempotent upsert of the 6 roles from PRD Section 7 with their Section 7.2 permission
 * sets. TASK-006 owns this definition; TASK-007's `pnpm --filter backend seed` command
 * calls it as one step of the full baseline seed (roles + initial Admin + settings).
 */
export async function seedRoles(): Promise<void> {
  await Promise.all(
    Object.entries(ROLE_PERMISSIONS).map(([name, permissions]) =>
      RoleModel.updateOne({ name }, { $set: { name, permissions } }, { upsert: true }).exec(),
    ),
  );
}
