/**
 * Frontend mirror of the backend's `modules/auth/permissions.ts` (PRD Section 7.2).
 * The frontend can't import backend code (Constitution Article I.1), so this list is
 * kept in sync by hand — same duplication pattern as `ROLE_NAME_TO_KEY` in `roles.ts`.
 * Grouped by module for the Roles permission-matrix editor (TASK-006 Section 14).
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

/** Presentation grouping only — the API validates against the flat `PERMISSION_KEYS` list. */
export const PERMISSION_GROUPS: { label: string; keys: PermissionKey[] }[] = [
  { label: 'Users & roles', keys: ['users:manage', 'roles:manage'] },
  {
    label: 'Generators',
    keys: [
      'generators:read',
      'generators:write',
      'generators:override',
      'generators:delete',
      'generators:meterCorrection',
      'status-engine:recalculate',
    ],
  },
  { label: 'Customers', keys: ['customers:read', 'customers:write', 'customers:delete'] },
  { label: 'Projects', keys: ['projects:read', 'projects:write'] },
  {
    label: 'Contracts',
    keys: ['contracts:read', 'contracts:write', 'contracts:sharedAssignmentOverride', 'contracts:previewRent'],
  },
  { label: 'Operations', keys: ['operations:read', 'operations:write', 'operations:correct'] },
  { label: 'Fuel', keys: ['fuel:read', 'fuel:write'] },
  { label: 'Maintenance', keys: ['maintenance:read', 'maintenance:write'] },
  { label: 'Extracts', keys: ['extracts:read', 'extracts:create', 'extracts:approve'] },
  { label: 'Receipts', keys: ['receipts:read', 'receipts:write'] },
  { label: 'Expenses', keys: ['expenses:read', 'expenses:write'] },
  { label: 'Reports', keys: ['reports:read'] },
  { label: 'Settings', keys: ['settings:manage', 'settings:finance'] },
  { label: 'Audit log', keys: ['audit:read'] },
];

const PERMISSION_LABELS: Record<PermissionKey, string> = {
  'users:manage': 'Manage users',
  'roles:manage': 'Manage roles',
  'generators:read': 'View generators',
  'generators:write': 'Edit generators',
  'generators:override': 'Override stopped/assignment',
  'generators:delete': 'Deactivate generators',
  'generators:meterCorrection': 'Correct meter readings',
  'status-engine:recalculate': 'Force status recalculation',
  'customers:read': 'View customers',
  'customers:write': 'Edit customers',
  'customers:delete': 'Deactivate customers',
  'projects:read': 'View projects',
  'projects:write': 'Edit projects',
  'contracts:read': 'View contracts',
  'contracts:write': 'Edit contracts',
  'contracts:sharedAssignmentOverride': 'Approve Shared Assignment overrides',
  'contracts:previewRent': 'Preview contract rent calculations',
  'operations:read': 'View operation logs',
  'operations:write': 'Record operation logs',
  'operations:correct': 'Correct operation logs',
  'fuel:read': 'View fuel logs',
  'fuel:write': 'Record fuel logs',
  'maintenance:read': 'View maintenance',
  'maintenance:write': 'Record maintenance',
  'extracts:read': 'View extracts',
  'extracts:create': 'Create extracts',
  'extracts:approve': 'Approve extracts',
  'receipts:read': 'View receipts',
  'receipts:write': 'Record receipts',
  'expenses:read': 'View expenses',
  'expenses:write': 'Record expenses',
  'reports:read': 'View reports',
  'settings:manage': 'Manage all settings',
  'settings:finance': 'Manage finance settings',
  'audit:read': 'View audit log',
};

export function permissionLabel(key: PermissionKey): string {
  return PERMISSION_LABELS[key];
}
