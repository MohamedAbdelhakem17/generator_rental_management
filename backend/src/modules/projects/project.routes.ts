import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { closeProject, createProject, getProject, listProjects, updateProject } from './project.controller.js';

export const projectRouter = Router();

projectRouter.use('/projects', requireAuth);

projectRouter.get('/projects', requirePermission('projects:read'), asyncHandler(listProjects));
projectRouter.get('/projects/:id', requirePermission('projects:read'), asyncHandler(getProject));
projectRouter.post('/projects', requirePermission('projects:write'), asyncHandler(createProject));
projectRouter.patch('/projects/:id', requirePermission('projects:write'), asyncHandler(updateProject));
projectRouter.delete('/projects/:id', requirePermission('projects:write'), asyncHandler(closeProject));
