export type OperationLogStatus = 'Active' | 'Superseded';

export interface OperationLogRef {
  id: string;
  code: string;
}

export interface OperationLogProjectRef {
  id: string;
  code: string;
  name: string;
}

export interface OperationLogRow {
  id: string;
  date: string;
  project: OperationLogProjectRef;
  generator: OperationLogRef;
  startMeter: number;
  endMeter: number;
  operatingHours: number;
  downtimeHours: number;
  notes: string;
  status: OperationLogStatus;
  correctionOf: string | null;
  correctionReason: string;
  createdAt: string;
}
