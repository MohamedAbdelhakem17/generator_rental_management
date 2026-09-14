import type { Request, Response } from 'express';

import { successResponse } from '../../utils/responseEnvelope.js';
import { parseOrThrow } from '../../utils/validate.js';
import { AuthError } from '../../utils/AppError.js';
import { AuthService } from './auth.service.js';
import { loginSchema } from './auth.validation.js';
import { REFRESH_TOKEN_COOKIE, clearSessionCookies, setSessionCookies } from './cookies.js';

function toSessionResponse(user: { id: string; name: string; role: string }) {
  return { user: { id: user.id, name: user.name, role: user.role } };
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = parseOrThrow(loginSchema, req.body);
  const { user, tokens } = await AuthService.login(email, password);
  setSessionCookies(res, tokens);
  res.status(200).json(successResponse(toSessionResponse(user)));
}

export async function logout(req: Request, res: Response): Promise<void> {
  await AuthService.logout(req.cookies?.[REFRESH_TOKEN_COOKIE]);
  clearSessionCookies(res);
  res.status(200).json(successResponse(null));
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await AuthService.getCurrentUser(req.user!.id);
  res.status(200).json(successResponse(user));
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const rawRefreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (!rawRefreshToken) {
    throw new AuthError('No active session');
  }

  const { user, tokens } = await AuthService.refresh(rawRefreshToken);
  setSessionCookies(res, tokens);
  res.status(200).json(successResponse(toSessionResponse(user)));
}
