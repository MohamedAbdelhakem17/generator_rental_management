import { GeneratorModel } from '../generators/generator.model.js';
import { MaintenanceScheduleEngineService } from './service.js';

export interface MaintenanceScheduleSweepResult {
  evaluated: number;
}

/**
 * FR-002's scheduled fallback: the on-write trigger (Operation Log create/correct) catches
 * the common case immediately, but this hourly sweep guarantees every generator is
 * eventually re-evaluated even if some future write path forgets to call the engine directly.
 */
export async function runMaintenanceScheduleSweep(): Promise<MaintenanceScheduleSweepResult> {
  const generators = await GeneratorModel.find({ isDeleted: { $ne: true } }).select('_id');

  for (const generator of generators) {
    await MaintenanceScheduleEngineService.evaluateGenerator(String(generator._id));
  }

  return { evaluated: generators.length };
}
