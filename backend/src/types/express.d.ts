// Minimal shape populated by auth middleware (TASK-006). Kept intentionally small here;
// TASK-006 owns the full authenticated-user type.
declare namespace Express {
  interface Request {
    user?: {
      id: string;
    };
  }
}
