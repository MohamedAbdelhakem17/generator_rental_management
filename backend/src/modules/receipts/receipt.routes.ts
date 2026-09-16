import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { cancelReceipt, createReceipt, getReceipt, listReceipts } from './receipt.controller.js';

export const receiptRouter = Router();

receiptRouter.use('/receipts', requireAuth);

receiptRouter.get('/receipts', requirePermission('receipts:read'), asyncHandler(listReceipts));
receiptRouter.get('/receipts/:id', requirePermission('receipts:read'), asyncHandler(getReceipt));
receiptRouter.post('/receipts', requirePermission('receipts:write'), asyncHandler(createReceipt));
receiptRouter.post(
  '/receipts/:id/cancel',
  requirePermission('receipts:cancel'),
  asyncHandler(cancelReceipt),
);
