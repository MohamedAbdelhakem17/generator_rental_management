import type { FilterQuery } from 'mongoose';

import { paginateQuery, type PaginatedResult } from '../../services/pagination.js';
import { UserModel } from '../users/user.model.js';
import { AuditLogModel, type AuditLogDocument } from './audit.model.js';
import type { ListAuditLogsQuery } from './audit.validation.js';

export interface AuditRecordInput {
  action: string;
  actorUserId?: string | null;
  /** Section 10: "system" for scheduled-job/seed-script actors with no `actorUserId`. */
  actorType?: 'user' | 'system';
  entityType?: string | null;
  entityId?: string | null;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
  ip?: string;
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
      const metadata = input.metadata ?? {};
      // Every pre-TASK-031 call site nested its before/after inside `metadata` — lifting them
      // out here (rather than requiring ~54 call-site edits) makes the new top-level fields and
      // the Section 13 viewer work for entries recorded before and after this task alike.
      const before = input.before ?? (metadata.before as Record<string, unknown> | undefined) ?? {};
      const after = input.after ?? (metadata.after as Record<string, unknown> | undefined) ?? {};

      await AuditLogModel.create({
        action: input.action,
        actorUserId: input.actorUserId ?? null,
        actorType: input.actorType ?? 'user',
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        before,
        after,
        reason: input.reason ?? '',
        ip: input.ip ?? '',
        metadata,
      });
    } catch (error) {
      console.error('[audit] CRITICAL: failed to write audit log entry', input.action, error);
    }
  },

  /** Section 12 GET /api/audit-logs: filterable, paginated, with actor name resolved for
   * display (Admin-only — enforced at the route). */
  async list(query: ListAuditLogsQuery): Promise<PaginatedResult<AuditLogDocument & { actorName: string | null }>> {
    const filters: FilterQuery<AuditLogDocument> = {};
    if (query.userId) filters.actorUserId = query.userId;
    if (query.entityType) filters.entityType = query.entityType;
    if (query.entityId) filters.entityId = query.entityId;
    if (query.action) filters.action = query.action;
    if (query.from || query.to) {
      filters.createdAt = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }

    const result = await paginateQuery(AuditLogModel, filters, {
      page: query.page,
      limit: query.limit,
      sort: '-createdAt',
      allowedSortFields: ['createdAt'],
      includeDeleted: true,
    });

    const actorIds = [...new Set(result.items.map((item) => item.actorUserId).filter(Boolean))];
    const actors = await UserModel.find({ _id: { $in: actorIds } }).select('_id name');
    const actorNameById = new Map(actors.map((actor) => [String(actor._id), actor.name]));

    return {
      meta: result.meta,
      items: result.items.map((item) => ({
        ...((item as unknown as { toObject: () => AuditLogDocument }).toObject()),
        actorName: item.actorUserId ? (actorNameById.get(String(item.actorUserId)) ?? null) : null,
      })),
    };
  },
};
