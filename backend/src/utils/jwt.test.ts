import { describe, expect, it } from 'vitest';

import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from './jwt.js';

describe('jwt utility', () => {
  it('signs and verifies an access token, round-tripping role and permissions', () => {
    const token = signAccessToken({ sub: 'user-1', role: 'System Admin', permissions: ['users:manage'] });
    const payload = verifyAccessToken(token);

    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBe('System Admin');
    expect(payload.permissions).toEqual(['users:manage']);
  });

  it('signs and verifies a refresh token, round-tripping the token id', () => {
    const token = signRefreshToken({ sub: 'user-1', tokenId: 'token-abc' });
    const payload = verifyRefreshToken(token);

    expect(payload.sub).toBe('user-1');
    expect(payload.tokenId).toBe('token-abc');
  });

  it('rejects a tampered access token', () => {
    const token = signAccessToken({ sub: 'user-1', role: 'Viewer', permissions: [] });
    const tampered = `${token.slice(0, -1)}x`;

    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it('rejects a refresh token verified as an access token (secrets are distinct)', () => {
    const refreshToken = signRefreshToken({ sub: 'user-1', tokenId: 'token-abc' });

    expect(() => verifyAccessToken(refreshToken)).toThrow();
  });
});
