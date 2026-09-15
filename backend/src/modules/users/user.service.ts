import { AuditService } from '../audit/audit.service.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { RoleModel } from '../roles/role.model.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError.js';
import { hashPassword } from '../../utils/password.js';
import { paginateQuery, type PaginatedResult } from '../../services/pagination.js';
import { ROLE_NAMES } from '../auth/permissions.js';
import { UserModel, type UserAttrs, type UserDocument } from './user.model.js';
import type { CreateUserInput, UpdateUserInput } from './user.validation.js';

const ADMIN_ROLE_NAME: (typeof ROLE_NAMES)[number] = 'System Admin';
const ALLOWED_SORT_FIELDS = ['name', 'email', 'createdAt'] as const;

interface ListUsersOptions {
  page?: number;
  limit?: number;
  sort?: string;
  search?: string;
}

async function assertRoleExists(roleId: string) {
  const role = await RoleModel.findOne({ _id: roleId, isDeleted: { $ne: true } });
  if (!role) {
    throw new ValidationError('Validation failed', [{ field: 'role', message: 'Role does not exist' }]);
  }
  return role;
}

async function assertGeneratorsExist(generatorIds: string[]): Promise<void> {
  if (generatorIds.length === 0) return;
  const count = await GeneratorModel.countDocuments({ _id: { $in: generatorIds }, isDeleted: { $ne: true } });
  if (count !== generatorIds.length) {
    throw new ValidationError('Validation failed', [
      { field: 'assignedGenerators', message: 'One or more generators do not exist' },
    ]);
  }
}

/**
 * Shared by every module whose Section 17 matrix says "Technician (assigned only)" —
 * Operations (TASK-015), Fuel (TASK-016), Maintenance (TASK-018), and their alert modules —
 * so the assignment check has exactly one owner.
 */
export async function isGeneratorAssignedToUser(userId: string, generatorId: string): Promise<boolean> {
  const count = await UserModel.countDocuments({ _id: userId, assignedGenerators: generatorId });
  return count > 0;
}

async function countActiveAdmins(excludeUserId?: string): Promise<number> {
  const adminRole = await RoleModel.findOne({ name: ADMIN_ROLE_NAME, isDeleted: { $ne: true } });
  if (!adminRole) return 0;

  return UserModel.countDocuments({
    role: adminRole._id,
    active: true,
    isDeleted: { $ne: true },
    ...(excludeUserId ? { _id: { $ne: excludeUserId } } : {}),
  });
}

export const UserService = {
  async list(options: ListUsersOptions): Promise<PaginatedResult<UserAttrs>> {
    const filters = options.search
      ? {
          $or: [
            { name: { $regex: options.search, $options: 'i' } },
            { email: { $regex: options.search, $options: 'i' } },
          ],
        }
      : {};

    const result = await paginateQuery(UserModel, filters, {
      page: options.page,
      limit: options.limit,
      sort: options.sort,
      allowedSortFields: ALLOWED_SORT_FIELDS,
    });

    await UserModel.populate(result.items, { path: 'role', select: 'name' });
    await UserModel.populate(result.items, { path: 'assignedGenerators', select: 'code' });
    return result;
  },

  async create(input: CreateUserInput, actorUserId: string): Promise<UserDocument> {
    await assertRoleExists(input.role);
    await assertGeneratorsExist(input.assignedGenerators ?? []);

    const existing = await UserModel.findOne({ email: input.email.toLowerCase() });
    if (existing) {
      throw new ConflictError('A user with this email already exists');
    }

    const passwordHash = await hashPassword(input.password);
    const user = await UserModel.create({
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash,
      role: input.role,
      active: input.active ?? true,
      assignedGenerators: input.assignedGenerators ?? [],
    });

    await AuditService.record({
      action: 'user.create',
      actorUserId,
      entityType: 'User',
      entityId: String(user._id),
      metadata: { email: user.email, role: input.role },
    });

    await user.populate<{ role: { name: string } }>('role', 'name');
    await user.populate('assignedGenerators', 'code');
    return user;
  },

  async update(userId: string, input: UpdateUserInput, actorUserId: string): Promise<UserDocument> {
    const user = await UserModel.findOne({ _id: userId, isDeleted: { $ne: true } });
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Section 20 edge case: deactivating the currently-logged-in user is blocked (avoids lockout).
    if (input.active === false && userId === actorUserId) {
      throw new ForbiddenError('You cannot deactivate your own account');
    }

    if (input.active === false && user.active) {
      const role = await RoleModel.findById(user.role);
      if (role?.name === ADMIN_ROLE_NAME) {
        const remainingAdmins = await countActiveAdmins(userId);
        if (remainingAdmins === 0) {
          throw new ForbiddenError('At least one active Admin account must remain');
        }
      }
    }

    if (input.role) {
      await assertRoleExists(input.role);
      user.role = input.role as unknown as UserDocument['role'];
    }
    if (input.assignedGenerators !== undefined) {
      await assertGeneratorsExist(input.assignedGenerators);
      user.assignedGenerators = input.assignedGenerators as unknown as UserDocument['assignedGenerators'];
    }
    if (input.name !== undefined) user.name = input.name;
    if (input.email !== undefined) user.email = input.email.toLowerCase();
    if (input.active !== undefined) user.active = input.active;

    try {
      await user.save();
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as { code?: number }).code === 11000) {
        throw new ConflictError('A user with this email already exists');
      }
      throw error;
    }

    await AuditService.record({
      action: 'user.update',
      actorUserId,
      entityType: 'User',
      entityId: userId,
      metadata: input,
    });

    await user.populate<{ role: { name: string } }>('role', 'name');
    await user.populate('assignedGenerators', 'code');
    return user;
  },

  async softDelete(userId: string, actorUserId: string): Promise<void> {
    const user = await UserModel.findOne({ _id: userId, isDeleted: { $ne: true } });
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const role = await RoleModel.findById(user.role);
    if (role?.name === ADMIN_ROLE_NAME && user.active) {
      const remainingAdmins = await countActiveAdmins(userId);
      if (remainingAdmins === 0) {
        throw new ForbiddenError('The last Admin account cannot be deleted');
      }
    }

    user.isDeleted = true;
    user.deletedAt = new Date();
    await user.save();

    await AuditService.record({
      action: 'user.delete',
      actorUserId,
      entityType: 'User',
      entityId: userId,
    });
  },
};
