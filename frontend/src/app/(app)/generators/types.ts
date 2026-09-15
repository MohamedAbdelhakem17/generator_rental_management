import type { GeneratorStatus as BadgeStatus } from '@/components/shared/status-badge';

export type ApiGeneratorStatus = 'Available' | 'Rented' | 'Under Maintenance' | 'Stopped';
export type CommercialStatus = 'Assigned' | 'Unassigned';

export interface GeneratorSpecifications {
  kva: number;
  brand: string;
  model: string;
  serialNumber: string;
}

export interface GeneratorRow {
  id: string;
  code: string;
  specifications: GeneratorSpecifications;
  currentMeter: number;
  location: string;
  normalFuelConsumption: number;
  maintenanceCycleHours: number;
  manualStatus: 'Stopped' | null;
  status: ApiGeneratorStatus;
  commercialStatus: CommercialStatus;
  createdAt: string;
}

const API_TO_BADGE_STATUS: Record<ApiGeneratorStatus, BadgeStatus> = {
  Available: 'available',
  Rented: 'rented',
  'Under Maintenance': 'under_maintenance',
  Stopped: 'stopped',
};

/** The API returns the PRD's PascalCase status enum; StatusBadge (TASK-004) keys off a lowercase union. */
export function toBadgeStatus(status: ApiGeneratorStatus): BadgeStatus {
  return API_TO_BADGE_STATUS[status];
}

/** TASK-009: one entry from the Status Engine's `StatusChangeLog`, most recent first. */
export interface StatusHistoryEntry {
  from: ApiGeneratorStatus;
  to: ApiGeneratorStatus;
  reason: string;
  triggeredBy: 'system' | 'user';
  at: string;
}
