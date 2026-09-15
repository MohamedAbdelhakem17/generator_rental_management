/**
 * FR-004: deactivating a generator is blocked while it has an active contract or open
 * maintenance record. Neither collection exists yet (TASK-012, TASK-018), so this is a
 * step-registry — the same pattern TASK-007's demo-seed uses — that those tasks push a
 * guard into once their models land, rather than GeneratorService reaching into collections
 * it doesn't own.
 */
export type DeactivationGuard = (generatorId: string) => Promise<string | null>;

export const DEACTIVATION_GUARDS: DeactivationGuard[] = [];

export async function findDeactivationBlockReason(generatorId: string): Promise<string | null> {
  for (const guard of DEACTIVATION_GUARDS) {
    const reason = await guard(generatorId);
    if (reason) return reason;
  }
  return null;
}
