import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { createExport, downloadExportJob, getExportJob } from './export.controller.js';

export const exportRouter = Router();

exportRouter.use('/exports', requireAuth);
exportRouter.post('/exports', asyncHandler(createExport));
exportRouter.get('/exports/:id', asyncHandler(getExportJob));
exportRouter.get('/exports/:id/download', asyncHandler(downloadExportJob));
