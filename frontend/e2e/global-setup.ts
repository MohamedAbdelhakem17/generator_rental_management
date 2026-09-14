import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Seeds the 6 roles plus 3 login-capable test users (Admin/Technician/Viewer) that
 * `login.spec.ts` and `shell.spec.ts` sign in as — see `backend/src/scripts/seedE2eFixtures.ts`
 * for why this is a small TASK-006-scoped fixture, not the full TASK-007 seed command.
 * Requires the MongoDB the backend's own `.env` points at to be reachable.
 */
export default function globalSetup(): void {
  const backendDir = path.resolve(__dirname, '../../backend');
  execFileSync('pnpm', ['exec', 'tsx', 'src/scripts/seedE2eFixtures.ts'], {
    cwd: backendDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}
