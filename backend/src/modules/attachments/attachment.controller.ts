import type { Request, Response } from 'express';

import { ForbiddenError } from '../../utils/AppError.js';
import { successResponse } from '../../utils/responseEnvelope.js';
import { idParamSchema, parseOrThrow } from '../../utils/validate.js';
import { ENTITY_PERMISSIONS } from './attachment.permissions.js';
import { AttachmentService } from './attachment.service.js';
import { listAttachmentsQuerySchema, uploadAttachmentSchema } from './attachment.validation.js';

function toAttachmentResponse(attachment: {
  _id: unknown;
  entityType: string;
  entityId: unknown;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedBy: unknown;
  createdAt: Date;
}) {
  return {
    id: String(attachment._id),
    entityType: attachment.entityType,
    entityId: String(attachment.entityId),
    fileName: attachment.fileName,
    fileType: attachment.fileType,
    fileSize: attachment.fileSize,
    uploadedBy: String(attachment.uploadedBy),
    createdAt: attachment.createdAt,
  };
}

export async function uploadAttachment(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(uploadAttachmentSchema, req.body);
  const requiredPermission = ENTITY_PERMISSIONS[input.entityType].write;
  if (!req.user!.permissions.includes(requiredPermission)) {
    throw new ForbiddenError('You do not have permission to attach files to this entity');
  }

  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) {
    throw new ForbiddenError('No file was uploaded');
  }

  const attachment = await AttachmentService.upload({
    entityType: input.entityType,
    entityId: input.entityId,
    file: { buffer: file.buffer, originalname: file.originalname, size: file.size },
    uploadedBy: req.user!.id,
  });

  res.status(201).json(successResponse(toAttachmentResponse(attachment)));
}

export async function listAttachments(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(listAttachmentsQuerySchema, req.query);
  const requiredPermission = ENTITY_PERMISSIONS[query.entityType].read;
  if (!req.user!.permissions.includes(requiredPermission)) {
    throw new ForbiddenError('You do not have permission to view attachments for this entity');
  }

  const result = await AttachmentService.list(query.entityType, query.entityId);
  res
    .status(200)
    .json(successResponse(result.items.map(toAttachmentResponse), null, result.meta));
}

export async function downloadAttachment(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const { attachment, buffer } = await AttachmentService.getForDownload(id);

  const requiredPermission = ENTITY_PERMISSIONS[attachment.entityType].read;
  if (!req.user!.permissions.includes(requiredPermission)) {
    throw new ForbiddenError('You do not have permission to view attachments for this entity');
  }

  res.setHeader('Content-Disposition', `attachment; filename="${attachment.fileName}"`);
  res.send(buffer);
}

export async function deleteAttachment(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  await AttachmentService.remove(id, { userId: req.user!.id, roleName: req.user!.role });
  res.status(200).json(successResponse({ id }));
}
