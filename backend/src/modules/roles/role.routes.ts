import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { listRoles, updateRolePermissions } from './role.controller.js';

export const roleRouter = Router();

roleRouter.use('/roles', requireAuth, requirePermission('roles:manage'));

roleRouter.get('/roles', asyncHandler(listRoles));
roleRouter.patch('/roles/:id', asyncHandler(updateRolePermissions));
