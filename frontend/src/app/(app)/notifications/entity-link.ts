import type { NotificationRow, NotificationType } from './types';

/**
 * There is no per-alert detail page (Fuel/Maintenance alerts are listed inline on
 * their owning module's page, not addressable by id), so "navigate to the source
 * entity" (Section 15) resolves to the owning module's list page.
 */
const MODULE_HREF: Record<NotificationType, string> = {
  FuelAlert: '/fuel',
  MaintenanceAlert: '/maintenance',
  ContractExpiry: '/contracts',
  OverdueCustomer: '/customers',
  GeneratorStoppedWhileAssigned: '/generators',
};

export function notificationEntityHref(notification: NotificationRow): string {
  return MODULE_HREF[notification.type] ?? '/notifications';
}
