import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { signAccessToken } from '../utils/jwt.js';
import { requireAuth } from './requireAuth.js';

function buildReq(cookieValue?: string): Request {
  return { cookies: cookieValue ? { access_token: cookieValue } : {} } as unknown as Request;
}

describe('requireAuth', () => {
  it('calls next with an AuthError when no access token cookie is present', () => {
    const next = vi.fn();

    requireAuth(buildReq(), {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 401 });
  });

  it('calls next with an AuthError for an invalid/tampered token', () => {
    const next = vi.fn();

    requireAuth(buildReq('not-a-real-token'), {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 401 });
  });

  it('populates req.user and calls next() with no error for a valid token', () => {
    const token = signAccessToken({ sub: 'user-1', role: 'System Admin', permissions: ['users:manage'] });
    const req = buildReq(token);
    const next = vi.fn();

    requireAuth(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({ id: 'user-1', role: 'System Admin', permissions: ['users:manage'] });
  });
});
