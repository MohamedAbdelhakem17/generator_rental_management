import { z } from 'zod';

import { ATTACHMENT_ENTITY_TYPES } from './attachment.model.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const uploadAttachmentSchema = z.object({
  entityType: z.enum(ATTACHMENT_ENTITY_TYPES),
  entityId: objectId,
});

export const listAttachmentsQuerySchema = z.object({
  entityType: z.enum(ATTACHMENT_ENTITY_TYPES),
  entityId: objectId,
});

export type UploadAttachmentInput = z.infer<typeof uploadAttachmentSchema>;
export type ListAttachmentsQuery = z.infer<typeof listAttachmentsQuerySchema>;
