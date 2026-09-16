export type NotificationType =
  | 'FuelAlert'
  | 'MaintenanceAlert'
  | 'ContractExpiry'
  | 'OverdueCustomer'
  | 'GeneratorStoppedWhileAssigned';

export type NotificationSeverity = 'info' | 'warning' | 'critical';
export type NotificationStatus = 'Unread' | 'Read' | 'Dismissed';

export interface NotificationRow {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  recipientRoles: string[];
  status: NotificationStatus;
  dueDate: string | null;
  readAt: string | null;
  createdAt: string;
}
