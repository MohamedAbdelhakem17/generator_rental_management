export interface FuelLogRef {
  id: string;
  code: string;
  normalFuelConsumption: number;
}

export interface FuelLogProjectRef {
  id: string;
  code: string;
  name: string;
}

export interface FuelLogRow {
  id: string;
  date: string;
  project: FuelLogProjectRef;
  generator: FuelLogRef;
  liters: number;
  pricePerLiter: string;
  totalCost: string;
  operatingHoursRef: number | null;
  consumptionRate: number | null;
  createdAt: string;
}

export interface FuelLogDetail extends FuelLogRow {
  contributingOperationLogIds: string[];
}

export type FuelAlertSeverity = 'Warning' | 'Critical';
export type FuelAlertStatus = 'Open' | 'Acknowledged' | 'Resolved';

export interface FuelAlertRow {
  id: string;
  generator: { id: string; code: string };
  severity: FuelAlertSeverity;
  status: FuelAlertStatus;
  firstOccurrenceAt: string;
  lastOccurrenceAt: string;
  occurrenceCount: number;
  triggeringFuelLogId: string;
  resolutionNote: string;
  resolvedAt: string | null;
  resolvedBy: 'system' | 'user' | null;
  createdAt: string;
}
