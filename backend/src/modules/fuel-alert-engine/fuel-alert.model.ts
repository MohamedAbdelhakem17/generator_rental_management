import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import type { TimestampFields } from '../../db/baseSchema.js';

export type FuelAlertSeverity = 'Warning' | 'Critical';
export type FuelAlertStatus = 'Open' | 'Acknowledged' | 'Resolved';
export type ResolvedBy = 'system' | 'user' | null;

export interface FuelAlertAttrs extends TimestampFields {
  _id: Types.ObjectId;
  generatorId: Types.ObjectId;
  severity: FuelAlertSeverity;
  status: FuelAlertStatus;
  firstOccurrenceAt: Date;
  lastOccurrenceAt: Date;
  occurrenceCount: number;
  triggeringFuelLogId: Types.ObjectId;
  resolutionNote: string;
  resolvedAt: Date | null;
  resolvedBy: ResolvedBy;
}

const fuelAlertSchema = new Schema<FuelAlertAttrs>(
  {
    generatorId: { type: Schema.Types.ObjectId, ref: 'Generator', required: true },
    severity: { type: String, enum: ['Warning', 'Critical'], required: true },
    status: { type: String, enum: ['Open', 'Acknowledged', 'Resolved'], default: 'Open' },
    firstOccurrenceAt: { type: Date, default: Date.now },
    lastOccurrenceAt: { type: Date, default: Date.now },
    occurrenceCount: { type: Number, default: 1, min: 1 },
    triggeringFuelLogId: { type: Schema.Types.ObjectId, ref: 'FuelLog', required: true },
    resolutionNote: {
      type: String,
      default: '',
      trim: true,
      validate: {
        validator: function validateResolutionNote(this: { status: FuelAlertStatus; resolvedBy: ResolvedBy }, value: string): boolean {
          // Manual resolution requires a note (FR-004); system auto-resolution supplies its
          // own standard note in code, so this only guards the human path.
          if (this.status !== 'Resolved' || this.resolvedBy !== 'user') return true;
          return value.trim().length > 0;
        },
        message: 'resolutionNote is required to manually resolve an alert',
      },
    },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: String, enum: ['system', 'user', null], default: null },
  },
  { timestamps: true },
);

// DoD: "at most one Open/Acknowledged alert per generator" enforced at the database level,
// not just in application logic — a partial unique index only covers documents matching the
// filter, so Resolved (terminal) alerts never collide with a later new Open one (Section 20).
fuelAlertSchema.index(
  { generatorId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['Open', 'Acknowledged'] } },
    name: 'fuel_alerts_generator_open_unique_idx',
  },
);

export type FuelAlertDocument = HydratedDocument<FuelAlertAttrs>;
export const FuelAlertModel: Model<FuelAlertAttrs> = model<FuelAlertAttrs>('FuelAlert', fuelAlertSchema);
