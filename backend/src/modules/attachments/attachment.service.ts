import { paginateQuery, type PaginatedResult } from '../../services/pagination.js';
import { LocalDiskStorageAdapter } from '../../services/storage/local-disk-storage.js';
import type { StorageAdapter } from '../../services/storage/storage-adapter.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError.js';
import { AuditService } from '../audit/audit.service.js';
import { ROLE_NAMES } from '../auth/permissions.js';
import { entityExists } from './attachment.permissions.js';
import {
  ALLOWED_FILE_TYPES,
  AttachmentModel,
  MAX_FILE_SIZE_BYTES,
  type AllowedFileType,
  type AttachmentAttrs,
  type AttachmentDocument,
  type AttachmentEntityType,
} from './attachment.model.js';

const ADMIN_ROLE_NAME: (typeof ROLE_NAMES)[number] = 'System Admin';

export interface UploadAttachmentInput {
  entityType: AttachmentEntityType;
  entityId: string;
  file: { buffer: Buffer; originalname: string; size: number };
  uploadedBy: string;
}

function extensionOf(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function assertAllowedFile(file: { originalname: string; size: number }): AllowedFileType {
  const extension = extensionOf(file.originalname);
  if (!(ALLOWED_FILE_TYPES as readonly string[]).includes(extension)) {
    throw new ValidationError('Validation failed', [
      { field: 'file', message: `File type ".${extension}" is not allowed. Allowed: ${ALLOWED_FILE_TYPES.join(', ')}` },
    ]);
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new ValidationError('Validation failed', [
      { field: 'file', message: `File exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit` },
    ]);
  }
  return extension as AllowedFileType;
}

/** `storage` is injected (Section 28 DoD: swappable without touching this service's logic) —
 * defaults to the local-disk adapter for the app's real instance; tests inject
 * `InMemoryStorageAdapter` instead. */
export function createAttachmentService(storage: StorageAdapter) {
  return {
    async upload(input: UploadAttachmentInput): Promise<AttachmentDocument> {
      if (!(await entityExists(input.entityType, input.entityId))) {
        throw new ValidationError('Validation failed', [
          { field: 'entityId', message: `${input.entityType} does not exist` },
        ]);
      }

      const fileType = assertAllowedFile(input.file);
      const { storagePath } = await storage.save({
        buffer: input.file.buffer,
        originalName: input.file.originalname,
      });

      const attachment = await AttachmentModel.create({
        entityType: input.entityType,
        entityId: input.entityId,
        fileName: input.file.originalname,
        fileType,
        fileSize: input.file.size,
        storagePath,
        uploadedBy: input.uploadedBy,
      });

      await AuditService.record({
        action: 'attachment.upload',
        actorUserId: input.uploadedBy,
        entityType: input.entityType,
        entityId: input.entityId,
        after: { fileName: attachment.fileName, attachmentId: String(attachment._id) },
      });

      return attachment;
    },

    async list(entityType: AttachmentEntityType, entityId: string): Promise<PaginatedResult<AttachmentAttrs>> {
      return paginateQuery<AttachmentAttrs>(AttachmentModel, { entityType, entityId }, {
        sort: '-createdAt',
        allowedSortFields: ['createdAt'],
        limit: 100,
      });
    },

    async getForDownload(attachmentId: string): Promise<{ attachment: AttachmentDocument; buffer: Buffer }> {
      const attachment = await AttachmentModel.findOne({ _id: attachmentId, isDeleted: { $ne: true } });
      if (!attachment) {
        throw new NotFoundError('Attachment not found');
      }
      const buffer = await storage.read(attachment.storagePath);
      return { attachment, buffer };
    },

    /** FR-003: soft delete for Extract/Contract (audit-retention entities); an Admin may hard
     * delete a Maintenance attachment. Section 17: uploader or Admin. */
    async remove(attachmentId: string, actor: { userId: string; roleName: string }): Promise<void> {
      const attachment = await AttachmentModel.findById(attachmentId);
      if (!attachment) {
        throw new NotFoundError('Attachment not found');
      }

      const isAdmin = actor.roleName === ADMIN_ROLE_NAME;
      const isUploader = String(attachment.uploadedBy) === actor.userId;
      if (!isAdmin && !isUploader) {
        throw new ForbiddenError('Only the uploader or an Admin can delete this attachment');
      }

      if (attachment.entityType === 'Maintenance' && isAdmin) {
        await storage.delete(attachment.storagePath);
        await attachment.deleteOne();
      } else {
        attachment.isDeleted = true;
        attachment.deletedAt = new Date();
        await attachment.save();
      }

      await AuditService.record({
        action: 'attachment.delete',
        actorUserId: actor.userId,
        entityType: attachment.entityType,
        entityId: String(attachment.entityId),
        before: { fileName: attachment.fileName },
      });
    },
  };
}

export const AttachmentService = createAttachmentService(new LocalDiskStorageAdapter());
