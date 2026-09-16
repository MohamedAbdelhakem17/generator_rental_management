import type { SystemSettingAttrs } from './systemSetting.model.js';

export type SettingCategory = 'Financial' | 'Operational' | 'ReferenceList';

export type SettingKey =
  | 'vatRate'
  | 'currency'
  | 'paymentMethods'
  | 'fuelAlertTolerancePercent'
  | 'fuelAlertCriticalPercent'
  | 'defaultMaintenanceCycleHours'
  | 'maintenanceScheduleBufferHours'
  | 'overdueGracePeriodDays'
  | 'expenseCategories';

export interface SettingKeyDefinition {
  category: SettingCategory;
  /** The backing field on the singleton `SystemSetting` document. */
  field: keyof SystemSettingAttrs;
}

/** Section 6/10: the PRD's named settings, mapped onto the singleton document's fixed fields
 * (see systemSetting.model.ts's header comment for why the storage shape differs from the
 * PRD's literal generic key/value table). This map is the single place a logical setting name
 * resolves to its category (permission gate) and its document field (read/write target). */
export const SETTING_KEYS: Record<SettingKey, SettingKeyDefinition> = {
  vatRate: { category: 'Financial', field: 'vatRatePercent' },
  currency: { category: 'Financial', field: 'currency' },
  paymentMethods: { category: 'Financial', field: 'paymentMethods' },
  fuelAlertTolerancePercent: { category: 'Operational', field: 'fuelTolerancePercent' },
  fuelAlertCriticalPercent: { category: 'Operational', field: 'fuelCriticalTolerancePercent' },
  defaultMaintenanceCycleHours: { category: 'Operational', field: 'defaultMaintenanceCycleHours' },
  maintenanceScheduleBufferHours: {
    category: 'Operational',
    field: 'maintenanceUpcomingBufferHours',
  },
  overdueGracePeriodDays: { category: 'Operational', field: 'overdueGracePeriodDays' },
  expenseCategories: { category: 'ReferenceList', field: 'expenseCategories' },
};

export function isKnownSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTING_KEYS, key);
}
