import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import { createBaseSchema, type SoftDeleteFields, type TimestampFields } from '../../db/baseSchema.js';

export const ATTACHMENT_ENTITY_TYPES = ['Maintenance', 'Contract', 'Extract'] as const;
export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];

/** Section 8 FR-001: the allow-listed file types, matched against the upload's extension. */
export const ALLOWED_FILE_TYPES = ['pdf', 'jpg', 'jpeg', 'png', 'docx', 'xlsx'] as const;
export type AllowedFileType = (typeof ALLOWED_FILE_TYPES)[number];

/** Section 8 FR-001: default max upload size — configurable via `ATTACHMENT_MAX_SIZE_MB`. */
export const MAX_FILE_SIZE_BYTES =
  (Number(process.env.ATTACHMENT_MAX_SIZE_MB) || 10) * 1024 * 1024;

export interface AttachmentAttrs extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  entityType: AttachmentEntityType;
  entityId: Types.ObjectId;
  fileName: string;
  fileType: AllowedFileType;
  fileSize: number;
  /** Internal storage-adapter reference — never exposed raw to the client (Section 10). */
  storagePath: string;
  uploadedBy: Types.ObjectId;
}

const attachmentSchema = createBaseSchema({
  entityType: { type: String, enum: ATTACHMENT_ENTITY_TYPES, required: true },
  entityId: { type: Schema.Types.ObjectId, required: true },
  fileName: { type: String, required: true, trim: true, maxlength: 255 },
  fileType: { type: String, enum: ALLOWED_FILE_TYPES, required: true },
  fileSize: { type: Number, required: true, min: 1 },
  storagePath: { type: String, required: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

attachmentSchema.index({ entityType: 1, entityId: 1 }, { name: 'attachments_entity_idx' });

export type AttachmentDocument = HydratedDocument<AttachmentAttrs>;
export const AttachmentModel: Model<AttachmentAttrs> = model<AttachmentAttrs>(
  'Attachment',
  attachmentSchema,
);
