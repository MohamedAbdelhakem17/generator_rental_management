import mongoose from 'mongoose';

import { env } from './env.js';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Attempts to connect with exponential backoff, up to MAX_RETRIES. Never throws — on
 * exhaustion it logs and returns, leaving the app running so /api/health can report the
 * outage instead of crash-looping the whole process over a transient DB unavailability.
 */
export async function connectDatabase(): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      await mongoose.connect(env.MONGODB_URI);
      console.log('[database] connected');
      return;
    } catch (error) {
      console.error(
        `[database] connection attempt ${attempt}/${MAX_RETRIES} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      if (attempt < MAX_RETRIES) {
        await delay(BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }

  console.error('[database] exhausted connection retries; continuing to serve requests');
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}
