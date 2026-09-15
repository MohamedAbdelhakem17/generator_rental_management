import { AuditService } from '../audit/audit.service.js';
import { ConflictError, NotFoundError } from '../../utils/AppError.js';
import { paginateQuery, type PaginatedResult } from '../../services/pagination.js';
import { StatusEngineService } from '../status-engine/status-engine.service.js';
import { findDeactivationBlockReason } from './deactivation-guards.js';
import { GeneratorModel, type GeneratorAttrs, type GeneratorDocument } from './generator.model.js';
import type {
  CreateGeneratorInput,
  ListGeneratorsQuery,
  MeterCorrectionInput,
  StopGeneratorInput,
  UpdateGeneratorInput,
} from './generator.validation.js';

const ALLOWED_SORT_FIELDS = ['code', 'currentMeter', 'createdAt'] as const;

function throwIfDuplicateKey(error: unknown): never | void {
  if (error instanceof Error && 'code' in error && (error as { code?: number }).code === 11000) {
    const key = (error as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};
    if ('specifications.serialNumber' in key) {
      throw new ConflictError('A generator with this serial number already exists');
    }
    throw new ConflictError('A generator with this code already exists');
  }
  throw error;
}

async function findActiveOrThrow(generatorId: string): Promise<GeneratorDocument> {
  const generator = await GeneratorModel.findOne({ _id: generatorId, isDeleted: { $ne: true } });
  if (!generator) {
    throw new NotFoundError('Generator not found');
  }
  return generator;
}

export const GeneratorService = {
  async list(options: ListGeneratorsQuery): Promise<PaginatedResult<GeneratorAttrs>> {
    const filters: Record<string, unknown> = {};

    if (options.search) {
      filters.$or = [
        { code: { $regex: options.search, $options: 'i' } },
        { 'specifications.brand': { $regex: options.search, $options: 'i' } },
        { 'specifications.model': { $regex: options.search, $options: 'i' } },
        { 'specifications.serialNumber': { $regex: options.search, $options: 'i' } },
      ];
    }
    if (options.status) {
      filters.status = options.status;
    }
    if (options.location) {
      filters.location = { $regex: options.location, $options: 'i' };
    }

    return paginateQuery(GeneratorModel, filters, {
      page: options.page,
      limit: options.limit,
      sort: options.sort,
      allowedSortFields: ALLOWED_SORT_FIELDS,
    });
  },

  async getById(generatorId: string): Promise<GeneratorDocument> {
    return findActiveOrThrow(generatorId);
  },

  async create(input: CreateGeneratorInput, actorUserId: string): Promise<GeneratorDocument> {
    const { status, commercialStatus } = StatusEngineService.derive(null);

    let generator: GeneratorDocument;
    try {
      generator = await GeneratorModel.create({
        code: input.code,
        specifications: input.specifications,
        currentMeter: input.currentMeter ?? 0,
        location: input.location ?? '',
        normalFuelConsumption: input.normalFuelConsumption,
        maintenanceCycleHours: input.maintenanceCycleHours ?? 250,
        status,
        commercialStatus,
      });
    } catch (error) {
      throwIfDuplicateKey(error);
      throw error;
    }

    await AuditService.record({
      action: 'generator.create',
      actorUserId,
      entityType: 'Generator',
      entityId: String(generator._id),
      metadata: { after: generator.toObject() },
    });

    return generator;
  },

  async update(generatorId: string, input: UpdateGeneratorInput, actorUserId: string): Promise<GeneratorDocument> {
    const generator = await findActiveOrThrow(generatorId);
    const before = generator.toObject();

    if (input.specifications) {
      generator.specifications = { ...generator.specifications, ...input.specifications };
    }
    if (input.location !== undefined) generator.location = input.location;
    if (input.normalFuelConsumption !== undefined) generator.normalFuelConsumption = input.normalFuelConsumption;
    if (input.maintenanceCycleHours !== undefined) generator.maintenanceCycleHours = input.maintenanceCycleHours;

    try {
      await generator.save();
    } catch (error) {
      throwIfDuplicateKey(error);
      throw error;
    }

    await AuditService.record({
      action: 'generator.update',
      actorUserId,
      entityType: 'Generator',
      entityId: generatorId,
      metadata: { before, after: generator.toObject() },
    });

    return generator;
  },

  async stop(generatorId: string, input: StopGeneratorInput, actorUserId: string): Promise<GeneratorDocument> {
    const generator = await findActiveOrThrow(generatorId);
    const before = { manualStatus: generator.manualStatus, status: generator.status };

    generator.manualStatus = 'Stopped';
    const { status, commercialStatus } = StatusEngineService.derive(generator.manualStatus);
    generator.status = status;
    generator.commercialStatus = commercialStatus;
    await generator.save();

    await AuditService.record({
      action: 'generator.stop',
      actorUserId,
      entityType: 'Generator',
      entityId: generatorId,
      metadata: { before, after: { manualStatus: generator.manualStatus, status: generator.status }, reason: input.reason },
    });

    // Business Rule 6.1: a "stopped while commercially assigned" warning notification is
    // owned by the Notification Engine (TASK-026), which doesn't exist yet — wired in then.

    return generator;
  },

  async resume(generatorId: string, actorUserId: string): Promise<GeneratorDocument> {
    const generator = await findActiveOrThrow(generatorId);
    const before = { manualStatus: generator.manualStatus, status: generator.status };

    generator.manualStatus = null;
    const { status, commercialStatus } = StatusEngineService.derive(generator.manualStatus);
    generator.status = status;
    generator.commercialStatus = commercialStatus;
    await generator.save();

    await AuditService.record({
      action: 'generator.resume',
      actorUserId,
      entityType: 'Generator',
      entityId: generatorId,
      metadata: { before, after: { manualStatus: generator.manualStatus, status: generator.status } },
    });

    return generator;
  },

  /** FR-002: the one Admin-only exception to "currentMeter only moves via Operation Log entries" (TASK-013). */
  async correctMeter(generatorId: string, input: MeterCorrectionInput, actorUserId: string): Promise<GeneratorDocument> {
    const generator = await findActiveOrThrow(generatorId);
    const before = generator.currentMeter;

    generator.currentMeter = input.currentMeter;
    await generator.save();

    await AuditService.record({
      action: 'generator.meterCorrection',
      actorUserId,
      entityType: 'Generator',
      entityId: generatorId,
      metadata: { before: { currentMeter: before }, after: { currentMeter: generator.currentMeter }, reason: input.reason },
    });

    return generator;
  },

  async softDelete(generatorId: string, actorUserId: string): Promise<void> {
    const generator = await findActiveOrThrow(generatorId);

    const blockReason = await findDeactivationBlockReason(generatorId);
    if (blockReason) {
      throw new ConflictError(blockReason);
    }

    generator.isDeleted = true;
    generator.deletedAt = new Date();
    await generator.save();

    await AuditService.record({
      action: 'generator.deactivate',
      actorUserId,
      entityType: 'Generator',
      entityId: generatorId,
      metadata: { before: { isDeleted: false }, after: { isDeleted: true } },
    });
  },
};
