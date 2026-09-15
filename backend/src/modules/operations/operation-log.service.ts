import { AuditService } from '../audit/audit.service.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { ProjectModel } from '../projects/project.model.js';
import { isGeneratorAssignedToUser } from '../users/user.service.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError.js';
import { paginateQuery, type PaginatedResult } from '../../services/pagination.js';
import { OperationLogModel, type OperationLogAttrs, type OperationLogDocument } from './operation-log.model.js';
import type { CorrectOperationLogInput, CreateOperationLogInput, ListOperationLogsQuery } from './operation-log.validation.js';

const ALLOWED_SORT_FIELDS = ['date', 'createdAt'] as const;
const TECHNICIAN_ROLE_NAME = 'Technician';
const GENERATOR_POPULATE = { path: 'generatorId', select: 'code' };
const PROJECT_POPULATE = { path: 'projectId', select: 'code name' };

/** See the identical note in `contracts/contract.service.ts` re: Mongoose's `.populate()` overloads. */
async function populateRefs<T extends { populate: (options: { path: string; select: string }) => Promise<unknown> }>(
  target: T,
): Promise<T> {
  await target.populate(GENERATOR_POPULATE);
  await target.populate(PROJECT_POPULATE);
  return target;
}

async function populateRefsMany<T extends { _id: unknown }>(items: T[]): Promise<void> {
  await OperationLogModel.populate(items, GENERATOR_POPULATE);
  await OperationLogModel.populate(items, PROJECT_POPULATE);
}

async function assertProjectExists(projectId: string): Promise<void> {
  const project = await ProjectModel.findOne({ _id: projectId, isDeleted: { $ne: true } });
  if (!project) {
    throw new ValidationError('Validation failed', [{ field: 'projectId', message: 'Project does not exist' }]);
  }
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

/**
 * FR-004, kept correct even for backdated/out-of-order entries and corrections to older
 * records: `Generator.currentMeter` always mirrors the latest (by date) *Active* log's
 * `endMeter` — never the just-written record's value blindly.
 */
async function recalculateCurrentMeter(generatorId: string): Promise<void> {
  const latest = await OperationLogModel.findOne({ generatorId, status: 'Active' }).sort({ date: -1, createdAt: -1 });
  if (!latest) return;
  await GeneratorModel.updateOne({ _id: generatorId }, { currentMeter: latest.endMeter });
}

export const OperationLogService = {
  async list(
    options: ListOperationLogsQuery,
    restrictToGeneratorIds?: string[],
  ): Promise<PaginatedResult<OperationLogAttrs>> {
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
    if (options.projectId) filters.projectId = options.projectId;
    if (options.dateFrom || options.dateTo) {
      filters.date = {
        ...(options.dateFrom ? { $gte: options.dateFrom } : {}),
        ...(options.dateTo ? { $lte: options.dateTo } : {}),
      };
    }

    const result = await paginateQuery(OperationLogModel, filters, {
      page: options.page,
      limit: options.limit,
      sort: options.sort ?? '-date',
      allowedSortFields: ALLOWED_SORT_FIELDS,
    });
    await populateRefsMany(result.items);
    return result;
  },

  async getById(logId: string, restrictToGeneratorIds?: string[]): Promise<OperationLogDocument> {
    const log = await OperationLogModel.findById(logId);
    if (!log) {
      throw new NotFoundError('Operation log not found');
    }
    if (restrictToGeneratorIds && !restrictToGeneratorIds.includes(String(log.generatorId))) {
      throw new ForbiddenError('You are not assigned to this generator');
    }
    await populateRefs(log);
    return log;
  },

  async create(input: CreateOperationLogInput, actorUserId: string, actorRole: string): Promise<OperationLogDocument> {
    await assertProjectExists(input.projectId);
    const generator = await findGeneratorOrThrow(input.generatorId);
    await assertTechnicianAssignment(actorRole, actorUserId, input.generatorId);

    // FR-003: prevents an impossible backward reading on a normal (non-correction) entry.
    if (input.startMeter < generator.currentMeter) {
      throw new ConflictError(
        `startMeter cannot be less than the generator's current meter (${generator.currentMeter})`,
      );
    }

    const log = await OperationLogModel.create({
      date: input.date,
      projectId: input.projectId,
      generatorId: input.generatorId,
      startMeter: input.startMeter,
      endMeter: input.endMeter,
      operatingHours: input.endMeter - input.startMeter,
      downtimeHours: input.downtimeHours ?? 0,
      notes: input.notes ?? '',
    });

    await recalculateCurrentMeter(input.generatorId);

    await AuditService.record({
      action: 'operation.create',
      actorUserId,
      entityType: 'OperationLog',
      entityId: String(log._id),
      metadata: { after: log.toObject() },
    });

    await populateRefs(log);
    return log;
  },

  /** FR-005: supersedes the original rather than editing it — both remain queryable. */
  async correct(logId: string, input: CorrectOperationLogInput, actorUserId: string): Promise<OperationLogDocument> {
    const original = await OperationLogModel.findById(logId);
    if (!original) {
      throw new NotFoundError('Operation log not found');
    }
    if (original.status === 'Superseded') {
      throw new ConflictError('This entry has already been corrected');
    }

    const startMeter = input.startMeter ?? original.startMeter;
    const endMeter = input.endMeter ?? original.endMeter;

    const corrected = await OperationLogModel.create({
      date: original.date,
      projectId: original.projectId,
      generatorId: original.generatorId,
      startMeter,
      endMeter,
      operatingHours: endMeter - startMeter,
      downtimeHours: original.downtimeHours,
      notes: original.notes,
      correctionOf: original._id,
      correctionReason: input.reason,
    });

    original.status = 'Superseded';
    await original.save();

    await recalculateCurrentMeter(String(original.generatorId));

    await AuditService.record({
      action: 'operation.correct',
      actorUserId,
      entityType: 'OperationLog',
      entityId: String(corrected._id),
      metadata: {
        originalId: String(original._id),
        before: { startMeter: original.startMeter, endMeter: original.endMeter },
        after: { startMeter, endMeter },
        reason: input.reason,
      },
    });

    await populateRefs(corrected);
    return corrected;
  },
};
