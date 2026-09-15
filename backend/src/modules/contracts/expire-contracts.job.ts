import { AuditService } from '../audit/audit.service.js';
import { StatusEngineService } from '../status-engine/status-engine.service.js';
import { ContractItemModel } from './contract-item.model.js';
import { RentalContractModel } from './contract.model.js';

export interface ExpireContractsResult {
  expired: number;
}

/** FR-006: `Active -> Expired` once `endDate` has passed, then Status Engine recalculation. */
export async function runContractExpiryJob(now: Date = new Date()): Promise<ExpireContractsResult> {
  const candidates = await RentalContractModel.find({ status: 'Active', endDate: { $lt: now } });

  for (const contract of candidates) {
    contract.status = 'Expired';
    await contract.save();

    const items = await ContractItemModel.find({ contractId: contract._id });
    await Promise.all(
      items.map((item) =>
        StatusEngineService.recalculate(String(item.generatorId), {
          reason: `Contract ${contract.number} expired`,
          triggeredBy: 'system',
        }),
      ),
    );

    await AuditService.record({
      action: 'contract.expire',
      actorUserId: null,
      entityType: 'RentalContract',
      entityId: String(contract._id),
      metadata: { endDate: contract.endDate },
    });
  }

  return { expired: candidates.length };
}
