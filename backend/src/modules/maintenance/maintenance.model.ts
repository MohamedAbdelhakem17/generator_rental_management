import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import type { TimestampFields } from '../../db/baseSchema.js';

export type MaintenanceType = 'Preventive' | 'Corrective';
export type MaintenanceStatus = 'Open' | 'In Progress' | 'Completed' | 'Cancelled';

/**
 * A mutable lifecycle record (Open → In Progress → Completed/Cancelled), unlike
 * OperationLog/FuelLog's append-only history — Section 12 exposes a PATCH for cost/notes
 * edits while Open/In Progress, so this model carries no soft-delete or correction fields.
 */
export interface MaintenanceAttrs extends TimestampFields {
  _id: Types.ObjectId;
  generatorId: Types.ObjectId;
  type: MaintenanceType;
  status: MaintenanceStatus;
  date: Date;
  meter: number;
  partsCost: Types.Decimal128;
  oilCost: Types.Decimal128;
  laborCost: Types.Decimal128;
  transportCost: Types.Decimal128;
  totalCost: Types.Decimal128;
  maintenanceCycleOverride: number | null;
  nextMaintenanceMeter: number | null;
  notes: string;
  cancelReason: string;
}

const maintenanceSchema = new Schema<MaintenanceAttrs>(
  {
    generatorId: { type: Schema.Types.ObjectId, ref: 'Generator', required: true },
    type: { type: String, enum: ['Preventive', 'Corrective'], required: true },
    status: { type: String, enum: ['Open', 'In Progress', 'Completed', 'Cancelled'], default: 'Open' },
    date: { type: Date, required: true },
    meter: { type: Number, required: true, min: 0 },
    partsCost: { type: Schema.Types.Decimal128, required: true, default: '0' },
    oilCost: { type: Schema.Types.Decimal128, required: true, default: '0' },
    laborCost: { type: Schema.Types.Decimal128, required: true, default: '0' },
    transportCost: { type: Schema.Types.Decimal128, required: true, default: '0' },
    totalCost: { type: Schema.Types.Decimal128, required: true },
    maintenanceCycleOverride: { type: Number, default: null, min: 0.01 },
    nextMaintenanceMeter: { type: Number, default: null },
    notes: { type: String, default: '', trim: true, maxlength: 500 },
    cancelReason: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

maintenanceSchema.index({ generatorId: 1, date: 1 }, { name: 'maintenance_generator_date_idx' });
maintenanceSchema.index({ status: 1, type: 1 }, { name: 'maintenance_status_type_idx' });
/** Business Rule 6.6 / FR-002: at most one Open/In Progress record per generator. */
maintenanceSchema.index(
  { generatorId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['Open', 'In Progress'] } },
    name: 'maintenance_generator_open_unique_idx',
  },
);

export type MaintenanceDocument = HydratedDocument<MaintenanceAttrs>;
export const MaintenanceModel: Model<MaintenanceAttrs> = model<MaintenanceAttrs>('Maintenance', maintenanceSchema);
