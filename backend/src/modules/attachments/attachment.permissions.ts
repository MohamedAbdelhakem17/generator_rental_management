import type { PermissionKey } from '../auth/permissions.js';
import { RentalContractModel } from '../contracts/contract.model.js';
import { ExtractModel } from '../extracts/extract.model.js';
import { MaintenanceModel } from '../maintenance/maintenance.model.js';
import type { AttachmentEntityType } from './attachment.model.js';

/** Section 17: attachments inherit the parent entity's own read/write permission — no
 * separate attachment-specific role. */
export const ENTITY_PERMISSIONS: Record<AttachmentEntityType, { read: PermissionKey; write: PermissionKey }> = {
  Maintenance: { read: 'maintenance:read', write: 'maintenance:write' },
  Contract: { read: 'contracts:read', write: 'contracts:write' },
  Extract: { read: 'extracts:read', write: 'extracts:create' },
};

const ENTITY_MODELS = {
  Maintenance: MaintenanceModel,
  Contract: RentalContractModel,
  Extract: ExtractModel,
} as const;

/** Section 16: `entityType`/`entityId` must reference an existing document. */
export async function entityExists(entityType: AttachmentEntityType, entityId: string): Promise<boolean> {
  const exists = await ENTITY_MODELS[entityType].exists({ _id: entityId });
  return exists !== null;
}
