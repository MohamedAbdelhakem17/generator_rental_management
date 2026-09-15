export type MaintenanceType = 'Preventive' | 'Corrective';
export type MaintenanceStatus = 'Open' | 'In Progress' | 'Completed' | 'Cancelled';

export interface MaintenanceRow {
  id: string;
  generator: { id: string; code: string };
  type: MaintenanceType;
  status: MaintenanceStatus;
  date: string;
  meter: number;
  partsCost: string;
  oilCost: string;
  laborCost: string;
  transportCost: string;
  totalCost: string;
  maintenanceCycleOverride: number | null;
  nextMaintenanceMeter: number | null;
  notes: string;
  cancelReason: string;
  createdAt: string;
}

export type MaintenanceAlertLevel = 'Upcoming' | 'Overdue';
export type MaintenanceAlertStatus = 'Open' | 'Acknowledged' | 'Resolved';

export interface MaintenanceAlertRow {
  id: string;
  generator: { id: string; code: string };
  level: MaintenanceAlertLevel;
  status: MaintenanceAlertStatus;
  dueAtMeter: number;
  currentMeterAtCreation: number;
  resolvedAt: string | null;
  resolvedBy: 'system' | 'user' | null;
  createdAt: string;
}
