import { NotFoundError } from '../../utils/AppError.js';
import { GeneratorModel, type GeneratorDocument, type ManualStatus } from '../generators/generator.model.js';
import { StatusChangeLogModel } from './status-change-log.model.js';
import {
  ACTIVE_CONTRACT_CHECKS,
  OPEN_MAINTENANCE_CHECKS,
  type RecalculateMeta,
  type RecalculateResult,
  type StatusDerivationResult,
} from './status-engine.types.js';

async function hasActiveContract(generatorId: string): Promise<boolean> {
  for (const check of ACTIVE_CONTRACT_CHECKS) {
    if (await check(generatorId)) return true;
  }
  return false;
}

async function hasOpenMaintenance(generatorId: string): Promise<boolean> {
  for (const check of OPEN_MAINTENANCE_CHECKS) {
    if (await check(generatorId)) return true;
  }
  return false;
}

/**
 * Business Rule 6.1's conflict-resolution table, as one pure function so every one of its
 * 5 rows (and the remaining input combinations they generalize) has exactly one owner.
 * `commercialStatus` is intentionally independent of `manualStatus`/maintenance — it reflects
 * only whether an active contract exists, per the "commercial vs. operational status" rule.
 */
export function computeStatus(
  manualStatus: ManualStatus,
  hasActiveContractInput: boolean,
  hasOpenMaintenanceInput: boolean,
): StatusDerivationResult {
  const commercialStatus = hasActiveContractInput ? 'Assigned' : 'Unassigned';

  if (manualStatus === 'Stopped') {
    return { status: 'Stopped', commercialStatus };
  }
  if (hasActiveContractInput) {
    return { status: 'Rented', commercialStatus };
  }
  if (hasOpenMaintenanceInput) {
    return { status: 'Under Maintenance', commercialStatus };
  }
  return { status: 'Available', commercialStatus };
}

export const StatusEngineService = {
  computeStatus,

  /**
   * FR-001/FR-002/FR-003: the single write path for `Generator.status`/`commercialStatus`.
   * Always re-reads the generator fresh (Section 19) rather than trusting a caller-held
   * document, so a recalculation triggered by a concurrent contract/maintenance write can't
   * clobber a status derived from stale data.
   */
  async recalculate(generatorId: string, meta: RecalculateMeta): Promise<RecalculateResult> {
    const generator: GeneratorDocument | null = await GeneratorModel.findOne({
      _id: generatorId,
      isDeleted: { $ne: true },
    });
    if (!generator) {
      throw new NotFoundError('Generator not found');
    }

    const [activeContract, openMaintenance] = await Promise.all([
      hasActiveContract(generatorId),
      hasOpenMaintenance(generatorId),
    ]);

    const { status, commercialStatus } = computeStatus(generator.manualStatus, activeContract, openMaintenance);
    const changed = status !== generator.status || commercialStatus !== generator.commercialStatus;

    if (changed) {
      const from = generator.status;
      generator.status = status;
      generator.commercialStatus = commercialStatus;
      await generator.save();

      await StatusChangeLogModel.create({
        generatorId: generator._id,
        from,
        to: status,
        reason: meta.reason ?? '',
        triggeredBy: meta.triggeredBy,
      });

      // Business Rule 6.1: "stopped while commercially assigned" is a warning notification
      // dispatched via the Notification Engine (TASK-026), which doesn't exist yet — wired
      // in then (same deferred pattern as generator.service.ts's stop()).
    }

    return { status, commercialStatus, changed, generator };
  },

  /** Section 13: the Generator Profile Overview tab's "Status History" list, most recent first. */
  async getHistory(generatorId: string, limit = 20) {
    return StatusChangeLogModel.find({ generatorId }).sort({ at: -1 }).limit(limit).exec();
  },
};
