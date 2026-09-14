import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './password.js';

describe('password utility', () => {
  it('hashes a password and verifies it correctly', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');

    expect(hash).not.toBe('correct-horse-battery-staple');
    expect(await verifyPassword('correct-horse-battery-staple', hash)).toBe(true);
  });

  it('rejects an incorrect password against a valid hash', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');

    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('produces a different hash each time (unique salt per call)', async () => {
    const hashA = await hashPassword('same-password');
    const hashB = await hashPassword('same-password');

    expect(hashA).not.toBe(hashB);
  });
});
