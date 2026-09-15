import { AuditService } from '../audit/audit.service.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { MaintenanceScheduleEngineService } from '../maintenance-schedule-engine/service.js';
import { StatusEngineService } from '../status-engine/status-engine.service.js';
import { isGeneratorAssignedToUser } from '../users/user.service.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError.js';
import { toDecimal, toDecimal128 } from '../../services/money.js';
import { paginateQuery, type PaginatedResult } from '../../services/pagination.js';
import { MaintenanceModel, type MaintenanceAttrs, type MaintenanceDocument } from './maintenance.model.js';
import type { CancelMaintenanceInput, ListMaintenanceQuery, OpenMaintenanceInput, UpdateMaintenanceInput } from './maintenance.validation.js';

const ALLOWED_SORT_FIELDS = ['date', 'createdAt'] as const;
const OPEN_STATUSES = ['Open', 'In Progress'] as const;
const TECHNICIAN_ROLE_NAME = 'Technician';
const GENERATOR_POPULATE = { path: 'generatorId', select: 'code' };

/** See the identical note in `contracts/contract.service.ts` re: Mongoose's `.populate()` overloads. */
async function populateRefs<T extends { populate: (options: { path: string; select: string }) => Promise<unknown> }>(
  target: T,
): Promise<T> {
  await target.populate(GENERATOR_POPULATE);
  return target;
}

async function populateRefsMany<T extends { _id: unknown }>(items: T[]): Promise<void> {
  await MaintenanceModel.populate(items, GENERATOR_POPULATE);
}

function throwIfDuplicateKey(error: unknown): never {
  if (error instanceof Error && 'code' in error && (error as { code?: number }).code === 11000) {
    throw new ConflictError('This generator already has an open maintenance record');
  }
  throw error;
}

async function findGeneratorOrThrow(generatorId: string) {
  const generator = await GeneratorModel.findOne({ _id: generatorId, isDeleted: { $ne: true } });
  if (!generator) {
    throw new ValidationError('Validation failed', [{ field: 'generatorId', message: 'Generator does not exist' }]);
  }
  return generator;
}

async function assertTechnicianAssignment(actorRole: string, actorUserId: string, generatorId: string): Promise<void> {
  if (actorRole !== TECHNICIAN_ROLE_NAME) return;
  const assigned = await isGeneratorAssignedToUser(actorUserId, generatorId);
  if (!assigned) {
    throw new ForbiddenError('You are not assigned to this generator');
  }
}

function computeTotalCost(input: {
  partsCost: number;
  oilCost: number;
  laborCost: number;
  transportCost: number;
}) {
  return toDecimal128(
    toDecimal(input.partsCost).plus(input.oilCost).plus(input.laborCost).plus(input.transportCost),
  );
}

async function findOpenRecord(generatorId: string): Promise<MaintenanceDocument | null> {
  return MaintenanceModel.findOne({ generatorId, status: { $in: OPEN_STATUSES } });
}

async function recalculateStatus(generatorId: string, reason: string): Promise<void> {
  await StatusEngineService.recalculate(generatorId, { reason, triggeredBy: 'user' });
}

