import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import type { TimestampFields } from '../../db/baseSchema.js';

export type MaintenanceAlertLevel = 'Upcoming' | 'Overdue';
export type MaintenanceAlertStatus = 'Open' | 'Acknowledged' | 'Resolved';
export type MaintenanceAlertResolvedBy = 'system' | 'user' | null;

export interface MaintenanceAlertAttrs extends TimestampFields {
  _id: Types.ObjectId;
  generatorId: Types.ObjectId;
  level: MaintenanceAlertLevel;
  status: MaintenanceAlertStatus;
  dueAtMeter: number;
  currentMeterAtCreation: number;
  resolvedAt: Date | null;
  resolvedBy: MaintenanceAlertResolvedBy;
}

const maintenanceAlertSchema = new Schema<MaintenanceAlertAttrs>(
  {
    generatorId: { type: Schema.Types.ObjectId, ref: 'Generator', required: true },
    level: { type: String, enum: ['Upcoming', 'Overdue'], required: true },
    status: { type: String, enum: ['Open', 'Acknowledged', 'Resolved'], default: 'Open' },
    dueAtMeter: { type: Number, required: true },
    currentMeterAtCreation: { type: Number, required: true },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: String, enum: ['system', 'user', null], default: null },
  },
  { timestamps: true },
);

/** FR-003/Section 10: at most one Open/Acknowledged schedule alert per generator — mirrors
 * the Fuel Alert Engine's partial unique index (TASK-017 Business Rule 6.5). */
maintenanceAlertSchema.index(
  { generatorId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['Open', 'Acknowledged'] } },
    name: 'maintenance_alerts_generator_open_unique_idx',
  },
);

export type MaintenanceAlertDocument = HydratedDocument<MaintenanceAlertAttrs>;
export const MaintenanceAlertModel: Model<MaintenanceAlertAttrs> = model<MaintenanceAlertAttrs>(
  'MaintenanceAlert',
  maintenanceAlertSchema,
);
