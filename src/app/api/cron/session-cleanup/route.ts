// Turbopay cron — session cleanup.
//
// Deletes expired or revoked sessions. Sessions whose `expiresAt` is in the
// past OR whose `revokedAt` is non-null are dead weight in the table and
// can be safely removed (their `tokenHash` is no longer valid for auth).
//
// Protection: x-cron-secret + CronLock("session-cleanup").

import { db } from "@/lib/db";
import { json, handleError } from "@/lib/api";
import { guardCron } from "@/lib/turbocore/cron-guard";
import { withCronLock } from "@/lib/turbocore/cron-lock";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const guard = guardCron(req);
    if (guard) return guard;

    const result = await withCronLock("session-cleanup", async () => {
      const startedAt = new Date().toISOString();
      console.log(`[cron:session-cleanup] start at ${startedAt}`);

      const now = new Date();
      // Delete sessions that have either expired or been explicitly revoked.
      const deleted = await db.session.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { revokedAt: { not: null } },
          ],
        },
      });

      const count = deleted.count;
      const finishedAt = new Date().toISOString();
      console.log(`[cron:session-cleanup] done at ${finishedAt} — deleted=${count}`);
      return { deleted: count, startedAt, finishedAt };
    });

    return json(result ?? { deleted: 0, skipped: true });
  } catch (e) {
    return handleError(e);
  }
}
