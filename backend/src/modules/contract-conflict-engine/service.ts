import { ContractItemModel } from '../contracts/contract-item.model.js';
import { RentalContractModel } from '../contracts/contract.model.js';

export interface ConflictMatch {
  contractId: string;
  contractNumber: string;
  startDate: Date;
  endDate: Date;
}

export interface ItemConflict {
  itemIndex: number;
  generatorId: string;
  conflicts: ConflictMatch[];
}

/**
 * Minimal seed ahead of TASK-013 (mirrors the Status Engine precedent from TASK-008): TASK-012
 * needs a hard block on activation (FR-003) today, but the Draft-time soft-check endpoint,
 * the Shared Assignment override, and the full overlap truth-table test suite are TASK-013's
 * own deliverables (Section 27). Only the Active-only, hard-block overlap check — Business
 * Rule 6.9's FR-001 (Active contracts only)/FR-002 (overlap formula)/FR-003 (self-exclusion) —
 * is implemented here. TASK-013 replaces this file with the full service (Draft-time
 * inclusion, `checkContract`'s Shared Assignment exception, the `check-conflict` endpoint).
 */
export const ConflictEngineService = {
  /** Overlap formula (FR-002): `existing.startDate <= new.endDate AND existing.endDate >= new.startDate`. */
  async checkGenerator(
    generatorId: string,
    startDate: Date,
    endDate: Date,
    excludeContractId?: string,
  ): Promise<ConflictMatch[]> {
    const itemContractIds = await ContractItemModel.find({ generatorId }).distinct('contractId');
    if (itemContractIds.length === 0) return [];

    const overlapping = await RentalContractModel.find({
      _id: { $in: itemContractIds, ...(excludeContractId ? { $ne: excludeContractId } : {}) },
      status: 'Active',
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    });

    return overlapping.map((contract) => ({
      contractId: String(contract._id),
      contractNumber: contract.number,
      startDate: contract.startDate,
      endDate: contract.endDate,
    }));
  },

  /** Used at activation: runs `checkGenerator` for every item on the contract. */
  async checkContract(contractId: string): Promise<ItemConflict[]> {
    const items = await ContractItemModel.find({ contractId });
    const contract = await RentalContractModel.findById(contractId);
    if (!contract) return [];

    const results: ItemConflict[] = [];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex]!;
      const conflicts = await this.checkGenerator(
        String(item.generatorId),
        contract.startDate,
        contract.endDate,
        contractId,
      );
      if (conflicts.length > 0) {
        results.push({ itemIndex, generatorId: String(item.generatorId), conflicts });
      }
    }
    return results;
  },
};
