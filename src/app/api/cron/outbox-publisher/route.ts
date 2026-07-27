// Turbopay cron — outbox publisher.
//
// Drains PENDING OutboxEvent rows: dispatches each to subscribed
// WebhookEndpoints (HMAC-signed POST), fires in-app side effects
// (PAYMENT_SETTLED → InAppNotification), and applies the retry policy.
//
// Protection: x-cron-secret header + CronLock("outbox-publisher") so two
// scheduler ticks (or two replicas) cannot double-publish.

import { json, handleError } from "@/lib/api";
import { guardCron } from "@/lib/turbocore/cron-guard";
import { withCronLock } from "@/lib/turbocore/cron-lock";
import { publishPendingEvents } from "@/lib/turbocore/outbox/publisher";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const guard = guardCron(req);
    if (guard) return guard;

    const result = await withCronLock("outbox-publisher", async () => {
      const startedAt = new Date().toISOString();
      console.log(`[cron:outbox-publisher] start at ${startedAt}`);
      const stats = await publishPendingEvents();
      const finishedAt = new Date().toISOString();
      console.log(
        `[cron:outbox-publisher] done at ${finishedAt} — processed=${stats.processed} published=${stats.published} failed=${stats.failed} inApp=${stats.inAppDispatched} errors=${stats.errors}`
      );
      return { ...stats, startedAt, finishedAt };
    });

    return json(result ?? { processed: 0, published: 0, failed: 0, skipped: true });
  } catch (e) {
    return handleError(e);
  }
}
