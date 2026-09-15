import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import { createBaseSchema, type SoftDeleteFields, type TimestampFields } from '../../db/baseSchema.js';

/** `_id` is declared explicitly — see the comment in `modules/roles/role.model.ts`. */
export interface UserAttrs extends SoftDeleteFields, TimestampFields {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: Types.ObjectId;
  active: boolean;
  lastLoginAt: Date | null;
  /** TASK-015 FR: which generators a Technician may log Operations/Fuel/Maintenance entries
   * for — enforced server-side wherever a task says "Technician (assigned only)". Meaningless
   * for non-Technician roles but harmless to carry on any user. */
  assignedGenerators: Types.ObjectId[];
}

const userSchema = createBaseSchema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
  active: { type: Boolean, default: true },
  lastLoginAt: { type: Date, default: null },
  assignedGenerators: [{ type: Schema.Types.ObjectId, ref: 'Generator' }],
});

userSchema.index({ email: 1 }, { unique: true, name: 'users_email_idx' });
userSchema.index({ role: 1 }, { name: 'users_role_idx' });

export type UserDocument = HydratedDocument<UserAttrs>;
export const UserModel: Model<UserAttrs> = model<UserAttrs>('User', userSchema);
