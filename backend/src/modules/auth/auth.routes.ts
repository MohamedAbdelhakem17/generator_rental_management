import { Router } from 'express';

import { requireAuth } from '../../middleware/requireAuth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { login, logout, me, refresh } from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/auth/login', asyncHandler(login));
authRouter.post('/auth/logout', requireAuth, asyncHandler(logout));
authRouter.get('/auth/me', requireAuth, asyncHandler(me));
authRouter.post('/auth/refresh', asyncHandler(refresh));
