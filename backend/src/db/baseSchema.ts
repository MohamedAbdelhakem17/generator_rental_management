import { Schema, type SchemaDefinition, type SchemaOptions } from 'mongoose';

export const softDeleteFields = {
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
} satisfies SchemaDefinition;

/** Mix into a model's own attributes interface: `MyAttrs & SoftDeleteFields & TimestampFields`. */
export interface SoftDeleteFields {
  isDeleted: boolean;
  deletedAt: Date | null;
}

export interface TimestampFields {
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Every collection referenced by financial/operational history is built on this: adds
 * createdAt/updatedAt via `timestamps` plus the soft-delete flag pair, per PRD Section 12.
 *
 * Returns a loosely-typed `Schema` on purpose — mongoose's literal-object type inference
 * doesn't survive being routed through a generic wrapper that spreads the definition, so
 * callers supply their own attributes interface directly to `model<Attrs & SoftDeleteFields
 * & TimestampFields>(name, schema)` rather than relying on `InferSchemaType` here.
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
