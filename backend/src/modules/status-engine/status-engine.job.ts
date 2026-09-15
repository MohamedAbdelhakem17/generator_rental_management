import { AuditService } from '../audit/audit.service.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { StatusEngineService } from './status-engine.service.js';

export interface ReconciliationResult {
  recalculated: number;
  driftDetected: number;
}

/**
 * FR-004/Section 21: self-heals drift (e.g. a contract that expired by date with no explicit
 * transition event) and logs every generator whose stored status didn't match the freshly
 * derived one. Run nightly and on-demand via the admin recalculation endpoint.
 */
export async function runStatusReconciliation(): Promise<ReconciliationResult> {
  const generators = await GeneratorModel.find({ isDeleted: { $ne: true } }).select('_id status');
  let driftDetected = 0;

  for (const generator of generators) {
    const generatorId = String(generator._id);
    const before = generator.status;

    const result = await StatusEngineService.recalculate(generatorId, {
      reason: 'Scheduled reconciliation',
      triggeredBy: 'system',
    });

    if (result.changed) {
      driftDetected += 1;
      console.warn(`[status-engine] drift detected for generator ${generatorId}: ${before} -> ${result.status}`);
      await AuditService.record({
        action: 'status-engine.driftDetected',
        actorUserId: null,
        entityType: 'Generator',
        entityId: generatorId,
        metadata: { severity: 'warning', from: before, to: result.status },
      });
    }
  }

  return { recalculated: generators.length, driftDetected };
}
