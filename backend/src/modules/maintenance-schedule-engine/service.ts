import { NotFoundError } from '../../utils/AppError.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { MaintenanceModel } from '../maintenance/maintenance.model.js';

/**
 * Minimal seed ahead of TASK-019: owns Business Rule 6.6's `nextMaintenanceMeter` formula
 * (FR-001) so TASK-018 has one place to call on every completion, rather than re-deriving it.
 * TASK-019 extends this module with the Upcoming/Overdue alert job — out of scope here.
 */
export const MaintenanceScheduleEngineService = {
  async computeNext(maintenanceId: string): Promise<number> {
    const record = await MaintenanceModel.findById(maintenanceId);
    if (!record) {
      throw new NotFoundError('Maintenance record not found');
    }
    const generator = await GeneratorModel.findById(record.generatorId);
    if (!generator) {
      throw new NotFoundError('Generator not found');
    }

    const cycle = record.maintenanceCycleOverride ?? generator.maintenanceCycleHours;
    const nextMaintenanceMeter = record.meter + cycle;

    record.nextMaintenanceMeter = nextMaintenanceMeter;
    await record.save();

    return nextMaintenanceMeter;
  },
};
