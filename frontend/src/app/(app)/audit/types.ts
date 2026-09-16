export interface AuditLogRow {
  _id: string;
  action: string;
  actorUserId: string | null;
  actorName: string | null;
  actorType: 'user' | 'system';
  entityType: string | null;
  entityId: string | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  reason: string;
  createdAt: string;
}
