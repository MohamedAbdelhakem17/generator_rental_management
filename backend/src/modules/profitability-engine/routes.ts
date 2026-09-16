import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getProfitability } from './controller.js';

export const profitabilityRouter = Router();

profitabilityRouter.use('/profitability', requireAuth);
profitabilityRouter.get(
  '/profitability',
  requirePermission('profitability:read'),
  asyncHandler(getProfitability),
);
