import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Backs refresh-token rotation and reuse detection (FR-005, Section 19). Not built on
 * `createBaseSchema` — this is session/security bookkeeping, not entity history subject
 * to soft delete; expired rows are reaped via the TTL index below.
 */
const refreshTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

refreshTokenSchema.index({ tokenId: 1 }, { unique: true, name: 'refreshtokens_tokenId_idx' });
refreshTokenSchema.index({ user: 1 }, { name: 'refreshtokens_user_idx' });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'refreshtokens_expiresAt_ttl_idx' });

export type RefreshTokenDocument = InferSchemaType<typeof refreshTokenSchema>;
export const RefreshTokenModel = model('RefreshToken', refreshTokenSchema);
