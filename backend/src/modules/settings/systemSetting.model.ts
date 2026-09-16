import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

/**
 * TASK-007 seeded a minimal version of this model ahead of TASK-030's full Settings module
 * (Constitution Article I.3: extend, don't duplicate). TASK-030 keeps the same singleton-document
 * shape (one fixed-field document per Section 10's field list) rather than switching to the PRD's
 * literal generic `key`/`value`/`category` row-per-setting model: three engines (Fuel Alert,
 * Maintenance Schedule, Financial Calculation) already read these as typed fields, and a generic
 * `Mixed` value store would just push the same type-casting back into every one of those call
 * sites. `SettingsService` (this module's `service.ts`) is the "consumed by name, never
 * hardcoded" layer the PRD Section 6/FR-001 actually cares about — each field below is still one
 * named, cached, audited setting; only the storage shape differs from the PRD's literal table.
 *
 * Rates are `Decimal128` (not a plain number) because they're multiplied against money
 * elsewhere (VAT on an Extract, fuel tolerance against liters) and go through the same
 * decimal-safe arithmetic every other rate/amount in the system uses.
 */
export const SINGLETON_KEY = 'default';

export interface SystemSettingAttrs {
  key: string;
  vatRatePercent: Types.Decimal128;
  currency: string;
  /** TASK-017 FR-001: the Fuel Alert Engine's Warning-band threshold (Business Rule 6.5). */
  fuelTolerancePercent: Types.Decimal128;
  /** TASK-017 FR-001: the Critical-band threshold. */
  fuelCriticalTolerancePercent: Types.Decimal128;
  /** TASK-019 FR-002: the Maintenance Schedule Engine's "Upcoming" buffer, in meter-hours
   * before `nextMaintenanceMeter` — a plain Number (not Decimal128), since it's a meter-hours
   * count, not money. */
  maintenanceUpcomingBufferHours: number;
  /** TASK-030 Section 6: accepted collection payment methods (Receipts). */
  paymentMethods: string[];
  /** TASK-030 Section 6, closing TASK-024's FR-001 gap: the managed Expense category list —
   * `ExpenseService` validates new/edited expenses' `category` against this list. */
  expenseCategories: string[];
  /** TASK-030 Section 6: the default `Generator.maintenanceCycleHours` a new generator gets
   * when no explicit value is provided — `GeneratorService.create` reads this instead of a
   * hardcoded literal. */
  defaultMaintenanceCycleHours: number;
  /** TASK-030 Section 6: days of no payment after which a customer is considered overdue.
   * Not yet consumed by an "overdue customer" job — no such job exists yet (see TASK-026/027
   * notes); stored here so that future job has a real, non-hardcoded input to read. */
  overdueGracePeriodDays: number;
  /** Section 10: actor of the most recent change, for the Settings page's own display —
   * the audit trail itself is per-change via AuditService, not derived from this field. */
  updatedBy: Types.ObjectId | null;
}

const systemSettingSchema = new Schema<SystemSettingAttrs>(
  {
    key: { type: String, required: true },
    vatRatePercent: { type: Schema.Types.Decimal128, required: true },
    currency: { type: String, required: true },
    fuelTolerancePercent: { type: Schema.Types.Decimal128, required: true },
    fuelCriticalTolerancePercent: { type: Schema.Types.Decimal128, required: true },
    maintenanceUpcomingBufferHours: { type: Number, required: true, default: 50, min: 0 },
    paymentMethods: {
      type: [String],
      required: true,
      default: ['Cash', 'Bank Transfer', 'Cheque'],
    },
    expenseCategories: {
      type: [String],
      required: true,
      default: ['Transport', 'Office', 'Utilities', 'Administrative', 'Bulk', 'Miscellaneous'],
    },
    defaultMaintenanceCycleHours: { type: Number, required: true, default: 250, min: 0.01 },
    overdueGracePeriodDays: { type: Number, required: true, default: 30, min: 0 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

systemSettingSchema.index({ key: 1 }, { unique: true, name: 'systemsettings_key_idx' });

export type SystemSettingDocument = HydratedDocument<SystemSettingAttrs>;
export const SystemSettingModel: Model<SystemSettingAttrs> = model<SystemSettingAttrs>(
  'SystemSetting',
  systemSettingSchema,
);
