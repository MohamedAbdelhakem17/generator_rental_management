import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { ROLE_NAMES, type RoleName } from '../modules/auth/permissions.js';
import { seedRoles } from '../modules/roles/role.seed.js';
import { RoleModel, type RoleDocument } from '../modules/roles/role.model.js';
import { SINGLETON_KEY, SystemSettingModel } from '../modules/settings/systemSetting.model.js';
import { UserModel } from '../modules/users/user.model.js';
import { hashPassword } from '../utils/password.js';

let mongod: MongoMemoryServer | null = null;

export async function startTestDb(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

export async function stopTestDb(): Promise<void> {
  await mongoose.disconnect();
  await mongod?.stop();
  mongod = null;
}

export async function resetTestDb(): Promise<void> {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

export async function seedTestRoles(): Promise<Record<RoleName, RoleDocument>> {
  await seedRoles();
  const roles = await RoleModel.find();
  const byName = new Map(roles.map((role) => [role.name, role]));
  return Object.fromEntries(ROLE_NAMES.map((name) => [name, byName.get(name)!])) as Record<RoleName, RoleDocument>;
}

/** Mirrors TASK-007's baseline seed (VAT/currency/fuel-tolerance defaults) for suites that
 * exercise a service reading SystemSetting (e.g. the Fuel Alert Engine, TASK-017) but don't
 * otherwise care about its values. */
export async function seedTestSettings(): Promise<void> {
  await SystemSettingModel.create({
    key: SINGLETON_KEY,
    vatRatePercent: '14',
    currency: 'EGP',
    fuelTolerancePercent: '15',
    fuelCriticalTolerancePercent: '30',
  });
}

export async function createTestUser(options: {
  name?: string;
  email: string;
  password: string;
  roleId: mongoose.Types.ObjectId;
  active?: boolean;
}) {
  return UserModel.create({
    name: options.name ?? 'Test User',
    email: options.email,
    passwordHash: await hashPassword(options.password),
    role: options.roleId,
    active: options.active ?? true,
  });
}
