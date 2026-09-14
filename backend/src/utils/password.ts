import bcrypt from 'bcryptjs';

import { env } from '../config/env.js';

/** Cost factor is env-configurable per TASK-006 Scope; never hardcoded. */
export async function hashPassword(plainPassword: string): Promise<string> {
  const salt = await bcrypt.genSalt(env.BCRYPT_COST);
  return bcrypt.hash(plainPassword, salt);
}

export async function verifyPassword(plainPassword: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}
