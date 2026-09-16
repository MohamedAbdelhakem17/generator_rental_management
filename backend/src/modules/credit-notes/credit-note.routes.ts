import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { createCreditNote } from './credit-note.controller.js';

export const creditNoteRouter = Router();

creditNoteRouter.use('/credit-notes', requireAuth);
creditNoteRouter.post(
  '/credit-notes',
  requirePermission('credit-notes:write'),
  asyncHandler(createCreditNote),
);
