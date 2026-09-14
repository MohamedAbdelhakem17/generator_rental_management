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
  generators: ['admin', 'ops_manager', 'viewer'],
  customers: ['admin', 'ops_manager', 'finance_manager', 'viewer'],
  projects: ['admin', 'ops_manager', 'finance_manager', 'viewer'],
  contracts: ['admin', 'ops_manager', 'viewer'],
  operations: ['admin', 'ops_manager', 'technician', 'viewer'],
  fuel: ['admin', 'ops_manager', 'technician', 'viewer'],
  maintenance: ['admin', 'ops_manager', 'technician', 'viewer'],
  extracts: ['admin', 'finance_manager', 'accountant', 'viewer'],
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
