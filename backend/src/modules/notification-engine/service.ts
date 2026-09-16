import { NotificationModel, type NotificationAttrs, type NotificationDocument, type NotificationStatus } from './notification.model.js';

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

  async listForUser(user: NotificationUserContext, query: NotificationListQuery = {}): Promise<NotificationAttrs[]> {
    const filters: Record<string, unknown> = { recipientRoles: user.role };
    if (query.status) filters.status = query.status;

    if (user.role === 'Technician') {
      const result = await NotificationModel.find({
        ...filters,
        $or: [{ assignedUserId: null }, { assignedUserId: user.id }],
      }).sort({ createdAt: -1 });
      return result.map((doc) => doc.toObject());
    }

    const result = await NotificationModel.find(filters).sort({ createdAt: -1 });
    return result.map((doc) => doc.toObject());
  },

  async markRead(notificationId: string, user: NotificationUserContext): Promise<NotificationDocument> {
    const notification = await NotificationModel.findOne({
      _id: notificationId,
      recipientRoles: user.role,
      ...(user.role === 'Technician' ? { $or: [{ assignedUserId: null }, { assignedUserId: user.id }] } : {}),
    });

    if (!notification) {
      throw new Error('Notification not found or not visible to this user');
    }

    notification.status = 'Read';
    notification.readAt = new Date();
    await notification.save();
    return notification;
  },
};
