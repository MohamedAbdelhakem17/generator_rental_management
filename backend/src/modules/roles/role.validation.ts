import { z } from 'zod';

import { PERMISSION_KEYS } from '../auth/permissions.js';

export const updateRolePermissionsSchema = z.object({
  permissions: z.array(z.enum(PERMISSION_KEYS)).min(1, 'At least one permission is required'),
});

export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;
