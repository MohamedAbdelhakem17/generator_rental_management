import { AuditService } from '../audit/audit.service.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { MaintenanceModel } from '../maintenance/maintenance.model.js';
import { NotificationEngineService } from '../notification-engine/service.js';
import { SettingsService } from '../settings/settings.service.js';
import { isGeneratorAssignedToUser } from '../users/user.service.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError.js';
import { paginateQuery, type PaginatedResult } from '../../services/pagination.js';
import {
  MaintenanceAlertModel,
  type MaintenanceAlertAttrs,
  type MaintenanceAlertDocument,
  type MaintenanceAlertLevel,
} from './maintenance-alert.model.js';
import type { ListMaintenanceAlertsQuery } from './maintenance-alert.validation.js';

const ALLOWED_SORT_FIELDS = ['createdAt'] as const;
const OPEN_STATUSES = ['Open', 'Acknowledged'] as const;
const TECHNICIAN_ROLE_NAME = 'Technician';
const GENERATOR_POPULATE = { path: 'generatorId', select: 'code' };

async function populateRefs<T extends { populate: (options: { path: string; select: string }) => Promise<unknown> }>(
  target: T,
): Promise<T> {
  await target.populate(GENERATOR_POPULATE);
  return target;
}

async function populateRefsMany<T extends { _id: unknown }>(items: T[]): Promise<void> {
  await MaintenanceAlertModel.populate(items, GENERATOR_POPULATE);
}

async function getUpcomingBufferHours(): Promise<number> {
  return SettingsService.getMaintenanceUpcomingBufferHours();
}

/** Business Rule 6.6/FR-001: `currentMeter >= dueAtMeter` -> Overdue; within the configured
 * buffer below it -> Upcoming; otherwise no alert (meters never decrease in this domain, so
 * there is no "un-alert" case to handle once a threshold is crossed). */
function levelFor(currentMeter: number, dueAtMeter: number, bufferHours: number): MaintenanceAlertLevel | null {
  if (currentMeter >= dueAtMeter) return 'Overdue';
  if (currentMeter >= dueAtMeter - bufferHours) return 'Upcoming';
  return null;
}

async function assertTechnicianAssignment(actorRole: string, actorUserId: string, generatorId: string): Promise<void> {
  if (actorRole !== TECHNICIAN_ROLE_NAME) return;
  const assigned = await isGeneratorAssignedToUser(actorUserId, generatorId);
  if (!assigned) {
    throw new ForbiddenError('You are not assigned to this generator');
  }
}

