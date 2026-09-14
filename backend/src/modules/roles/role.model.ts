import { model, type HydratedDocument, type Model, type Types } from 'mongoose';

import { createBaseSchema, type SoftDeleteFields, type TimestampFields } from '../../db/baseSchema.js';
import { PERMISSION_KEYS, type PermissionKey } from '../auth/permissions.js';

/**
 * `_id` is declared here (rather than relying on `HydratedDocument` to add it) so that
 * `paginateQuery`'s plain-attrs return type — see `services/pagination.ts` — still carries
 * an id: list results are `RoleAttrs[]`, not hydrated documents, per that module's contract.
 */
export interface RoleAttrs extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  name: string;
  permissions: PermissionKey[];
}

const roleSchema = createBaseSchema({
  name: { type: String, required: true, trim: true },
  permissions: {
    type: [{ type: String, enum: PERMISSION_KEYS }],
    default: [],
  },
});

roleSchema.index({ name: 1 }, { unique: true, name: 'roles_name_idx' });

export type RoleDocument = HydratedDocument<RoleAttrs>;
export const RoleModel: Model<RoleAttrs> = model<RoleAttrs>('Role', roleSchema);
