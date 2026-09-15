import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { runContractExpiryJob } from './modules/contracts/expire-contracts.job.js';
import { runMaintenanceScheduleSweep } from './modules/maintenance-schedule-engine/job.js';
import { runStatusReconciliation } from './modules/status-engine/status-engine.job.js';

const RECONCILIATION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CONTRACT_EXPIRY_INTERVAL_MS = 60 * 60 * 1000;
const MAINTENANCE_SCHEDULE_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

async function main(): Promise<void> {
  await connectDatabase();

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    console.log(`[backend] listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  /**
   * FR-004 "nightly" reconciliation, run in-process rather than via a new scheduler
   * dependency (Constitution: no new infra). Errors are logged, never fatal to the server.
   */
  const reconciliationTimer = setInterval(() => {
    runStatusReconciliation().catch((error: unknown) => {
      console.error('[status-engine] reconciliation run failed', error);
    });
  }, RECONCILIATION_INTERVAL_MS);
  reconciliationTimer.unref();

  /** FR-006: hourly since expiry is date-based and same-day accuracy matters for status. */
  const contractExpiryTimer = setInterval(() => {
    runContractExpiryJob().catch((error: unknown) => {
      console.error('[contracts] expiry job run failed', error);
    });
  }, CONTRACT_EXPIRY_INTERVAL_MS);
  contractExpiryTimer.unref();

  /** TASK-019 FR-002: hourly fallback sweep — the on-write trigger handles the common case. */
  const maintenanceScheduleTimer = setInterval(() => {
    runMaintenanceScheduleSweep().catch((error: unknown) => {
      console.error('[maintenance-schedule-engine] sweep run failed', error);
    });
  }, MAINTENANCE_SCHEDULE_SWEEP_INTERVAL_MS);
  maintenanceScheduleTimer.unref();

  function shutdown(signal: NodeJS.Signals): void {
    console.log(`[backend] received ${signal}, shutting down gracefully`);
    clearInterval(reconciliationTimer);
    clearInterval(contractExpiryTimer);
    clearInterval(maintenanceScheduleTimer);
    server.close(() => {
      void disconnectDatabase().finally(() => process.exit(0));
    });
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error('[backend] failed to start:', error);
  process.exit(1);
});