export const MaintenanceScheduleEngineService = {
  /** FR-001: nextMaintenanceMeter = meter (at completion) + (override ?? Generator.maintenanceCycleHours). */
  async computeNext(maintenanceId: string): Promise<number> {
    const record = await MaintenanceModel.findById(maintenanceId);
    if (!record) {
      throw new NotFoundError('Maintenance record not found');
    }
    const generator = await GeneratorModel.findById(record.generatorId);
    if (!generator) {
      throw new NotFoundError('Generator not found');
    }

    const cycle = record.maintenanceCycleOverride ?? generator.maintenanceCycleHours;
    const nextMaintenanceMeter = record.meter + cycle;

    record.nextMaintenanceMeter = nextMaintenanceMeter;
    await record.save();

    return nextMaintenanceMeter;
  },

  /**
   * FR-001-003: compares this generator's currentMeter to its latest completed maintenance
   * record's nextMaintenanceMeter, creating/upgrading an alert as needed. Called both on
   * every Operation Log write (FR-002, immediate) and from the hourly sweep job (fallback).
   */
  async evaluateGenerator(generatorId: string): Promise<void> {
    const generator = await GeneratorModel.findOne({ _id: generatorId, isDeleted: { $ne: true } });
    if (!generator) return;

    const latestCompleted = await MaintenanceModel.findOne({
      generatorId,
      status: 'Completed',
      nextMaintenanceMeter: { $ne: null },
    }).sort({ updatedAt: -1 });
    if (!latestCompleted || latestCompleted.nextMaintenanceMeter === null) return;

    const dueAtMeter = latestCompleted.nextMaintenanceMeter;
    const bufferHours = await getUpcomingBufferHours();
    const level = levelFor(generator.currentMeter, dueAtMeter, bufferHours);
    if (!level) return;

    const existing = await MaintenanceAlertModel.findOne({ generatorId, status: { $in: OPEN_STATUSES } });
    if (existing) {
      // FR-003: upgrade Upcoming -> Overdue in place rather than creating a second alert;
      // never downgrade (meters only increase, so this only ever moves one direction).
      if (existing.level !== 'Overdue' && level === 'Overdue') {
        existing.level = 'Overdue';
        await existing.save();
        await NotificationEngineService.notify({
          recipientRoles: ['Operations Manager', 'System Admin'],
          message: `${generator.code} maintenance overdue — meter ${generator.currentMeter} past due at ${dueAtMeter}`,
          severity: 'critical',
          entityType: 'MaintenanceAlert',
          entityId: String(existing._id),
        });
      }
      return;
    }

    const alert = await MaintenanceAlertModel.create({
      generatorId,
      level,
      dueAtMeter,
      currentMeterAtCreation: generator.currentMeter,
    });

    await NotificationEngineService.notify({
      recipientRoles: ['Operations Manager', 'System Admin'],
      message:
        level === 'Overdue'
          ? `${generator.code} maintenance overdue — meter ${generator.currentMeter} past due at ${dueAtMeter}`
          : `${generator.code} maintenance due soon — meter ${generator.currentMeter} approaching ${dueAtMeter}`,
      severity: level === 'Overdue' ? 'critical' : 'warning',
      entityType: 'MaintenanceAlert',
      entityId: String(alert._id),
    });
  },

  /** Edge Case (Section 20): opening a new Maintenance record addresses any outstanding
   * schedule alert for that generator, so it auto-resolves rather than lingering. */
  async autoResolveForGenerator(generatorId: string, triggeringMaintenanceId: string): Promise<void> {
    const existing = await MaintenanceAlertModel.findOne({ generatorId, status: { $in: OPEN_STATUSES } });
    if (!existing) return;

    existing.status = 'Resolved';
    existing.resolvedAt = new Date();
    existing.resolvedBy = 'system';
    await existing.save();

    await AuditService.record({
      action: 'maintenanceAlert.autoResolve',
      actorUserId: null,
      entityType: 'MaintenanceAlert',
      entityId: String(existing._id),
      metadata: { triggeringMaintenanceId },
    });
  },

  async list(
    options: ListMaintenanceAlertsQuery,
    restrictToGeneratorIds?: string[],
  ): Promise<PaginatedResult<MaintenanceAlertAttrs>> {
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
    if (options.level) filters.level = options.level;

    const result = await paginateQuery(MaintenanceAlertModel, filters, {
      page: options.page,
      limit: options.limit,
      sort: options.sort ?? '-createdAt',
      allowedSortFields: ALLOWED_SORT_FIELDS,
    });
    await populateRefsMany(result.items);
    return result;
  },

  async acknowledge(alertId: string, actorUserId: string, actorRole: string): Promise<MaintenanceAlertDocument> {
    const alert = await MaintenanceAlertModel.findById(alertId);
    if (!alert) {
      throw new NotFoundError('Maintenance alert not found');
    }
    await assertTechnicianAssignment(actorRole, actorUserId, String(alert.generatorId));

    if (alert.status !== 'Open') {
      throw new ValidationError('Validation failed', [
        { field: 'status', message: 'Only an Open alert can be acknowledged' },
      ]);
    }

    alert.status = 'Acknowledged';
    await alert.save();

    await AuditService.record({
      action: 'maintenanceAlert.acknowledge',
      actorUserId,
      entityType: 'MaintenanceAlert',
      entityId: alertId,
      metadata: { generatorId: String(alert.generatorId) },
    });

    await populateRefs(alert);
    return alert;
  },
};
