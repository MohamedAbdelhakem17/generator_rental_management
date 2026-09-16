import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { NotificationEngineService } from './service.js';

export const notificationRouter = Router();

notificationRouter.use('/notifications', requireAuth);

notificationRouter.get('/notifications', asyncHandler(async (req, res) => {
  const items = await NotificationEngineService.listForUser(
    { id: req.user!.id, role: req.user!.role },
    { status: (req.query.status as string) as any },
  );
  res.status(200).json({ success: true, data: items, message: null, meta: {} });
}));

notificationRouter.patch('/notifications/:id/read', asyncHandler(async (req, res) => {
  const item = await NotificationEngineService.markRead(req.params.id, {
    id: req.user!.id,
    role: req.user!.role,
  });
  res.status(200).json({ success: true, data: item, message: null, meta: {} });
}));
