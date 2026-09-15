/**
 * Wires the Maintenance module into the Status Engine's step-registry (TASK-009 left
 * `OPEN_MAINTENANCE_CHECKS` empty precisely for this module to fill in once it exists).
 * Imported once, for its side effects, from `maintenance.routes.ts`.
 */
import { OPEN_MAINTENANCE_CHECKS } from '../status-engine/status-engine.types.js';
import { MaintenanceModel } from './maintenance.model.js';

const OPEN_STATUSES = ['Open', 'In Progress'];

OPEN_MAINTENANCE_CHECKS.push(async (generatorId) => {
  const count = await MaintenanceModel.countDocuments({ generatorId, status: { $in: OPEN_STATUSES } });
  return count > 0;
});
