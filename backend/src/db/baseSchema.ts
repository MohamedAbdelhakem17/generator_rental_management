import { Schema, type SchemaDefinition, type SchemaOptions } from 'mongoose';

export const softDeleteFields = {
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
} satisfies SchemaDefinition;

/**
 * Every collection referenced by financial/operational history is built on this: adds
 * createdAt/updatedAt via `timestamps` plus the soft-delete flag pair, per PRD Section 12.
 */
export function createBaseSchema<T extends SchemaDefinition>(
  definition: T,
  options: SchemaOptions = {},
): Schema {
  return new Schema(
    { ...definition, ...softDeleteFields },
    { timestamps: true, ...options },
  );
}
