import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import type { TimestampFields } from '../../db/baseSchema.js';

export type OperationLogStatus = 'Active' | 'Superseded';

/**
 * Never soft-deleted (CLAUDE.md: "Operation/Fuel logs are never deleted — only superseded
 * or reversed") — `status` is this collection's own lifecycle flag, not `isDeleted`, so this
 * model deliberately doesn't use `createBaseSchema`.
 */
export interface OperationLogAttrs extends TimestampFields {
  _id: Types.ObjectId;
  date: Date;
  projectId: Types.ObjectId;
  generatorId: Types.ObjectId;
  startMeter: number;
  endMeter: number;
  operatingHours: number;
  downtimeHours: number;
  notes: string;
  status: OperationLogStatus;
  correctionOf: Types.ObjectId | null;
  correctionReason: string;
}

const operationLogSchema = new Schema<OperationLogAttrs>(
  {
    date: { type: Date, required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    generatorId: { type: Schema.Types.ObjectId, ref: 'Generator', required: true },
    startMeter: { type: Number, required: true, min: 0 },
    endMeter: { type: Number, required: true },
    operatingHours: { type: Number, required: true },
    downtimeHours: { type: Number, default: 0, min: 0, max: 24 },
    notes: { type: String, default: '', trim: true, maxlength: 500 },
    status: { type: String, enum: ['Active', 'Superseded'], default: 'Active' },
    correctionOf: { type: Schema.Types.ObjectId, ref: 'OperationLog', default: null },
    correctionReason: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
      validate: {
        validator: function validateCorrectionReason(this: { correctionOf: Types.ObjectId | null }, value: string): boolean {
          return this.correctionOf === null || value.trim().length > 0;
        },
        message: 'correctionReason is required when correctionOf is set',
      },
    },
  },
  { timestamps: true },
);

operationLogSchema.index({ generatorId: 1, date: 1 }, { name: 'operation_logs_generator_date_idx' });
operationLogSchema.index({ projectId: 1, date: 1 }, { name: 'operation_logs_project_date_idx' });
operationLogSchema.index({ status: 1 }, { name: 'operation_logs_status_idx' });

export type OperationLogDocument = HydratedDocument<OperationLogAttrs>;
export const OperationLogModel: Model<OperationLogAttrs> = model<OperationLogAttrs>(
  'OperationLog',
  operationLogSchema,
);
