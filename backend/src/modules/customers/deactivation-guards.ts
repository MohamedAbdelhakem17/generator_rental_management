/**
 * FR-002: deactivating a customer is blocked while it has an outstanding positive balance
 * (Customer Ledger Engine, TASK-023) or an active contract (TASK-012). Neither exists yet,
 * so this is the same step-registry pattern as `generators/deactivation-guards.ts` — those
 * tasks push a guard into this once their models/engines land, rather than CustomerService
 * reaching into collections/engines it doesn't own.
 */
export type DeactivationGuard = (customerId: string) => Promise<string | null>;

export const DEACTIVATION_GUARDS: DeactivationGuard[] = [];

export async function findDeactivationBlockReason(customerId: string): Promise<string | null> {
  for (const guard of DEACTIVATION_GUARDS) {
    const reason = await guard(customerId);
    if (reason) return reason;
  }
  return null;
}
