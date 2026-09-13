import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';

async function main(): Promise<void> {
  await connectDatabase();

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    console.log(`[backend] listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  function shutdown(signal: NodeJS.Signals): void {
    console.log(`[backend] received ${signal}, shutting down gracefully`);
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
