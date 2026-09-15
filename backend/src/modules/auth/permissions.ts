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
  'generators:delete',
  'generators:meterCorrection',
  'status-engine:recalculate',
  'customers:read',
  'customers:write',
  'customers:delete',
  'projects:read',
  'projects:write',
  'contracts:read',
  'contracts:write',
  'contracts:sharedAssignmentOverride',
  'contracts:previewRent',
  'operations:read',
  'operations:write',
  'operations:correct',
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

/**
 * Row-by-row translation of PRD Section 7.2 into permission keys per role — refined by
 * each module task's own, more detailed Section 17 matrix where the two disagree (7.2
 * is explicitly "a summary — module matrices repeat the relevant rows"; e.g. TASK-008
 * gives Technician/Finance Manager/Accountant generator *read* access 7.2's coarse
 * "Manage Generators" row didn't show, and both TASK-008 and TASK-010 split a stricter
 * Admin/Finance-Manager-only "Deactivate" action out of the broader "write" grant).
 */
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
    'operations:correct',
    'fuel:read',
    'fuel:write',
    'maintenance:read',
    'maintenance:write',
    'reports:read',
  ],
  'Finance Manager': [
    'generators:read',
    'customers:read',
    'customers:write',
    'customers:delete',
    'projects:read',
    'contracts:read',
    'contracts:previewRent',
    'fuel:read',
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
    'generators:read',
    'customers:read',
    'projects:read',
    'contracts:read',
    'contracts:previewRent',
    'fuel:read',
    'extracts:read',
    'extracts:create',
    'receipts:read',
    'receipts:write',
    'expenses:read',
    'expenses:write',
    'reports:read',
  ],
  Technician: [
    'generators:read',
    'operations:read',
    'operations:write',
    'fuel:read',
    'fuel:write',
    'maintenance:read',
    'maintenance:write',
  ],
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
