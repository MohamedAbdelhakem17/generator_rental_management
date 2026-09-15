import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import type { TimestampFields } from '../../db/baseSchema.js';

/**
 * Append-only (CLAUDE.md: "Operation/Fuel logs are never deleted") — TASK-016's own API
 * Specification lists only list/create/detail, no update/correct/delete endpoint, so unlike
 * OperationLog this model carries no status/correction fields at all (Open Decision #10: a
 * V1 wrong entry is voided via a future reversing-entry workflow, not built by this task).
 */
export interface FuelLogAttrs extends TimestampFields {
  _id: Types.ObjectId;
  date: Date;
  generatorId: Types.ObjectId;
  projectId: Types.ObjectId;
  liters: number;
  pricePerLiter: Types.Decimal128;
  totalCost: Types.Decimal128;
  operatingHoursRef: number | null;
  consumptionRate: number | null;
}

const fuelLogSchema = new Schema<FuelLogAttrs>(
  {
    date: { type: Date, required: true },
    generatorId: { type: Schema.Types.ObjectId, ref: 'Generator', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    liters: { type: Number, required: true, min: 0.01 },
    pricePerLiter: { type: Schema.Types.Decimal128, required: true },
    totalCost: { type: Schema.Types.Decimal128, required: true },
    operatingHoursRef: { type: Number, default: null },
    consumptionRate: { type: Number, default: null },
  },
  { timestamps: true },
);

fuelLogSchema.index({ generatorId: 1, date: 1 }, { name: 'fuel_logs_generator_date_idx' });
fuelLogSchema.index({ projectId: 1, date: 1 }, { name: 'fuel_logs_project_date_idx' });

export type FuelLogDocument = HydratedDocument<FuelLogAttrs>;
export const FuelLogModel: Model<FuelLogAttrs> = model<FuelLogAttrs>('FuelLog', fuelLogSchema);
