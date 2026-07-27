// Turbopay rate limiting — sliding-window in-memory limiter.
//
// In development we use an in-memory Map<key, {count, windowStart}>. In
// production you would swap this for Redis (the function signature stays the
// same). Each call resets the window if it has elapsed, then increments the
// counter. Expired entries are swept every 60s by a single background timer.

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: Date;
}

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

const CLEANUP_INTERVAL_MS = 60_000;
const CLEANUP_MAX_AGE_MS = 5 * 60_000; // drop buckets unused for 5 min

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupTimer) return;
  if (typeof setInterval === "undefined") return; // edge guard
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) {
      if (now - b.windowStart > CLEANUP_MAX_AGE_MS) {
        buckets.delete(k);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    // Don't keep Node.js alive just for the cleanup timer.
    (cleanupTimer as { unref?: () => void }).unref?.();
  }
}

ensureCleanup();

export function rateLimit(opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const resetAt = new Date(now + opts.windowMs);
  let bucket = buckets.get(opts.key);

  if (!bucket || bucket.windowStart + opts.windowMs < now) {
    // Window elapsed (or first request) — reset.
    bucket = { count: 0, windowStart: now };
    buckets.set(opts.key, bucket);
  }

  if (bucket.count >= opts.limit) {
    return {
      success: false,
      remaining: 0,
      resetAt: new Date(bucket.windowStart + opts.windowMs),
    };
  }

  bucket.count += 1;
  const remaining = Math.max(0, opts.limit - bucket.count);
  return { success: true, remaining, resetAt };
}

// Convenience for tests / admin — clears all buckets.
export function resetRateLimits() {
  buckets.clear();
}

export function getRateLimitStats() {
  return {
    activeBuckets: buckets.size,
    cleanupIntervalMs: CLEANUP_INTERVAL_MS,
  };
}

/**
 * Per-endpoint rate limit configuration.
 * Limits are intentionally conservative for a fintech app:
 *   - login/register: brute-force protection
 *   - transfer/airtime/bills: transaction velocity cap
 *   - pin: PIN-guess protection
 *   - otp: OTP-request flooding protection
 */
export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 60_000 }, // 10 / min per IP+identifier
  register: { limit: 5, windowMs: 3_600_000 }, // 5 / hour per IP
  transfer: { limit: 20, windowMs: 60_000 }, // 20 / min per user
  airtime: { limit: 20, windowMs: 60_000 }, // 20 / min per user
  bills: { limit: 20, windowMs: 60_000 }, // 20 / min per user
  pin: { limit: 10, windowMs: 60_000 }, // 10 / min per user
  otp: { limit: 5, windowMs: 300_000 }, // 5 / 5 min per IP+identifier
} as const;

export type RateLimitEndpoint = keyof typeof RATE_LIMITS;
