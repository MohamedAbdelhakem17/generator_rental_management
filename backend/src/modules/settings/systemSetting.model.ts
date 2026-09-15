import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

/**
 * Minimal seed of the System Settings domain (full CRUD/admin UI is TASK-030). A single
 * document (`SINGLETON_KEY`) holds the point-in-time defaults TASK-007's baseline seed
 * needs — VAT rate, currency, fuel tolerance — per PRD Section 6. TASK-030 extends this
 * same model rather than introducing a second one (Constitution Article I.3).
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
  /** TASK-017 FR-001: the Critical-band threshold — added ahead of TASK-030's full Settings
   * UI, same "the module that needs it now extends this shared seed" precedent as every
   * other cross-task model extension in this codebase (e.g. TASK-013 on ContractItem). */
  fuelCriticalTolerancePercent: Types.Decimal128;
  /** TASK-019 FR-002: the Maintenance Schedule Engine's "Upcoming" buffer, in meter-hours
   * before `nextMaintenanceMeter` — a plain Number (not Decimal128), since it's a meter-hours
   * count, not money. */
  maintenanceUpcomingBufferHours: number;
}

const systemSettingSchema = new Schema<SystemSettingAttrs>(
  {
    key: { type: String, required: true },
    vatRatePercent: { type: Schema.Types.Decimal128, required: true },
    currency: { type: String, required: true },
    fuelTolerancePercent: { type: Schema.Types.Decimal128, required: true },
    fuelCriticalTolerancePercent: { type: Schema.Types.Decimal128, required: true },
    maintenanceUpcomingBufferHours: { type: Number, required: true, default: 50, min: 0 },
  },
  { timestamps: true },
);

systemSettingSchema.index({ key: 1 }, { unique: true, name: 'systemsettings_key_idx' });

export type SystemSettingDocument = HydratedDocument<SystemSettingAttrs>;
export const SystemSettingModel: Model<SystemSettingAttrs> = model<SystemSettingAttrs>(
  'SystemSetting',
  systemSettingSchema,
);
