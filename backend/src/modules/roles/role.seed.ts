import { ROLE_PERMISSIONS } from '../auth/permissions.js';
import { RoleModel } from './role.model.js';

/**
 * Idempotent creation of the 6 roles from PRD Section 7 with their Section 7.2 permission
 * sets. TASK-006 owns this definition; TASK-007's `pnpm --filter backend seed` command
 * calls it as one step of the full baseline seed (roles + initial Admin + settings).
 *
 * TASK-007 Section 20 edge case: only MISSING roles are created — an existing role (e.g.
 * one whose permissions were hand-edited in the DB) is never overwritten by a re-run.
 */
export async function seedRoles(): Promise<void> {
  await Promise.all(
    Object.entries(ROLE_PERMISSIONS).map(([name, permissions]) =>
      RoleModel.updateOne({ name }, { $setOnInsert: { name, permissions } }, { upsert: true }).exec(),
    ),
  );
}
