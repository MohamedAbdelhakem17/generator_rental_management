/**
 * Single source of truth for the PRD Section 7.2 Global Permission Matrix. Every
 * `requirePermission` call and every seeded Role's permission list is derived from
 * this file — nothing re-derives the matrix elsewhere (Article I.3).
 */

export const PERMISSION_KEYS = [
  'users:manage',
  'roles:manage',
  'generators:read',
  'generators:write',
  'generators:override',
  'customers:read',
  'customers:write',
  'projects:read',
  'projects:write',
  'contracts:read',
  'contracts:write',
  'operations:read',
  'operations:write',
  'fuel:read',
  'fuel:write',
  'maintenance:read',
  'maintenance:write',
  'extracts:read',
  'extracts:create',
  'extracts:approve',
  'receipts:read',
  'receipts:write',
  'expenses:read',
  'expenses:write',
  'reports:read',
  'settings:manage',
  'settings:finance',
  'audit:read',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const ROLE_NAMES = [
  'System Admin',
  'Operations Manager',
  'Finance Manager',
  'Accountant',
  'Technician',
  'Viewer',
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

const ALL_PERMISSIONS = [...PERMISSION_KEYS];

/** Row-by-row translation of PRD Section 7.2 into permission keys per role. */
export const ROLE_PERMISSIONS: Record<RoleName, PermissionKey[]> = {
  'System Admin': ALL_PERMISSIONS,
  'Operations Manager': [
    'generators:read',
    'generators:write',
    'generators:override',
    'customers:read',
    'customers:write',
    'projects:read',
    'projects:write',
    'contracts:read',
    'contracts:write',
    'operations:read',
    'operations:write',
    'fuel:read',
    'fuel:write',
    'maintenance:read',
    'maintenance:write',
    'reports:read',
  ],
  'Finance Manager': [
    'customers:read',
    'customers:write',
    'projects:read',
    'projects:write',
    'extracts:read',
    'extracts:create',
    'extracts:approve',
    'receipts:read',
    'receipts:write',
    'expenses:read',
    'expenses:write',
    'reports:read',
    'settings:finance',
  ],
  Accountant: [
    'extracts:read',
    'extracts:create',
    'receipts:read',
    'receipts:write',
    'expenses:read',
    'expenses:write',
    'reports:read',
  ],
  Technician: ['operations:read', 'operations:write', 'fuel:read', 'fuel:write', 'maintenance:read', 'maintenance:write'],
  Viewer: [
    'generators:read',
    'customers:read',
    'projects:read',
    'contracts:read',
    'operations:read',
    'fuel:read',
    'maintenance:read',
    'extracts:read',
    'receipts:read',
    'expenses:read',
    'reports:read',
  ],
};

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}
