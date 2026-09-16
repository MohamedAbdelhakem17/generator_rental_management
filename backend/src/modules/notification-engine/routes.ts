import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './controller.js';

export const notificationRouter = Router();

notificationRouter.use('/notifications', requireAuth);

notificationRouter.get('/notifications', asyncHandler(listNotifications));
notificationRouter.get('/notifications/unread-count', asyncHandler(getUnreadCount));
notificationRouter.patch('/notifications/read-all', asyncHandler(markAllNotificationsRead));
notificationRouter.patch('/notifications/:id/read', asyncHandler(markNotificationRead));
