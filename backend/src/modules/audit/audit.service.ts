import { AuditLogModel } from './audit.model.js';

export interface AuditRecordInput {
  action: string;
  actorUserId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * PRD Section 8 FR-001: called synchronously right after the mutation it describes
 * commits. Where no transaction wraps the mutation (true for every TASK-006 call site),
 * a write failure must not fail the already-committed business action — it's logged as
 * a critical system alert instead, since audit durability is a first-class concern but
 * cannot roll back a mutation that already happened.
 */
export const AuditService = {
  async record(input: AuditRecordInput): Promise<void> {
    try {
      await AuditLogModel.create({
        action: input.action,
        actorUserId: input.actorUserId ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metadata: input.metadata ?? {},
      });
    } catch (error) {
      console.error('[audit] CRITICAL: failed to write audit log entry', input.action, error);
    }
  },
};
