import { AuditService } from '../audit/audit.service.js';
import { NotFoundError } from '../../utils/AppError.js';
import { paginateQuery, type PaginatedResult } from '../../services/pagination.js';
import type { PermissionKey } from '../auth/permissions.js';
import { RoleModel, type RoleAttrs, type RoleDocument } from './role.model.js';

export const RoleService = {
  async list(options: { page?: number; limit?: number }): Promise<PaginatedResult<RoleAttrs>> {
    return paginateQuery(RoleModel, {}, {
      page: options.page,
      limit: options.limit,
      sort: 'name',
      allowedSortFields: ['name'],
    });
  },

  async updatePermissions(roleId: string, permissions: PermissionKey[], actorUserId: string): Promise<RoleDocument> {
    const role = await RoleModel.findOne({ _id: roleId, isDeleted: { $ne: true } });
    if (!role) {
      throw new NotFoundError('Role not found');
    }

    role.permissions = permissions;
    await role.save();

    await AuditService.record({
      action: 'role.permissions.update',
      actorUserId,
      entityType: 'Role',
      entityId: roleId,
      metadata: { roleName: role.name, permissions },
    });

    return role;
  },
};
