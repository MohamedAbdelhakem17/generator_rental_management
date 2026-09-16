import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/requireAuth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { idParamSchema, parseOrThrow } from '../../utils/validate.js';
import { NotificationEngineService } from './service.js';

export const notificationRouter = Router();

notificationRouter.use('/notifications', requireAuth);

const listNotificationsQuerySchema = z.object({
  status: z.enum(['Unread', 'Read', 'Dismissed']).optional(),
});

notificationRouter.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const query = parseOrThrow(listNotificationsQuerySchema, req.query);
    const items = await NotificationEngineService.listForUser(
      { id: req.user!.id, role: req.user!.role },
      { status: query.status },
    );
    res.status(200).json({ success: true, data: items, message: null, meta: {} });
  }),
);

notificationRouter.patch(
  '/notifications/:id/read',
  asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const item = await NotificationEngineService.markRead(id, {
      id: req.user!.id,
      role: req.user!.role,
    });
    res.status(200).json({ success: true, data: item, message: null, meta: {} });
  }),
);
