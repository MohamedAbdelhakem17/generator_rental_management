/**
 * Wires Operation Logs into the Pricing Engine's operating-hours registry (TASK-014), which
 * was left as an empty step-registry precisely for this module to fill in once it exists.
 * Imported once, for its side effects, from `operation-log.routes.ts`.
 */
import { OPERATING_HOURS_PROVIDERS } from '../contract-pricing-engine/operating-hours-provider.js';
import { OperationLogModel } from './operation-log.model.js';

OPERATING_HOURS_PROVIDERS.push(async (generatorId, projectId, periodStart, periodEnd) => {
  // FR-004/Section 20: only non-superseded ("Active") logs count, avoiding double-counting
  // a corrected entry alongside the record it replaced.
  const logs = await OperationLogModel.find({
    generatorId,
    projectId,
    status: 'Active',
    date: { $gte: periodStart, $lte: periodEnd },
  });

  return {
    hours: logs.reduce((total, log) => total + log.operatingHours, 0),
    operationLogIds: logs.map((log) => String(log._id)),
  };
});
