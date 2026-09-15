import type { PermissionKey } from '@/lib/permissions/permission-keys';

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: { id: string; name: string };
  active: boolean;
  assignedGenerators: { id: string; code: string }[];
  lastLoginAt: string | null;
  createdAt?: string;
}

export interface RoleRow {
  id: string;
  name: string;
  permissions: PermissionKey[];
}
