/**
 * Minimal seed ahead of TASK-026 (Notification Engine) — the generic delivery mechanism
 * (bell icon, in-app read/unread list, per-user visibility) is that task's own deliverable.
 * Domain engines that generate an alert (e.g. TASK-017's Fuel Alert Engine) hand dispatch off
 * to this; until TASK-026 exists, it's a no-op — the domain alert record itself (FuelAlert)
 * is still fully created/persisted regardless.
 */
export interface NotifyInput {
  recipientRoles: string[];
  message: string;
  severity?: 'info' | 'warning' | 'critical';
  entityType?: string;
  entityId?: string;
}

export const NotificationEngineService = {
  async notify(_input: NotifyInput): Promise<void> {
    // TASK-026 replaces this with real in-app notification creation + delivery.
  },
};
