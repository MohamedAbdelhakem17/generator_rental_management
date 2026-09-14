import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const BACKEND_PORT = 4000;

export default defineConfig({
  testDir: './e2e',
  // TASK-006 auth specs share one real backend + bcrypt-hashing login endpoint across every
  // test (unlike the fully static/mocked TASK-004/005 specs) — parallel workers raced each
  // other under load and intermittently lost the redirect-after-login race. One worker keeps
  // the suite deterministic; revisit once there's a way to isolate backend state per worker.
  fullyParallel: false,
  workers: 1,
  reporter: 'html',
  globalSetup: path.resolve(__dirname, 'e2e/global-setup.ts'),
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: `pnpm exec tsx watch src/server.ts`,
      cwd: path.resolve(__dirname, '../backend'),
      url: `http://localhost:${BACKEND_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // Login (TASK-006) needs the API's CORS to allow this suite's frontend origin —
      // backend/.env's CORS_ORIGIN targets the normal dev server on :3000, not :3100.
      env: { CORS_ORIGIN: `http://localhost:${PORT}` },
    },
    {
      command: `pnpm exec next dev -p ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
