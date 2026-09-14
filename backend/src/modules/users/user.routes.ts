import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { createUser, deleteUser, listUsers, updateUser } from './user.controller.js';

export const userRouter = Router();

userRouter.use('/users', requireAuth, requirePermission('users:manage'));

userRouter.get('/users', asyncHandler(listUsers));
userRouter.post('/users', asyncHandler(createUser));
userRouter.patch('/users/:id', asyncHandler(updateUser));
userRouter.delete('/users/:id', asyncHandler(deleteUser));
