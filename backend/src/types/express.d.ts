import type { PermissionKey } from '../modules/auth/permissions.js';

// Populated by requireAuth (TASK-006) from a verified access token — never trusted from
// a client-supplied header/claim (Constitution Article V.2). Wrapped in `declare global`
// because this file has a top-level import, which makes it a module — without `global`,
// `declare namespace Express` here would shadow instead of merge with @types/express's.
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        permissions: PermissionKey[];
      };
    }
  }
}

export {};
