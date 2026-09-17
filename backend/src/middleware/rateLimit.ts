import type { NextFunction, Request, Response } from 'express';

import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

/** Section 19: 429 with `Retry-After`, not a generic error — carries the seconds until the
 * window resets so the frontend can show a countdown rather than a raw error code. */
export class RateLimitError extends AppError {
  public readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message, 429);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** Requests allowed per window before the next one is rejected. */
  max: number;
  windowMs: number;
  /** Builds the bucket key from the request — e.g. IP+email for login (Section 20: keying on
   * IP alone would false-positive a whole shared-office IP; IP+email scopes it per account). */
  keyFor: (req: Request) => string;
  message?: string;
  /** Defaults to `true`: skipped when `NODE_ENV=test` since the suite legitimately logs in as
   * the same test account dozens of times per file. Tests for this middleware's own logic pass
   * `false` to exercise the real behavior regardless of environment. */
  bypassInTest?: boolean;
}

/**
 * TASK-034 FR-001: an in-memory token-bucket-style fixed-window limiter — explicitly not
 * Redis-backed, per the Constitution's no-new-caching-infra rule. A single process-wide `Map`
 * is fine at this system's scale (one Node process, no horizontal scaling in V1).
 */
export function rateLimit(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();
  const MAX_TRACKED_KEYS = 10_000;

  function sweepExpired(now: number): void {
    if (buckets.size < MAX_TRACKED_KEYS) return;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    if ((options.bypassInTest ?? true) && env.NODE_ENV === 'test') {
      next();
      return;
    }

    const now = Date.now();
    sweepExpired(now);

    const key = options.keyFor(req);
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    const remaining = Math.max(options.max - bucket.count, 0);
    res.setHeader('X-RateLimit-Limit', String(options.max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (bucket.count > options.max) {
      const retryAfterSeconds = Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      next(
        new RateLimitError(
          options.message ?? 'Too many attempts. Please try again later.',
          retryAfterSeconds,
        ),
      );
      return;
    }

    next();
  };
}

/** Section 20: keyed on IP+email (not IP alone) so a shared corporate IP doesn't lock out
 * every user behind it after one account's failed attempts. `overrides` exists only so this
 * exact wiring can be exercised end-to-end in a test regardless of environment/timing. */
export function loginRateLimiter(overrides: Partial<RateLimitOptions> = {}) {
  return rateLimit({
    max: 10,
    windowMs: 15 * 60 * 1000,
    keyFor: (req) => {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      return `${req.ip ?? 'unknown'}:${email}`;
    },
    message: 'Too many login attempts. Please try again later.',
    ...overrides,
  });
}
