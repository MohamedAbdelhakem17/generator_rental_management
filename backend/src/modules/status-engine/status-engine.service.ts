import type { CommercialStatus, GeneratorStatus, ManualStatus } from '../generators/generator.model.js';

export interface StatusDerivationResult {
  status: GeneratorStatus;
  commercialStatus: CommercialStatus;
}

/**
 * Minimal seed ahead of TASK-009 (mirrors the audit-engine precedent from TASK-006): TASK-008
 * needs somewhere to delegate status derivation to (Section 11 — "never recomputes status
 * locally"), but Contract (TASK-012) and Maintenance (TASK-018) don't exist yet, so only rows
 * 1 and 4 of the Section 6.1 priority table (manual Stopped vs. Available) are derivable today.
 * TASK-009 replaces `derive` with the full 5-row truth table (active contracts, open
 * maintenance), adds `StatusChangeLog`, and the reconciliation job — callers here (this
 * module's `service.ts`) will keep calling `StatusEngineService.recalculate`, not this shape.
 */
export const StatusEngineService = {
  derive(manualStatus: ManualStatus): StatusDerivationResult {
    if (manualStatus === 'Stopped') {
      return { status: 'Stopped', commercialStatus: 'Unassigned' };
    }
    return { status: 'Available', commercialStatus: 'Unassigned' };
  },
};
