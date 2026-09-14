import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Minimal seed of the Audit Log Engine (full model/admin UI is TASK-031). Built now
 * because Article V.3 requires sensitive mutations to be audited from the moment they
 * exist — TASK-006's login/user/role actions can't wait for TASK-031. TASK-031 extends
 * this same schema/service rather than introducing a second one (Article I.3).
 */
const auditLogSchema = new Schema(
  {
    action: { type: String, required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    entityType: { type: String, default: null },
    entityId: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type AuditLogDocument = InferSchemaType<typeof auditLogSchema>;
export const AuditLogModel = model('AuditLog', auditLogSchema);
