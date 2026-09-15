import type { CommercialStatus, GeneratorDocument, GeneratorStatus } from '../generators/generator.model.js';

export interface StatusDerivationResult {
  status: GeneratorStatus;
  commercialStatus: CommercialStatus;
}

export type TriggeredBy = 'system' | 'user';

export interface RecalculateMeta {
  reason?: string;
  triggeredBy: TriggeredBy;
}

export interface RecalculateResult extends StatusDerivationResult {
  changed: boolean;
  generator: GeneratorDocument;
}

/**
 * Extension points TASK-012 (Contracts) and TASK-018 (Maintenance) register into once their
 * models exist, mirroring `generators/deactivation-guards.ts`'s step-registry — the status
 * engine derives status from these signals without ever importing collections it doesn't own.
 */
export type ActiveContractCheck = (generatorId: string) => Promise<boolean>;
export type OpenMaintenanceCheck = (generatorId: string) => Promise<boolean>;

export const ACTIVE_CONTRACT_CHECKS: ActiveContractCheck[] = [];
/**
 * Edge case (Section 20): if more than one check (or a single check backed by more than one
 * Open/In-Progress record) reports true, the caller is responsible for treating the most
 * recent record as authoritative and logging a data-integrity warning — the engine itself
 * only needs the boolean.
 */
export const OPEN_MAINTENANCE_CHECKS: OpenMaintenanceCheck[] = [];
