import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { cancelCreditNote, createCreditNote } from './credit-note.controller.js';

export const creditNoteRouter = Router();

creditNoteRouter.use('/credit-notes', requireAuth, requirePermission('credit-notes:write'));
creditNoteRouter.post('/credit-notes', asyncHandler(createCreditNote));
creditNoteRouter.patch('/credit-notes/:id/cancel', asyncHandler(cancelCreditNote));
