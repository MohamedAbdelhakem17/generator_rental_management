import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  correctGeneratorMeter,
  createGenerator,
  deleteGenerator,
  getGenerator,
  listGenerators,
  resumeGenerator,
  stopGenerator,
  updateGenerator,
} from './generator.controller.js';

export const generatorRouter = Router();

generatorRouter.use('/generators', requireAuth);

generatorRouter.get('/generators', requirePermission('generators:read'), asyncHandler(listGenerators));
generatorRouter.get('/generators/:id', requirePermission('generators:read'), asyncHandler(getGenerator));
generatorRouter.post('/generators', requirePermission('generators:write'), asyncHandler(createGenerator));
generatorRouter.patch('/generators/:id', requirePermission('generators:write'), asyncHandler(updateGenerator));
generatorRouter.post('/generators/:id/stop', requirePermission('generators:write'), asyncHandler(stopGenerator));
generatorRouter.post('/generators/:id/resume', requirePermission('generators:write'), asyncHandler(resumeGenerator));
generatorRouter.patch(
  '/generators/:id/meter-correction',
  requirePermission('generators:meterCorrection'),
  asyncHandler(correctGeneratorMeter),
);
generatorRouter.delete('/generators/:id', requirePermission('generators:delete'), asyncHandler(deleteGenerator));
