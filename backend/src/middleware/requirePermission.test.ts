import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { requirePermission } from './requirePermission.js';

function buildReq(user?: { id: string; role: string; permissions: string[] }): Request {
  return { user } as unknown as Request;
}

describe('requirePermission', () => {
  it('calls next with an AuthError when req.user is missing (requireAuth did not run)', () => {
    const next = vi.fn();

    requirePermission('users:manage')(buildReq(), {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 401 });
  });

  it('calls next with a ForbiddenError when the role lacks the required permission', () => {
    const next = vi.fn();
    const req = buildReq({ id: 'user-1', role: 'Viewer', permissions: ['generators:read'] });

    requirePermission('generators:write')(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 403 });
  });

  it('calls next() with no error when the role has the required permission', () => {
    const next = vi.fn();
    const req = buildReq({ id: 'user-1', role: 'System Admin', permissions: ['users:manage'] });

    requirePermission('users:manage')(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });
});
