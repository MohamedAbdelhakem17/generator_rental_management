import { Schema, model, type InferSchemaType } from 'mongoose';

import type { GeneratorStatus } from '../generators/generator.model.js';

const STATUS_VALUES: GeneratorStatus[] = ['Available', 'Rented', 'Under Maintenance', 'Stopped'];

/**
 * PRD Section 10 (TASK-009): append-only history of every Generator.status transition the
 * engine makes. Never edited or deleted — only ever appended to, mirroring AuditLog.
 */
const statusChangeLogSchema = new Schema(
  {
    generatorId: { type: Schema.Types.ObjectId, ref: 'Generator', required: true },
    from: { type: String, enum: STATUS_VALUES, required: true },
    to: { type: String, enum: STATUS_VALUES, required: true },
    reason: { type: String, default: '', trim: true },
    triggeredBy: { type: String, enum: ['system', 'user'], required: true },
    at: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

statusChangeLogSchema.index({ generatorId: 1, at: -1 }, { name: 'status_change_log_generator_at_idx' });

export type StatusChangeLogDocument = InferSchemaType<typeof statusChangeLogSchema>;
export const StatusChangeLogModel = model('StatusChangeLog', statusChangeLogSchema);
