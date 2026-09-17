import { ForbiddenError, NotFoundError, ValidationError } from '../../utils/AppError.js';
import { toDecimal } from '../../services/money.js';
import { AuditService } from '../audit/audit.service.js';
import { isKnownSettingKey, SETTING_KEYS, type SettingCategory, type SettingKey } from './settings.keys.js';
import { SETTING_VALUE_SCHEMAS } from './settings.validation.js';
import { SINGLETON_KEY, SystemSettingModel, type SystemSettingAttrs, type SystemSettingDocument } from './systemSetting.model.js';

/**
 * Section 11: "a small in-memory cache (with invalidation on write) avoids a DB round-trip on
 * every read of hot settings like `vatRate`" — the singleton document changes rarely, so a
 * single cached value with a write-time invalidation (no TTL) is sufficient; no Redis, per the
 * Constitution's "in-memory only" constraint.
 */
let cache: SystemSettingDocument | null = null;

function invalidateCache(): void {
  cache = null;
}

async function loadSettings(): Promise<SystemSettingDocument> {
  if (cache) return cache;
  const settings = await SystemSettingModel.findOne({ key: SINGLETON_KEY });
  if (!settings) {
    throw new Error('SystemSetting has not been seeded — run the baseline seed');
  }
  cache = settings;
  return settings;
}

function decimalToNumber(value: SystemSettingAttrs['vatRatePercent']): number {
  return toDecimal(value).toNumber();
}

function serializeValue(field: keyof SystemSettingAttrs, settings: SystemSettingDocument): unknown {
  const raw = settings[field];
  if (field === 'vatRatePercent' || field === 'fuelTolerancePercent' || field === 'fuelCriticalTolerancePercent') {
    return decimalToNumber(raw as SystemSettingAttrs['vatRatePercent']);
  }
  return raw;
}

function assertCategoryPermission(actorPermissions: string[], category: SettingCategory): void {
  if (actorPermissions.includes('settings:manage')) return;
  if (category === 'Financial' && actorPermissions.includes('settings:finance')) return;
  throw new ForbiddenError('You do not have permission to change this setting');
}

/** Section 16: fuelAlertTolerancePercent (Warning) must stay below fuelAlertCriticalPercent. */
async function assertFuelToleranceOrdering(
  key: SettingKey,
  numericValue: number,
  current: SystemSettingDocument,
): Promise<void> {
  const warning = key === 'fuelAlertTolerancePercent' ? numericValue : decimalToNumber(current.fuelTolerancePercent);
  const critical =
    key === 'fuelAlertCriticalPercent' ? numericValue : decimalToNumber(current.fuelCriticalTolerancePercent);
  if (warning >= critical) {
    throw new ValidationError('Validation failed', [
      { field: key, message: 'fuelAlertTolerancePercent must be less than fuelAlertCriticalPercent' },
    ]);
  }
}

export const SettingsService = {
  /** Cached typed readers — the "consumed by name via SystemSetting lookups, never hardcoded"
   * layer (Section 6/FR-001) every other engine should call instead of querying
   * `SystemSettingModel` directly. */
  async getVatRateFraction() {
    return toDecimal((await loadSettings()).vatRatePercent).dividedBy(100);
  },
  async getFuelToleranceBands() {
    const settings = await loadSettings();
    return {
      warningPercent: toDecimal(settings.fuelTolerancePercent),
      criticalPercent: toDecimal(settings.fuelCriticalTolerancePercent),
    };
  },
  async getMaintenanceUpcomingBufferHours(): Promise<number> {
    return (await loadSettings()).maintenanceUpcomingBufferHours;
  },
  async getDefaultMaintenanceCycleHours(): Promise<number> {
    return (await loadSettings()).defaultMaintenanceCycleHours;
  },
  async getExpenseCategories(): Promise<string[]> {
    return (await loadSettings()).expenseCategories;
  },
  async getPaymentMethods(): Promise<string[]> {
    return (await loadSettings()).paymentMethods;
  },
  async getOverdueGracePeriodDays(): Promise<number> {
    return (await loadSettings()).overdueGracePeriodDays;
  },

  /** Section 12 GET /api/settings: grouped by category, field-filtered for Finance Manager
   * (Financial only) rather than just hidden client-side. */
  async getGrouped(actorPermissions: string[]): Promise<Record<SettingCategory, Record<string, unknown>>> {
    const settings = await loadSettings();
    const grouped: Record<SettingCategory, Record<string, unknown>> = {
      Financial: {},
      Operational: {},
      ReferenceList: {},
    };

    for (const [key, definition] of Object.entries(SETTING_KEYS) as [SettingKey, (typeof SETTING_KEYS)[SettingKey]][]) {
      const canView =
        actorPermissions.includes('settings:manage') ||
        (definition.category === 'Financial' && actorPermissions.includes('settings:finance'));
      if (!canView) continue;
      grouped[definition.category][key] = serializeValue(definition.field, settings);
    }

    return grouped;
  },

  async updateOne(
    key: string,
    rawValue: unknown,
    actor: { userId: string; permissions: string[] },
  ): Promise<{ before: unknown; after: unknown }> {
    if (!isKnownSettingKey(key)) {
      throw new NotFoundError('Unknown setting key');
    }
    const definition = SETTING_KEYS[key];
    assertCategoryPermission(actor.permissions, definition.category);

    const schema = SETTING_VALUE_SCHEMAS[key];
    const parsed = schema.safeParse(rawValue);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((issue) => ({ field: key, message: issue.message })),
      );
    }

    // Re-read (not the module cache) so a concurrent edit's before/ordering-check is never
    // computed against a stale in-memory snapshot — last-write-wins per Section 20, but each
    // write still validates against the latest persisted state.
    const current = await SystemSettingModel.findOne({ key: SINGLETON_KEY });
    if (!current) {
      throw new Error('SystemSetting has not been seeded — run the baseline seed');
    }

    if (key === 'fuelAlertTolerancePercent' || key === 'fuelAlertCriticalPercent') {
      await assertFuelToleranceOrdering(key, parsed.data as number, current);
    }

    const before = serializeValue(definition.field, current);
    const storedValue =
      key === 'vatRate' || key === 'fuelAlertTolerancePercent' || key === 'fuelAlertCriticalPercent'
        ? String(parsed.data)
        : parsed.data;

    const updated = await SystemSettingModel.findOneAndUpdate(
      { key: SINGLETON_KEY },
      { $set: { [definition.field]: storedValue, updatedBy: actor.userId } },
      { new: true },
    );
    if (!updated) {
      throw new Error('SystemSetting has not been seeded — run the baseline seed');
    }
    invalidateCache();

    const after = parsed.data;
    await AuditService.record({
      action: 'settings.update',
      actorUserId: actor.userId,
      entityType: 'SystemSetting',
      entityId: String(updated._id),
      metadata: { key, before, after },
    });

    return { before, after };
  },
};
