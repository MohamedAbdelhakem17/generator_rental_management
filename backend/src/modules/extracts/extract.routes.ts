import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  approveExtract,
  cancelExtract,
  createExtract,
  getExtract,
  listExtracts,
  previewTotals,
  submitExtractForReview,
  updateExtract,
} from './extract.controller.js';

export const extractRouter = Router();

extractRouter.use('/extracts', requireAuth);

extractRouter.get('/extracts', requirePermission('extracts:read'), asyncHandler(listExtracts));
extractRouter.get('/extracts/:id', requirePermission('extracts:read'), asyncHandler(getExtract));
extractRouter.post('/extracts', requirePermission('extracts:create'), asyncHandler(createExtract));
extractRouter.patch('/extracts/:id', requirePermission('extracts:create'), asyncHandler(updateExtract));
extractRouter.post(
  '/extracts/:id/submit-review',
  requirePermission('extracts:create'),
  asyncHandler(submitExtractForReview),
);
extractRouter.post('/extracts/:id/approve', requirePermission('extracts:approve'), asyncHandler(approveExtract));
extractRouter.post('/extracts/:id/cancel', requirePermission('extracts:cancel'), asyncHandler(cancelExtract));

/** TASK-021's endpoint, gated the same as TASK-020's create/edit matrix (Section 17). */
extractRouter.post('/extracts/preview-totals', requirePermission('extracts:create'), asyncHandler(previewTotals));
