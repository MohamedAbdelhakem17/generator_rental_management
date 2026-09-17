import { NotFoundError } from '../../utils/AppError.js';
import { paginateQuery, type PaginatedResult } from '../../services/pagination.js';
import {
  NotificationModel,
  type NotificationAttrs,
  type NotificationDocument,
  type NotificationSeverity,
  type NotificationStatus,
  type NotificationType,
} from './notification.model.js';

export interface NotifyInput {
  type?: NotificationAttrs['type'];
  title?: string;
  recipientRoles: string[];
  message: string;
  severity?: NotificationAttrs['severity'];
  entityType?: string;
  entityId?: string;
  assignedUserId?: string | null;
}

export interface NotificationUserContext {
  id: string;
  role: string;
}

export interface NotificationListQuery {
  status?: NotificationStatus;
  severity?: NotificationSeverity;
  type?: NotificationType;
  page?: number;
  limit?: number;
}

function visibilityFilter(
  user: NotificationUserContext,
  filters: Pick<NotificationListQuery, 'status' | 'severity' | 'type'> = {},
) {
  const result: Record<string, unknown> = { recipientRoles: user.role };
  if (filters.status) result.status = filters.status;
  if (filters.severity) result.severity = filters.severity;
  if (filters.type) result.type = filters.type;
  if (user.role === 'Technician') {
    result.$or = [{ assignedUserId: null }, { assignedUserId: user.id }];
  }
  return result;
}

export const NotificationEngineService = {
  async notify(input: NotifyInput): Promise<NotificationDocument> {
    return NotificationModel.create({
      type: input.type ?? 'FuelAlert',
      severity: input.severity ?? 'info',
      title: input.title ?? 'System update',
      message: input.message,
      entityType: input.entityType ?? 'System',
      entityId: input.entityId ?? '000000000000000000000000',
      recipientRoles: input.recipientRoles,
      assignedUserId: input.assignedUserId ?? null,
      status: 'Unread',
      readAt: null,
    });
  },

  async listForUser(
    user: NotificationUserContext,
    query: NotificationListQuery = {},
  ): Promise<PaginatedResult<NotificationAttrs>> {
    return paginateQuery(
      NotificationModel,
      visibilityFilter(user, { status: query.status, severity: query.severity, type: query.type }),
      {
        page: query.page,
        limit: query.limit,
        sort: '-createdAt',
        allowedSortFields: ['createdAt'],
      },
    );
  },

  async unreadCount(user: NotificationUserContext): Promise<number> {
    return NotificationModel.countDocuments(visibilityFilter(user, { status: 'Unread' }));
  },

  async markRead(
    notificationId: string,
    user: NotificationUserContext,
  ): Promise<NotificationDocument> {
    const notification = await NotificationModel.findOne({
      _id: notificationId,
      ...visibilityFilter(user),
    });

    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    notification.status = 'Read';
    notification.readAt = new Date();
    await notification.save();
    return notification;
  },

  async markAllRead(user: NotificationUserContext): Promise<{ updated: number }> {
    const result = await NotificationModel.updateMany(
      visibilityFilter(user, { status: 'Unread' }),
      { $set: { status: 'Read', readAt: new Date() } },
    );
    return { updated: result.modifiedCount };
  },
};
