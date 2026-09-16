import type { Request, Response } from 'express';
import { z } from 'zod';

import { successResponse } from '../../utils/responseEnvelope.js';
import { idParamSchema, parseOrThrow } from '../../utils/validate.js';
import type { NotificationAttrs } from './notification.model.js';
import { NotificationEngineService } from './service.js';

const listNotificationsQuerySchema = z.object({
  status: z.enum(['Unread', 'Read', 'Dismissed']).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  type: z
    .enum([
      'FuelAlert',
      'MaintenanceAlert',
      'ContractExpiry',
      'OverdueCustomer',
      'GeneratorStoppedWhileAssigned',
    ])
    .optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

function toNotificationResponse(notification: NotificationAttrs) {
  return {
    id: String(notification._id),
    type: notification.type,
    severity: notification.severity,
    title: notification.title,
    message: notification.message,
    entityType: notification.entityType,
    entityId: String(notification.entityId),
    recipientRoles: notification.recipientRoles,
    status: notification.status,
    dueDate: notification.dueDate ?? null,
    readAt: notification.readAt ?? null,
    createdAt: notification.createdAt,
  };
}

export async function listNotifications(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(listNotificationsQuerySchema, req.query);
  const result = await NotificationEngineService.listForUser(
    { id: req.user!.id, role: req.user!.role },
    query,
  );
  res
    .status(200)
    .json(successResponse(result.items.map(toNotificationResponse), null, result.meta));
}

export async function getUnreadCount(req: Request, res: Response): Promise<void> {
  const count = await NotificationEngineService.unreadCount({
    id: req.user!.id,
    role: req.user!.role,
  });
  res.status(200).json(successResponse({ count }));
}

export async function markNotificationRead(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const item = await NotificationEngineService.markRead(id, {
    id: req.user!.id,
    role: req.user!.role,
  });
  res.status(200).json(successResponse(toNotificationResponse(item.toObject())));
}

export async function markAllNotificationsRead(req: Request, res: Response): Promise<void> {
  const result = await NotificationEngineService.markAllRead({
    id: req.user!.id,
    role: req.user!.role,
  });
  res.status(200).json(successResponse(result));
}
