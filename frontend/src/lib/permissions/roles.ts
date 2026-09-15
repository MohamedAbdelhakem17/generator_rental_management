/**
 * Frontend copy of the PRD Section 7.2 Global Permission Matrix, used only to decide
 * which modules the Sidebar renders (FR-*, Section 17). This is a UX convenience —
 * every mutating route still enforces `requirePermission` server-side (TASK-006);
 * hiding a module here is never a security control.
 */

export type Role = 'admin' | 'ops_manager' | 'finance_manager' | 'accountant' | 'technician' | 'viewer';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'System Admin',
  ops_manager: 'Operations Manager',
  finance_manager: 'Finance Manager',
  accountant: 'Accountant',
  technician: 'Technician',
  viewer: 'Viewer',
};

export type ModuleKey =
  | 'dashboard'
  | 'generators'
  | 'customers'
  | 'projects'
  | 'contracts'
  | 'operations'
  | 'fuel'
  | 'maintenance'
  | 'extracts'
  | 'receipts'
  | 'expenses'
  | 'reports'
  | 'settings'
  | 'audit'
  | 'users';

/** Roles listed for a module have at least read (👁) access per the PRD matrix. */
export const MODULE_ACCESS: Record<ModuleKey, Role[]> = {
  dashboard: ['admin', 'ops_manager', 'finance_manager', 'accountant', 'viewer'],
  generators: ['admin', 'ops_manager', 'finance_manager', 'accountant', 'technician', 'viewer'],
  customers: ['admin', 'ops_manager', 'finance_manager', 'accountant', 'viewer'],
  projects: ['admin', 'ops_manager', 'finance_manager', 'accountant', 'viewer'],
  contracts: ['admin', 'ops_manager', 'finance_manager', 'accountant', 'viewer'],
  operations: ['admin', 'ops_manager', 'finance_manager', 'accountant', 'technician', 'viewer'],
  fuel: ['admin', 'ops_manager', 'finance_manager', 'accountant', 'technician', 'viewer'],
  maintenance: ['admin', 'ops_manager', 'finance_manager', 'accountant', 'technician', 'viewer'],
  extracts: ['admin', 'ops_manager', 'finance_manager', 'accountant', 'viewer'],
  receipts: ['admin', 'finance_manager', 'accountant', 'viewer'],
  expenses: ['admin', 'finance_manager', 'accountant', 'viewer'],
  reports: ['admin', 'ops_manager', 'finance_manager', 'accountant', 'viewer'],
  settings: ['admin', 'finance_manager'],
  audit: ['admin'],
  users: ['admin'],
};

export function canAccessModule(role: Role, module: ModuleKey): boolean {
  return MODULE_ACCESS[module].includes(role);
}

/**
 * The backend (`modules/auth/permissions.ts`) stores each Role's display name, e.g.
 * "System Admin" — this is the one place that name is translated to the short `Role`
 * code the Sidebar/AppShell already key off of (TASK-004).
 */
export const ROLE_NAME_TO_KEY: Record<string, Role> = {
  'System Admin': 'admin',
  'Operations Manager': 'ops_manager',
  'Finance Manager': 'finance_manager',
  Accountant: 'accountant',
  Technician: 'technician',
  Viewer: 'viewer',
};

export function roleNameToKey(roleName: string): Role {
  return ROLE_NAME_TO_KEY[roleName] ?? 'viewer';
}
