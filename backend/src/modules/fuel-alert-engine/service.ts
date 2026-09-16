import { Decimal } from 'decimal.js';

import { AuditService } from '../audit/audit.service.js';
import { FuelLogModel } from '../fuel/fuel-log.model.js';
import { GeneratorModel } from '../generators/generator.model.js';
import { NotificationEngineService } from '../notification-engine/service.js';
import { SettingsService } from '../settings/settings.service.js';
import { isGeneratorAssignedToUser } from '../users/user.service.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError.js';
import { toDecimal } from '../../services/money.js';
import { paginateQuery, type PaginatedResult } from '../../services/pagination.js';
import { FuelAlertModel, type FuelAlertAttrs, type FuelAlertDocument, type FuelAlertSeverity } from './fuel-alert.model.js';
import type { ListFuelAlertsQuery, ResolveFuelAlertInput } from './fuel-alert.validation.js';

const ALLOWED_SORT_FIELDS = ['lastOccurrenceAt', 'firstOccurrenceAt', 'createdAt'] as const;
const TECHNICIAN_ROLE_NAME = 'Technician';
const OPEN_STATUSES = ['Open', 'Acknowledged'] as const;
const AUTO_RESOLUTION_NOTE = 'auto-resolved: consumption returned to normal range';
const GENERATOR_POPULATE = { path: 'generatorId', select: 'code' };

async function populateRefs<T extends { populate: (options: { path: string; select: string }) => Promise<unknown> }>(
  target: T,
): Promise<T> {
  await target.populate(GENERATOR_POPULATE);
  return target;
}

async function populateRefsMany<T extends { _id: unknown }>(items: T[]): Promise<void> {
  await FuelAlertModel.populate(items, GENERATOR_POPULATE);
}

async function getFuelToleranceBands(): Promise<{ warningPercent: Decimal; criticalPercent: Decimal }> {
  return SettingsService.getFuelToleranceBands();
}

/** Business Rule 6.5: Warning at 15–30% above normal, Critical above 30%; `null` = within tolerance. */
function severityFor(overPercent: Decimal, warningPercent: Decimal, criticalPercent: Decimal): FuelAlertSeverity | null {
  if (overPercent.greaterThan(criticalPercent)) return 'Critical';
  if (overPercent.greaterThan(warningPercent)) return 'Warning';
  return null;
}

async function assertTechnicianAssignment(actorRole: string, actorUserId: string, generatorId: string): Promise<void> {
  if (actorRole !== TECHNICIAN_ROLE_NAME) return;
  const assigned = await isGeneratorAssignedToUser(actorUserId, generatorId);
  if (!assigned) {
    throw new ForbiddenError('You are not assigned to this generator');
  }
}

export const FuelAlertEngineService = {
  /**
   * FR-001-003: compares this fuel log's consumptionRate to the generator's normal rate
   * (System-Setting-configured bands, never hardcoded). A `null` consumptionRate (Section 19
   * of TASK-016 — no operating hours in the reference window) has no reliable signal to
   * evaluate, so it's skipped entirely: neither triggers nor auto-resolves an alert.
   */
  async evaluate(fuelLogId: string): Promise<void> {
    const fuelLog = await FuelLogModel.findById(fuelLogId);
    if (!fuelLog || fuelLog.consumptionRate === null) return;

    const generator = await GeneratorModel.findById(fuelLog.generatorId);
    if (!generator || generator.normalFuelConsumption <= 0) return;

    const { warningPercent, criticalPercent } = await getFuelToleranceBands();
    const normal = toDecimal(generator.normalFuelConsumption);
    const overPercent = toDecimal(fuelLog.consumptionRate).minus(normal).dividedBy(normal).times(100);
    const severity = severityFor(overPercent, warningPercent, criticalPercent);

    const existing = await FuelAlertModel.findOne({ generatorId: fuelLog.generatorId, status: { $in: OPEN_STATUSES } });

    if (severity) {
      if (existing) {
        // FR-002: dedup — update the existing alert rather than creating a duplicate.
        existing.lastOccurrenceAt = new Date();
        existing.occurrenceCount += 1;
        existing.triggeringFuelLogId = fuelLog._id;
        existing.severity = severity;
        await existing.save();
        return;
      }

      const alert = await FuelAlertModel.create({
        generatorId: fuelLog.generatorId,
        severity,
        triggeringFuelLogId: fuelLog._id,
      });

      // Section 22: created on first occurrence only (the dedup branch above never re-notifies).
      await NotificationEngineService.notify({
        recipientRoles: ['Operations Manager', 'System Admin'],
        message: `${generator.code} consumption ${fuelLog.consumptionRate} L/h vs. normal ${generator.normalFuelConsumption} L/h (+${overPercent.toFixed(0)}%)`,
        severity: severity === 'Critical' ? 'critical' : 'warning',
        entityType: 'FuelAlert',
        entityId: String(alert._id),
      });
      return;
    }

    if (existing) {
      // FR-003: the next reading came back within tolerance — auto-resolve, don't reopen later.
      existing.status = 'Resolved';
      existing.resolutionNote = AUTO_RESOLUTION_NOTE;
      existing.resolvedAt = new Date();
      existing.resolvedBy = 'system';
      await existing.save();

      await NotificationEngineService.notify({
        recipientRoles: ['Operations Manager', 'System Admin'],
        message: `${generator.code} fuel alert resolved`,
        severity: 'info',
        entityType: 'FuelAlert',
        entityId: String(existing._id),
      });
    }
  },

  async list(
    options: ListFuelAlertsQuery,
    restrictToGeneratorIds?: string[],
  ): Promise<PaginatedResult<FuelAlertAttrs>> {
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
    if (options.severity) filters.severity = options.severity;

    const result = await paginateQuery(FuelAlertModel, filters, {
      page: options.page,
      limit: options.limit,
      sort: options.sort ?? '-lastOccurrenceAt',
      allowedSortFields: ALLOWED_SORT_FIELDS,
    });
    await populateRefsMany(result.items);
    return result;
  },

  async acknowledge(alertId: string, actorUserId: string, actorRole: string): Promise<FuelAlertDocument> {
    const alert = await FuelAlertModel.findById(alertId);
    if (!alert) {
      throw new NotFoundError('Fuel alert not found');
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
      action: 'fuelAlert.acknowledge',
      actorUserId,
      entityType: 'FuelAlert',
      entityId: alertId,
      metadata: { generatorId: String(alert.generatorId) },
    });

    await populateRefs(alert);
    return alert;
  },

  async resolve(alertId: string, input: ResolveFuelAlertInput, actorUserId: string): Promise<FuelAlertDocument> {
    const alert = await FuelAlertModel.findById(alertId);
    if (!alert) {
      throw new NotFoundError('Fuel alert not found');
    }
    if (alert.status === 'Resolved') {
      throw new ValidationError('Validation failed', [{ field: 'status', message: 'This alert is already Resolved' }]);
    }

    alert.status = 'Resolved';
    alert.resolutionNote = input.resolutionNote;
    alert.resolvedAt = new Date();
    alert.resolvedBy = 'user';
    await alert.save();

    await AuditService.record({
      action: 'fuelAlert.resolve',
      actorUserId,
      entityType: 'FuelAlert',
      entityId: alertId,
      metadata: { generatorId: String(alert.generatorId), resolutionNote: input.resolutionNote },
    });

    await populateRefs(alert);
    return alert;
  },
};
