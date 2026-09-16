import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * TASK-006 seeded a minimal version of this model (action/actorUserId/entityType/entityId/
 * metadata) ahead of TASK-031's full Audit Log Engine — Article V.3 required auditing sensitive
 * mutations from the moment they first existed. TASK-031 extends the same schema (Article I.3)
 * rather than introducing a second one: adds `actorType`, top-level `before`/`after` (Section 10;
 * `AuditService.record` lifts these out of `metadata` automatically for the ~54 call sites
 * across the codebase that already pass `metadata: { before, after }`/`{ after }`, so none of
 * them needed to change), `reason`, and `ip`. `entityId` stays a `String` (not `Types.ObjectId`)
 * since some existing callers pass identifiers for non-Mongo actors (e.g. the seed script's
 * system actor) — a permissive type here costs nothing and avoids a cast at every call site.
 *
 * FR-003 (append-only): enforced structurally, not by a flag — no update/delete route or
 * service method exists for this model anywhere in the codebase.
 */
const auditLogSchema = new Schema(
  {
    action: { type: String, required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorType: { type: String, enum: ['user', 'system'], required: true, default: 'user' },
    entityType: { type: String, default: null },
    entityId: { type: String, default: null },
    before: { type: Schema.Types.Mixed, default: {} },
    after: { type: Schema.Types.Mixed, default: {} },
    reason: { type: String, default: '' },
    ip: { type: String, default: '' },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index(
  { entityType: 1, entityId: 1, createdAt: -1 },
  { name: 'audit_entity_idx' },
);
auditLogSchema.index({ actorUserId: 1, createdAt: -1 }, { name: 'audit_actor_idx' });
auditLogSchema.index({ action: 1, createdAt: -1 }, { name: 'audit_action_idx' });

export type AuditLogDocument = InferSchemaType<typeof auditLogSchema>;
export const AuditLogModel = model('AuditLog', auditLogSchema);
