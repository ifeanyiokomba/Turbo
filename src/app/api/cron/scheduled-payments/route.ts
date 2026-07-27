// Turbopay cron — scheduled payment runner.
//
// Finds ScheduledPayment rows that are ACTIVE and due (nextRunAt <= now),
// executes each via the scheduled-payment helper (which mirrors the
// /api/transfer /api/airtime /api/data /api/bills routes minus the PIN
// check — the user pre-authorized the schedule at creation time), then
// bumps runCount, lastRunAt, and recomputes nextRunAt.
//
// On failure: failCount++. After 3 consecutive failures → status=FAILED.
//
// Protection: x-cron-secret + CronLock("scheduled-payments"). Each schedule
// is wrapped in try/catch so one bad run doesn't block the rest.

import { db } from "@/lib/db";
import { json, handleError, audit } from "@/lib/api";
import { guardCron } from "@/lib/turbocore/cron-guard";
import { withCronLock } from "@/lib/turbocore/cron-lock";
import { executeScheduledPayment, computeNextRunAt } from "@/lib/turbocore/scheduled";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 50;
const MAX_FAILS = 3;

export async function POST(req: Request) {
  try {
    const guard = guardCron(req);
    if (guard) return guard;

    const result = await withCronLock("scheduled-payments", async () => {
      const startedAt = new Date().toISOString();
      console.log(`[cron:scheduled-payments] start at ${startedAt}`);

      const now = new Date();
      const due = await db.scheduledPayment.findMany({
        where: { status: "ACTIVE", nextRunAt: { lte: now } },
        orderBy: { nextRunAt: "asc" },
        take: BATCH_SIZE,
      });

      let executed = 0;
      let succeeded = 0;
      let failed = 0;
      let completed = 0; // schedules that hit DONE (ONCE frequency)
      const errors: string[] = [];

      for (const sp of due) {
        executed += 1;
        try {
          const res = await executeScheduledPayment(sp.id, sp.userId, sp.type, sp.payloadJSON);

          if (res.ok) {
            succeeded += 1;
            const next = computeNextRunAt(sp.frequency, now);
            await db.scheduledPayment.update({
              where: { id: sp.id },
              data: {
                runCount: { increment: 1 },
                failCount: 0,
                lastRunAt: now,
                nextRunAt: next ?? now, // null → mark DONE below
                status: next ? "ACTIVE" : "DONE",
              },
            });
            if (!next) completed += 1;
            await audit({
              userId: sp.userId,
              action: "SCHEDULED_PAYMENT_EXECUTED",
              category: "WALLET",
              metadata: { scheduledId: sp.id, type: sp.type, reference: res.reference },
            });
          } else {
            failed += 1;
            const newFailCount = sp.failCount + 1;
            const next = computeNextRunAt(sp.frequency, now);
            await db.scheduledPayment.update({
              where: { id: sp.id },
              data: {
                failCount: { increment: 1 },
                lastRunAt: now,
                nextRunAt: next ?? new Date(now.getTime() + 60 * 60_000), // retry in 1h if no next
                status: newFailCount >= MAX_FAILS ? "FAILED" : "ACTIVE",
              },
            });
            errors.push(`${sp.id}: ${res.error ?? "unknown"}`);
            await audit({
              userId: sp.userId,
              action: "SCHEDULED_PAYMENT_FAILED",
              category: "WALLET",
              severity: "WARN",
              metadata: {
                scheduledId: sp.id,
                type: sp.type,
                error: res.error,
                failCount: newFailCount,
              },
            });
          }
        } catch (e) {
          failed += 1;
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`${sp.id}: ${msg}`);
          console.error(`[cron:scheduled-payments] sp ${sp.id} failed:`, e);
          // Best-effort bump of failCount so we eventually give up.
          try {
            const newFailCount = sp.failCount + 1;
            await db.scheduledPayment.update({
              where: { id: sp.id },
              data: {
                failCount: { increment: 1 },
                status: newFailCount >= MAX_FAILS ? "FAILED" : "ACTIVE",
              },
            });
          } catch {}
        }
      }

      const finishedAt = new Date().toISOString();
      console.log(
        `[cron:scheduled-payments] done at ${finishedAt} — executed=${executed} succeeded=${succeeded} failed=${failed} completed=${completed} errors=${errors.length}`
      );
      return {
        executed,
        succeeded,
        failed,
        completed,
        errors: errors.length,
        startedAt,
        finishedAt,
      };
    });

    return json(result ?? { executed: 0, succeeded: 0, failed: 0, skipped: true });
  } catch (e) {
    return handleError(e);
  }
}
