import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import type { TimestampFields } from '../../db/baseSchema.js';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';
export type ExportJobStatus = 'Processing' | 'Ready' | 'Failed';

/**
 * TASK-029 Section 10. No object storage exists in this system (Constitution: no new infra),
 * so the generated file is stored inline as `fileData` rather than at a `downloadUrl` — the
 * spec's `downloadUrl` field becomes this job's own `/api/exports/:jobId/download` route once
 * `status` is `Ready`, not an external URL.
 */
export interface ExportJobAttrs extends TimestampFields {
  _id: Types.ObjectId;
  requestedBy: Types.ObjectId;
  reportType: string;
  filters: Record<string, unknown>;
  format: ExportFormat;
  status: ExportJobStatus;
  fileData: Buffer | null;
  failureReason: string;
  expiresAt: Date;
}

const exportJobSchema = new Schema<ExportJobAttrs>(
  {
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reportType: { type: String, required: true, trim: true },
    filters: { type: Schema.Types.Mixed, default: {} },
    format: { type: String, enum: ['csv', 'xlsx', 'pdf'], required: true },
    status: { type: String, enum: ['Processing', 'Ready', 'Failed'], default: 'Processing' },
    fileData: { type: Buffer, default: null },
    failureReason: { type: String, default: '', trim: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

exportJobSchema.index({ requestedBy: 1, createdAt: -1 }, { name: 'export_jobs_requester_idx' });
exportJobSchema.index({ expiresAt: 1 }, { name: 'export_jobs_expires_idx', expireAfterSeconds: 0 });

export type ExportJobDocument = HydratedDocument<ExportJobAttrs>;
export const ExportJobModel: Model<ExportJobAttrs> = model<ExportJobAttrs>(
  'ExportJob',
  exportJobSchema,
);
