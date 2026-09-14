import type { Request, Response } from 'express';
import type { Types } from 'mongoose';

import { successResponse } from '../../utils/responseEnvelope.js';
import { idParamSchema, parseOrThrow } from '../../utils/validate.js';
import type { UserAttrs } from './user.model.js';
import { UserService } from './user.service.js';
import { createUserSchema, listUsersQuerySchema, updateUserSchema } from './user.validation.js';

/** `role` is always populated with at least `name` before this runs — see UserService. */
type PopulatedUser = Omit<UserAttrs, 'role'> & { role: { _id: Types.ObjectId; name: string } };

function toSafeUser(user: PopulatedUser) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: { id: String(user.role._id), name: user.role.name },
    active: user.active,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(listUsersQuerySchema, req.query);
  const result = await UserService.list(query);
  // Populated by UserService.list — the static UserAttrs type still says `role: ObjectId`.
  const items = result.items as unknown as PopulatedUser[];
  res.status(200).json(successResponse(items.map(toSafeUser), null, result.meta));
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(createUserSchema, req.body);
  const user = await UserService.create(input, req.user!.id);
  res.status(201).json(successResponse(toSafeUser(user as unknown as PopulatedUser)));
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const input = parseOrThrow(updateUserSchema, req.body);
  const user = await UserService.update(id, input, req.user!.id);
  res.status(200).json(successResponse(toSafeUser(user as unknown as PopulatedUser)));
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  await UserService.softDelete(id, req.user!.id);
  res.status(200).json(successResponse(null));
}
