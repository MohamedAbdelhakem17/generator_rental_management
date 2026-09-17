import { CustomerModel } from '../customers/customer.model.js';
import { NotificationModel } from '../notification-engine/notification.model.js';
import { NotificationEngineService } from '../notification-engine/service.js';
import { SettingsService } from '../settings/settings.service.js';
import { CustomerLedgerService } from './service.js';

export interface OverdueCustomerAlertResult {
  evaluated: number;
  alerted: number;
}

const OPEN_NOTIFICATION_STATUSES = ['Unread', 'Read'] as const;

/**
 * TASK-026: real overdue-customer detection (not "any positive balance" — see
 * CustomerLedgerService.getOverdueSummaryForCustomers). One notification per overdue
 * customer, deduped against any existing non-Dismissed OverdueCustomer notification for
 * that customer so re-running this job never creates duplicates.
 */
export async function runOverdueCustomerAlertJob(asOf: Date = new Date()): Promise<OverdueCustomerAlertResult> {
  const graceDays = await SettingsService.getOverdueGracePeriodDays();

  const activeCustomers = await CustomerModel.find({ active: true, isDeleted: { $ne: true } }).select(
    '_id companyName',
  );
  if (activeCustomers.length === 0) {
    return { evaluated: 0, alerted: 0 };
  }

  const customerIds = activeCustomers.map((customer) => String(customer._id));
  const overdueByCustomer = await CustomerLedgerService.getOverdueSummaryForCustomers(customerIds, graceDays, asOf);

  let alerted = 0;
  for (const customer of activeCustomers) {
    const customerId = String(customer._id);
    const overdue = overdueByCustomer.get(customerId);
    if (!overdue) continue;

    const existing = await NotificationModel.findOne({
      type: 'OverdueCustomer',
      entityType: 'Customer',
      entityId: customerId,
      status: { $in: OPEN_NOTIFICATION_STATUSES },
    });
    if (existing) continue;

    await NotificationEngineService.notify({
      type: 'OverdueCustomer',
      title: 'Customer overdue',
      recipientRoles: ['Finance Manager', 'Accountant', 'System Admin'],
      message: `${customer.companyName} has ${overdue.overdueExtractCount} overdue extract(s) totaling ${overdue.overdueBalance}, ${overdue.overdueDays} day(s) past due`,
      severity: overdue.overdueDays > 30 ? 'critical' : 'warning',
      entityType: 'Customer',
      entityId: customerId,
    });
    alerted += 1;
  }

  return { evaluated: activeCustomers.length, alerted };
}