export const MaintenanceService = {
  async list(
    options: ListMaintenanceQuery,
    restrictToGeneratorIds?: string[],
  ): Promise<PaginatedResult<MaintenanceAttrs>> {
    if (restrictToGeneratorIds && options.generatorId && !restrictToGeneratorIds.includes(options.generatorId)) {
      const limit = options.limit ?? 20;
      return { items: [], meta: { page: options.page ?? 1, limit, total: 0, totalPages: 0 } };
    }

    const filters: Record<string, unknown> = {};
    if (options.generatorId) {
      filters.generatorId = options.generatorId;
    } else if (restrictToGeneratorIds) {
      filters.generatorId = { $in: restrictToGeneratorIds };
    }
    if (options.status) filters.status = options.status;
    if (options.type) filters.type = options.type;
    if (options.dateFrom || options.dateTo) {
      filters.date = {
        ...(options.dateFrom ? { $gte: options.dateFrom } : {}),
        ...(options.dateTo ? { $lte: options.dateTo } : {}),
      };
    }

    const result = await paginateQuery(MaintenanceModel, filters, {
      page: options.page,
      limit: options.limit,
      sort: options.sort ?? '-date',
      allowedSortFields: ALLOWED_SORT_FIELDS,
    });
    await populateRefsMany(result.items);
    return result;
  },

  async getById(maintenanceId: string, restrictToGeneratorIds?: string[]): Promise<MaintenanceDocument> {
    const record = await MaintenanceModel.findById(maintenanceId);
    if (!record) {
      throw new NotFoundError('Maintenance record not found');
    }
    if (restrictToGeneratorIds && !restrictToGeneratorIds.includes(String(record.generatorId))) {
      throw new ForbiddenError('You are not assigned to this generator');
    }
    await populateRefs(record);
    return record;
  },

  /** FR-002: DB partial-unique-index backstop on top of this pre-check for the race case. */
  async open(input: OpenMaintenanceInput, actorUserId: string, actorRole: string): Promise<MaintenanceDocument> {
    const generator = await findGeneratorOrThrow(input.generatorId);
    await assertTechnicianAssignment(actorRole, actorUserId, input.generatorId);

    const existing = await findOpenRecord(input.generatorId);
    if (existing) {
      throw new ConflictError('This generator already has an open maintenance record', [
        { field: 'generatorId', message: `An open maintenance record already exists (id: ${existing._id})` },
      ]);
    }

    if (input.meter < generator.currentMeter) {
      throw new ValidationError('Validation failed', [
        { field: 'meter', message: `meter cannot be less than the generator's current meter (${generator.currentMeter})` },
      ]);
    }

    const partsCost = input.partsCost ?? 0;
    const oilCost = input.oilCost ?? 0;
    const laborCost = input.laborCost ?? 0;
    const transportCost = input.transportCost ?? 0;

    let record: MaintenanceDocument;
    try {
      record = await MaintenanceModel.create({
        generatorId: input.generatorId,
        type: input.type,
        date: input.date,
        meter: input.meter,
        partsCost: toDecimal128(partsCost),
        oilCost: toDecimal128(oilCost),
        laborCost: toDecimal128(laborCost),
        transportCost: toDecimal128(transportCost),
        totalCost: computeTotalCost({ partsCost, oilCost, laborCost, transportCost }),
        maintenanceCycleOverride: input.maintenanceCycleOverride ?? null,
        notes: input.notes ?? '',
      });
    } catch (error) {
      throwIfDuplicateKey(error);
    }

    await AuditService.record({
      action: 'maintenance.open',
      actorUserId,
      entityType: 'Maintenance',
      entityId: String(record._id),
      metadata: { after: record.toObject() },
    });

    // FR-003: an Open record already outranks "Available" in Business Rule 6.1's priority
    // order, so opening (not only starting) must recalculate status.
    await recalculateStatus(String(record.generatorId), 'Maintenance opened');

    await populateRefs(record);
    return record;
  },

  async update(
    maintenanceId: string,
    input: UpdateMaintenanceInput,
    actorUserId: string,
    actorRole: string,
  ): Promise<MaintenanceDocument> {
    const record = await MaintenanceModel.findById(maintenanceId);
    if (!record) {
      throw new NotFoundError('Maintenance record not found');
    }
    if (!OPEN_STATUSES.includes(record.status as (typeof OPEN_STATUSES)[number])) {
      throw new ConflictError('Only Open or In Progress records can be edited');
    }
    await assertTechnicianAssignment(actorRole, actorUserId, String(record.generatorId));

    const before = record.toObject();

    const partsCost = input.partsCost ?? Number(record.partsCost.toString());
    const oilCost = input.oilCost ?? Number(record.oilCost.toString());
    const laborCost = input.laborCost ?? Number(record.laborCost.toString());
    const transportCost = input.transportCost ?? Number(record.transportCost.toString());

    record.partsCost = toDecimal128(partsCost);
    record.oilCost = toDecimal128(oilCost);
    record.laborCost = toDecimal128(laborCost);
    record.transportCost = toDecimal128(transportCost);
    record.totalCost = computeTotalCost({ partsCost, oilCost, laborCost, transportCost });
    if (input.maintenanceCycleOverride !== undefined) {
      record.maintenanceCycleOverride = input.maintenanceCycleOverride;
    }
    if (input.notes !== undefined) {
      record.notes = input.notes;
    }

    await record.save();

    await AuditService.record({
      action: 'maintenance.update',
      actorUserId,
      entityType: 'Maintenance',
      entityId: String(record._id),
      metadata: { before, after: record.toObject() },
    });

    await populateRefs(record);
    return record;
  },

  /** FR-003: Open → In Progress. */
  async start(maintenanceId: string, actorUserId: string, actorRole: string): Promise<MaintenanceDocument> {
    const record = await MaintenanceModel.findById(maintenanceId);
    if (!record) {
      throw new NotFoundError('Maintenance record not found');
    }
    if (record.status !== 'Open') {
      throw new ConflictError('Only an Open record can be started');
    }
    await assertTechnicianAssignment(actorRole, actorUserId, String(record.generatorId));

    record.status = 'In Progress';
    await record.save();

    await AuditService.record({
      action: 'maintenance.start',
      actorUserId,
      entityType: 'Maintenance',
      entityId: String(record._id),
      metadata: {},
    });

    await recalculateStatus(String(record.generatorId), 'Maintenance started');

    await populateRefs(record);
    return record;
  },

  /** FR-004: → Completed, computes nextMaintenanceMeter via the Schedule Engine. */
  async complete(maintenanceId: string, actorUserId: string): Promise<MaintenanceDocument> {
    const record = await MaintenanceModel.findById(maintenanceId);
    if (!record) {
      throw new NotFoundError('Maintenance record not found');
    }
    if (!OPEN_STATUSES.includes(record.status as (typeof OPEN_STATUSES)[number])) {
      throw new ConflictError('Only an Open or In Progress record can be completed');
    }

    record.status = 'Completed';
    await record.save();

    const nextMaintenanceMeter = await MaintenanceScheduleEngineService.computeNext(maintenanceId);
    record.nextMaintenanceMeter = nextMaintenanceMeter;

    await AuditService.record({
      action: 'maintenance.complete',
      actorUserId,
      entityType: 'Maintenance',
      entityId: String(record._id),
      metadata: { nextMaintenanceMeter },
    });

    await recalculateStatus(String(record.generatorId), 'Maintenance completed');

    await record.populate(GENERATOR_POPULATE);
    return record;
  },

  /** Edge Case (Section 20): cancelling never computes a nextMaintenanceMeter. */
  async cancel(maintenanceId: string, input: CancelMaintenanceInput, actorUserId: string): Promise<MaintenanceDocument> {
    const record = await MaintenanceModel.findById(maintenanceId);
    if (!record) {
      throw new NotFoundError('Maintenance record not found');
    }
    if (!OPEN_STATUSES.includes(record.status as (typeof OPEN_STATUSES)[number])) {
      throw new ConflictError('Only an Open or In Progress record can be cancelled');
    }

    record.status = 'Cancelled';
    record.cancelReason = input.reason;
    await record.save();

    await AuditService.record({
      action: 'maintenance.cancel',
      actorUserId,
      entityType: 'Maintenance',
      entityId: String(record._id),
      metadata: { reason: input.reason },
    });

    await recalculateStatus(String(record.generatorId), 'Maintenance cancelled');

    await populateRefs(record);
    return record;
  },
};
