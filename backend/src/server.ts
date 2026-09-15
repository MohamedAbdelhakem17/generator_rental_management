import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { runStatusReconciliation } from './modules/status-engine/status-engine.job.js';

const RECONCILIATION_INTERVAL_MS = 24 * 60 * 60 * 1000;

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

  function shutdown(signal: NodeJS.Signals): void {
    console.log(`[backend] received ${signal}, shutting down gracefully`);
    clearInterval(reconciliationTimer);
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
