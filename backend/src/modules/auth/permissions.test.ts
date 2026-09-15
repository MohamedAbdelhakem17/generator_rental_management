import { describe, expect, it } from 'vitest';

import { PERMISSION_KEYS, ROLE_NAMES, ROLE_PERMISSIONS, isPermissionKey } from './permissions.js';

describe('permission matrix (PRD Section 7.2)', () => {
  it('gives System Admin every known permission', () => {
    expect(ROLE_PERMISSIONS['System Admin']).toEqual(expect.arrayContaining([...PERMISSION_KEYS]));
    expect(ROLE_PERMISSIONS['System Admin']).toHaveLength(PERMISSION_KEYS.length);
  });

  it('restricts Viewer to read-only permissions', () => {
    const viewerPermissions = ROLE_PERMISSIONS.Viewer;
    expect(viewerPermissions.every((key) => key.endsWith(':read'))).toBe(true);
  });

  it('grants Operations Manager the generator override permission, but not Finance Manager', () => {
    expect(ROLE_PERMISSIONS['Operations Manager']).toContain('generators:override');
    expect(ROLE_PERMISSIONS['Finance Manager']).not.toContain('generators:override');
  });

  it('grants only Admin and Finance Manager access to extract approval', () => {
    expect(ROLE_PERMISSIONS['System Admin']).toContain('extracts:approve');
    expect(ROLE_PERMISSIONS['Finance Manager']).toContain('extracts:approve');
    expect(ROLE_PERMISSIONS.Accountant).not.toContain('extracts:approve');
    expect(ROLE_PERMISSIONS.Accountant).toContain('extracts:create');
  });

  it('restricts user/role management to System Admin only', () => {
    for (const role of ROLE_NAMES) {
      if (role === 'System Admin') continue;
      expect(ROLE_PERMISSIONS[role]).not.toContain('users:manage');
      expect(ROLE_PERMISSIONS[role]).not.toContain('roles:manage');
    }
  });

  it('restricts audit log access to System Admin only', () => {
    for (const role of ROLE_NAMES) {
      if (role === 'System Admin') continue;
      expect(ROLE_PERMISSIONS[role]).not.toContain('audit:read');
    }
  });

  it('restricts forced status-engine recalculation to System Admin only (TASK-009 Section 17)', () => {
    for (const role of ROLE_NAMES) {
      if (role === 'System Admin') continue;
      expect(ROLE_PERMISSIONS[role]).not.toContain('status-engine:recalculate');
    }
  });

  it('restricts the Shared Assignment override to System Admin only (TASK-013 Section 17)', () => {
    for (const role of ROLE_NAMES) {
      if (role === 'System Admin') continue;
      expect(ROLE_PERMISSIONS[role]).not.toContain('contracts:sharedAssignmentOverride');
    }
  });

  it('grants rent preview to Admin/Finance Manager/Accountant only, not Ops Manager (TASK-014 Section 17)', () => {
    expect(ROLE_PERMISSIONS['System Admin']).toContain('contracts:previewRent');
    expect(ROLE_PERMISSIONS['Finance Manager']).toContain('contracts:previewRent');
    expect(ROLE_PERMISSIONS.Accountant).toContain('contracts:previewRent');
    expect(ROLE_PERMISSIONS['Operations Manager']).not.toContain('contracts:previewRent');
    expect(ROLE_PERMISSIONS.Viewer).not.toContain('contracts:previewRent');
  });

  it('grants operation log correction to Admin/Ops Manager only, not Technician (TASK-015 Section 17)', () => {
    expect(ROLE_PERMISSIONS['System Admin']).toContain('operations:correct');
    expect(ROLE_PERMISSIONS['Operations Manager']).toContain('operations:correct');
    expect(ROLE_PERMISSIONS.Technician).not.toContain('operations:correct');
    expect(ROLE_PERMISSIONS.Technician).toContain('operations:write');
  });

  it('grants fuel View to every role except no one is excluded from read (TASK-016 Section 17)', () => {
    for (const role of ROLE_NAMES) {
      expect(ROLE_PERMISSIONS[role]).toContain('fuel:read');
    }
    expect(ROLE_PERMISSIONS.Technician).toContain('fuel:write');
    expect(ROLE_PERMISSIONS['Finance Manager']).not.toContain('fuel:write');
    expect(ROLE_PERMISSIONS.Accountant).not.toContain('fuel:write');
  });

  it('restricts fuel alert visibility to Admin/Ops Manager/Technician, and resolution to Admin/Ops Manager (TASK-017 Section 17)', () => {
    for (const role of ['Finance Manager', 'Accountant', 'Viewer'] as const) {
      expect(ROLE_PERMISSIONS[role]).not.toContain('fuel-alerts:read');
    }
    expect(ROLE_PERMISSIONS.Technician).toContain('fuel-alerts:acknowledge');
    expect(ROLE_PERMISSIONS.Technician).not.toContain('fuel-alerts:resolve');
    expect(ROLE_PERMISSIONS['Operations Manager']).toContain('fuel-alerts:resolve');
  });

  it('identifies valid vs. invalid permission keys', () => {
    expect(isPermissionKey('users:manage')).toBe(true);
    expect(isPermissionKey('not:a-real-permission')).toBe(false);
  });
});
