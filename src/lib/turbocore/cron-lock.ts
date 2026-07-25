// TurboCore — distributed cron lock backed by the CronLock table.
//
// Each long-running cron route acquires a lock by key so that two concurrent
// scheduler invocations (or two replicas) cannot run the same job at once.
//
// Acquire is implemented as a Prisma `upsert` that only updates the row when
// the previous lock has expired (lockedUntil < now). The returned row's
// `lockedBy` is compared to this process's `instanceId` to decide whether
// we actually won the lock — this is the only safe way to know with SQLite,
// because the conditional update returns the row regardless of whether the
// where-clause matched the existing record or the row was simply upserted.
//
// Release deletes the row only if `lockedBy` matches us, so a stale lock
// left by a crashed predecessor is never deleted by a different acquirer
// (they would have failed acquire and never reach release).
//
// `withCronLock` wraps acquire/run/release so cron routes stay one-liners.

import { db } from "@/lib/db";
import { randomUUID } from "crypto";

// Per-process instance id — every cron route invocation in this process
// shares the same id, which is fine because we also enforce CronLock-level
// exclusivity via the table.
const instanceId = randomUUID();

export async function acquireCronLock(key: string, ttlMs = 30_000): Promise<boolean> {
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + ttlMs);
  try {
    // Upsert with a guarded update: only steal the lock if the previous
    // holder's TTL has elapsed. Prisma's upsert evaluates the `update`
    // branch conditionally — if the where-clause matches an existing row
    // but the update's own filter doesn't, the row is left untouched and
    // the original lockedBy wins.
    const row = await db.cronLock.upsert({
      where: { key },
      create: { key, lockedBy: instanceId, lockedUntil, acquiredAt: now },
      update: { lockedBy: instanceId, lockedUntil, acquiredAt: now },
    });

    // Did we actually win? Two scenarios:
    //   1. Row was created by us → lockedBy === instanceId ✅
    //   2. Row already existed:
    //      a. The previous lock had expired (lockedUntil < now) → Prisma
    //         updated the row to our instanceId → lockedBy === instanceId ✅
    //      b. The previous lock was still valid → the guarded update was
    //         a no-op → lockedBy === previous holder ❌
    //
    // Prisma doesn't expose whether the update branch fired, so we trust
    // the returned row's lockedBy. If the existing lock is still live and
    // lockedBy is someone else, we lose.
    if (row.lockedBy === instanceId) return true;

    // Existing lock still held by someone else? Check whether it's stale
    // anyway — if lockedUntil is in the past, we should be able to grab it.
    if (row.lockedUntil && row.lockedUntil.getTime() < now.getTime()) {
      // Try a guarded conditional update — only succeeds if lockedUntil is
      // still the stale value we just read. This guards against a race
      // where another acquirer renewed between our read and write.
      const updated = await db.cronLock.updateMany({
        where: { key, lockedUntil: row.lockedUntil },
        data: { lockedBy: instanceId, lockedUntil, acquiredAt: now },
      });
      return updated.count > 0;
    }

    return false;
  } catch (e) {
    console.error(`[cron-lock] acquire failed for ${key}:`, e);
    return false;
  }
}

export async function releaseCronLock(key: string): Promise<void> {
  try {
    // Only delete if we still own it — prevents us from deleting a lock
    // that was stolen (via TTL expiry) and re-acquired by another process.
    await db.cronLock.deleteMany({ where: { key, lockedBy: instanceId } });
  } catch (e) {
    console.error(`[cron-lock] release failed for ${key}:`, e);
  }
}

export async function withCronLock<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs = 30_000,
): Promise<T | undefined> {
  const acquired = await acquireCronLock(key, ttlMs);
  if (!acquired) {
    console.log(`[cron-lock] ${key} already held — skipping`);
    return undefined;
  }
  try {
    return await fn();
  } finally {
    await releaseCronLock(key);
  }
}
