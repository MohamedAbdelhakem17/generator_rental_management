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
