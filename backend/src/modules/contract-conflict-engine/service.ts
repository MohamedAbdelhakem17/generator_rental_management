import type { ContractStatus } from '../contracts/contract.model.js';
import { ContractItemModel } from '../contracts/contract-item.model.js';
import { RentalContractModel } from '../contracts/contract.model.js';

export interface ConflictMatch {
  contractId: string;
  contractNumber: string;
  startDate: Date;
  endDate: Date;
  status: ContractStatus;
}

export interface ItemConflict {
  itemIndex: number;
  generatorId: string;
  conflicts: ConflictMatch[];
}

export interface CheckGeneratorOptions {
  excludeContractId?: string;
  /** FR-001: the Draft-time soft warning also considers other Drafts, informationally only. */
  includeDraft?: boolean;
}

/**
 * Business Rule 6.9. `checkGenerator`/`checkContract` are the two entry points TASK-012 (hard
 * block at activation) and the `check-conflict` endpoint (soft warning at Draft time) both
 * call — neither re-derives the overlap formula.
 */
export const ConflictEngineService = {
  /** Overlap formula (FR-002): `existing.startDate <= new.endDate AND existing.endDate >= new.startDate` (inclusive — Section 20). */
  async checkGenerator(
    generatorId: string,
    startDate: Date,
    endDate: Date,
    options: CheckGeneratorOptions = {},
  ): Promise<ConflictMatch[]> {
    const itemContractIds = await ContractItemModel.find({ generatorId }).distinct('contractId');
    if (itemContractIds.length === 0) return [];

    const statuses: ContractStatus[] = options.includeDraft ? ['Active', 'Draft'] : ['Active'];

    const overlapping = await RentalContractModel.find({
      _id: { $in: itemContractIds, ...(options.excludeContractId ? { $ne: options.excludeContractId } : {}) },
      status: { $in: statuses },
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    });

    return overlapping.map((contract) => ({
      contractId: String(contract._id),
      contractNumber: contract.number,
      startDate: contract.startDate,
      endDate: contract.endDate,
      status: contract.status,
    }));
  },

  /**
   * Used at activation (hard block, Active-only — TASK-012 FR-003): runs `checkGenerator` for
   * every item, skipping items with an approved Shared Assignment exception (FR-004).
   */
  async checkContract(contractId: string): Promise<ItemConflict[]> {
    const items = await ContractItemModel.find({ contractId });
    const contract = await RentalContractModel.findById(contractId);
    if (!contract) return [];

    const results: ItemConflict[] = [];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex]!;
      if (item.isSharedAssignmentException) continue;

      const conflicts = await this.checkGenerator(String(item.generatorId), contract.startDate, contract.endDate, {
        excludeContractId: contractId,
      });
      if (conflicts.length > 0) {
        results.push({ itemIndex, generatorId: String(item.generatorId), conflicts });
      }
    }
    return results;
  },
};
