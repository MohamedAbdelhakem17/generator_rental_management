import { NotificationEngineService } from '../notification-engine/service.js';
import { NotificationModel } from '../notification-engine/notification.model.js';
import { RentalContractModel } from './contract.model.js';

/** PRD default: alert when an Active contract is within this many days of its endDate. */
export const CONTRACT_EXPIRY_WINDOW_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ContractExpiryAlertResult {
  alerted: number;
}

/** Truncates to a UTC day boundary so the window is timezone-safe regardless of server TZ. */
function utcDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * TASK-026: forward-looking "contract approaching expiry" alert, distinct from
 * `expire-contracts.job.ts` (which reacts to an already-past endDate). Only Active
 * contracts are considered — Draft/Expired/Cancelled never alert.
 */
export async function runContractExpiryAlertJob(now: Date = new Date()): Promise<ContractExpiryAlertResult> {
  const windowStart = utcDayStart(now);
  // +1 day so the entire Nth day is included (a contract expiring any time on day N still counts
  // as "within N days"), not just the instant at exactly N*24h from midnight.
  const windowEnd = new Date(windowStart.getTime() + (CONTRACT_EXPIRY_WINDOW_DAYS + 1) * MS_PER_DAY);

  const candidates = await RentalContractModel.find({
    status: 'Active',
    endDate: { $gte: windowStart, $lt: windowEnd },
  });

  let alerted = 0;

  for (const contract of candidates) {
    if (!(contract.endDate instanceof Date) || Number.isNaN(contract.endDate.getTime())) {
      continue;
    }

    const existing = await NotificationModel.findOne({
      type: 'ContractExpiry',
      entityType: 'RentalContract',
      entityId: String(contract._id),
      status: { $in: ['Unread', 'Read'] },
    });
    if (existing) continue;

    await NotificationEngineService.notify({
      type: 'ContractExpiry',
      title: 'Contract approaching expiry',
      recipientRoles: ['Operations Manager', 'System Admin'],
      message: `Contract ${contract.number} expires on ${contract.endDate.toISOString().slice(0, 10)}`,
      severity: 'warning',
      entityType: 'RentalContract',
      entityId: String(contract._id),
    });
    alerted += 1;
  }

  return { alerted };
}
