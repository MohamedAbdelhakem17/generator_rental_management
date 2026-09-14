/**
 * TASK-007 — demo seed: representative demo data for manual QA/screenshots, kept
 * strictly separate from the baseline seed so production can never accidentally load
 * demo data (FR-002). Each later module registers its own demo-data step here as it's
 * built (e.g. TASK-008 generators, TASK-010 customers) — this file only owns the guard
 * and run order, never a module's own demo-data shape.
 *
 * Run via: `pnpm --filter backend seed:demo` (which passes `--demo` for you — running
 * this file any other way without that flag is refused as a safety net).
 */
import { pathToFileURL } from 'node:url';

import { env } from '../../config/env.js';
import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import { seedBaseline } from './baseline.js';

type DemoSeedStep = () => Promise<void>;

/** Populated by later tasks (TASK-008 generators, TASK-010 customers, TASK-011 projects, TASK-012 contracts). */
const DEMO_SEED_STEPS: DemoSeedStep[] = [];

/** `nodeEnv` is injectable so tests can exercise the production guard without reloading the module graph. */
export async function seedDemo(nodeEnv: string = env.NODE_ENV): Promise<void> {
  if (nodeEnv === 'production') {
    throw new Error('Refusing to run demo seed with NODE_ENV=production');
  }

  // Demo data assumes the baseline (roles/admin/settings) already exists.
  await seedBaseline();

  for (const step of DEMO_SEED_STEPS) {
    await step();
  }
}

async function main() {
  if (!process.argv.includes('--demo')) {
    console.error('[seed:demo] refusing to run without an explicit --demo flag');
    process.exit(1);
  }

  await connectDatabase();
  await seedDemo();
  await disconnectDatabase();
  console.log('[seed:demo] complete');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[seed:demo] failed', error);
    process.exit(1);
  });
}
