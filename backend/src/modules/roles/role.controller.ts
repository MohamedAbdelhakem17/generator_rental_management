import type { Request, Response } from 'express';

import { successResponse } from '../../utils/responseEnvelope.js';
import { idParamSchema, parseOrThrow } from '../../utils/validate.js';
import { RoleService } from './role.service.js';
import { updateRolePermissionsSchema } from './role.validation.js';
import type { RoleAttrs } from './role.model.js';

function toSafeRole(role: RoleAttrs) {
  return {
    id: String(role._id),
    name: role.name,
    permissions: role.permissions,
  };
}

export async function listRoles(req: Request, res: Response): Promise<void> {
  const page = req.query.page ? Number(req.query.page) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const result = await RoleService.list({ page, limit });
  res.status(200).json(successResponse(result.items.map(toSafeRole), null, result.meta));
}

export async function updateRolePermissions(req: Request, res: Response): Promise<void> {
  const { id } = parseOrThrow(idParamSchema, req.params);
  const { permissions } = parseOrThrow(updateRolePermissionsSchema, req.body);
  const role = await RoleService.updatePermissions(id, permissions, req.user!.id);
  res.status(200).json(successResponse(toSafeRole(role)));
}
