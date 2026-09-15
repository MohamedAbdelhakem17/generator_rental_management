/**
 * Section 19/25: closing a project is blocked while it has active contracts (TASK-012,
 * doesn't exist yet) — same step-registry pattern as `generators/deactivation-guards.ts` and
 * `customers/deactivation-guards.ts`. TASK-012 pushes a guard into this once Contracts exist,
 * rather than ProjectService reaching into a collection it doesn't own.
 */
export type CloseGuard = (projectId: string) => Promise<string | null>;

export const CLOSE_GUARDS: CloseGuard[] = [];

export async function findCloseBlockReason(projectId: string): Promise<string | null> {
  for (const guard of CLOSE_GUARDS) {
    const reason = await guard(projectId);
    if (reason) return reason;
  }
  return null;
}
