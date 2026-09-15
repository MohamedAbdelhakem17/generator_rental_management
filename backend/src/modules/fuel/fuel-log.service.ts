import { AuditService } from '../audit/audit.service.js';
import { FuelAlertEngineService } from '../fuel-alert-engine/service.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { OperationLogModel } from '../operations/operation-log.model.js';
import { ProjectModel } from '../projects/project.model.js';
import { isGeneratorAssignedToUser } from '../users/user.service.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError.js';
import { toDecimal, toDecimal128 } from '../../services/money.js';
import { paginateQuery, type PaginatedResult } from '../../services/pagination.js';
import { FuelLogModel, type FuelLogAttrs, type FuelLogDocument } from './fuel-log.model.js';
import type { CreateFuelLogInput, ListFuelLogsQuery } from './fuel-log.validation.js';

const ALLOWED_SORT_FIELDS = ['date', 'createdAt'] as const;
const TECHNICIAN_ROLE_NAME = 'Technician';
const GENERATOR_POPULATE = { path: 'generatorId', select: 'code normalFuelConsumption' };
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
  await FuelLogModel.populate(items, GENERATOR_POPULATE);
  await FuelLogModel.populate(items, PROJECT_POPULATE);
}

async function assertProjectExists(projectId: string): Promise<void> {
  const project = await ProjectModel.findOne({ _id: projectId, isDeleted: { $ne: true } });
  if (!project) {
    throw new ValidationError('Validation failed', [{ field: 'projectId', message: 'Project does not exist' }]);
  }
}

async function assertGeneratorExists(generatorId: string): Promise<void> {
  const generator = await GeneratorModel.findOne({ _id: generatorId, isDeleted: { $ne: true } });
  if (!generator) {
    throw new ValidationError('Validation failed', [{ field: 'generatorId', message: 'Generator does not exist' }]);
  }
}

async function assertTechnicianAssignment(actorRole: string, actorUserId: string, generatorId: string): Promise<void> {
  if (actorRole !== TECHNICIAN_ROLE_NAME) return;
  const assigned = await isGeneratorAssignedToUser(actorUserId, generatorId);
  if (!assigned) {
    throw new ForbiddenError('You are not assigned to this generator');
  }
}

/**
 * Business Rule 6.4/FR-002: "operating hours in its own reference window" (Section 20) — the
 * window is "however many Active operating hours were logged since this generator's previous
 * fuel log." Bounded by real `createdAt` timestamps rather than the coarse, day-only `date`
 * field: two fill-ups logged on the *same calendar day* (Section 20's explicit edge case)
 * would otherwise produce an empty (start > end) date range. Using `createdAt` for the lower
 * bound and `date <= this fuel log's date` for the upper bound handles both the common
 * different-day case and the same-day case identically, and still lets a backdated Operation
 * Log entered before this fuel log's own `createdAt` count toward it. The very first fuel log
 * for a generator has no prior log to bound the window, so it looks back to the epoch
 * (effectively "all recorded hours to date"). Scoped by generatorId only, not project —
 * engine hours are a property of the physical generator, not whichever project it's logged
 * under.
 */
async function findContributingOperationLogs(
  generatorId: string,
  fuelLogDate: Date,
  options: { beforeCreatedAt?: Date; excludeFuelLogId?: string } = {},
) {
  const previous = await FuelLogModel.findOne({
    generatorId,
    ...(options.excludeFuelLogId ? { _id: { $ne: options.excludeFuelLogId } } : {}),
    ...(options.beforeCreatedAt ? { createdAt: { $lt: options.beforeCreatedAt } } : {}),
  }).sort({ createdAt: -1 });

  const windowStart = previous ? previous.createdAt : new Date(0);
  return OperationLogModel.find({
    generatorId,
    status: 'Active',
    date: { $lte: fuelLogDate },
    createdAt: { $gt: windowStart },
  });
}

/** FR-002/Data Model: `operatingHoursRef` is null (not 0) when no Operation Log exists in the window. */
async function computeOperatingHoursRef(generatorId: string, date: Date): Promise<number | null> {
  const logs = await findContributingOperationLogs(generatorId, date);
  if (logs.length === 0) return null;
  return logs.reduce((total, log) => total + log.operatingHours, 0);
}

export const FuelLogService = {
  async list(options: ListFuelLogsQuery, restrictToGeneratorIds?: string[]): Promise<PaginatedResult<FuelLogAttrs>> {
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

    const result = await paginateQuery(FuelLogModel, filters, {
      page: options.page,
      limit: options.limit,
      sort: options.sort ?? '-date',
      allowedSortFields: ALLOWED_SORT_FIELDS,
    });
    await populateRefsMany(result.items);
    return result;
  },

  async getById(
    fuelLogId: string,
    restrictToGeneratorIds?: string[],
  ): Promise<{ fuelLog: FuelLogDocument; contributingOperationLogIds: string[] }> {
    const fuelLog = await FuelLogModel.findById(fuelLogId);
    if (!fuelLog) {
      throw new NotFoundError('Fuel log not found');
    }
    if (restrictToGeneratorIds && !restrictToGeneratorIds.includes(String(fuelLog.generatorId))) {
      throw new ForbiddenError('You are not assigned to this generator');
    }

    // Must run before `populateRefs` replaces `generatorId` with the populated sub-document.
    const contributingLogs = await findContributingOperationLogs(String(fuelLog.generatorId), fuelLog.date, {
      beforeCreatedAt: fuelLog.createdAt,
      excludeFuelLogId: fuelLogId,
    });

    await populateRefs(fuelLog);
    return { fuelLog, contributingOperationLogIds: contributingLogs.map((log) => String(log._id)) };
  },

  async create(input: CreateFuelLogInput, actorUserId: string, actorRole: string): Promise<FuelLogDocument> {
    await assertProjectExists(input.projectId);
    await assertGeneratorExists(input.generatorId);
    await assertTechnicianAssignment(actorRole, actorUserId, input.generatorId);

    const operatingHoursRef = await computeOperatingHoursRef(input.generatorId, input.date);
    const consumptionRate = operatingHoursRef && operatingHoursRef > 0 ? input.liters / operatingHoursRef : null;
    const totalCost = toDecimal128(toDecimal(input.liters).times(input.pricePerLiter));

    const fuelLog = await FuelLogModel.create({
      date: input.date,
      generatorId: input.generatorId,
      projectId: input.projectId,
      liters: input.liters,
      pricePerLiter: toDecimal128(input.pricePerLiter),
      totalCost,
      operatingHoursRef,
      consumptionRate,
    });

    await AuditService.record({
      action: 'fuel.create',
      actorUserId,
      entityType: 'FuelLog',
      entityId: String(fuelLog._id),
      metadata: { after: fuelLog.toObject() },
    });

    // FR-003: hands off to the alert engine after every creation — TASK-017 owns evaluation.
    await FuelAlertEngineService.evaluate(String(fuelLog._id));

    await populateRefs(fuelLog);
    return fuelLog;
  },
};
