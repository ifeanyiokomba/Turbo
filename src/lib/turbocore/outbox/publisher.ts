// TurboCore — outbox publisher.
//
// Reads PENDING OutboxEvent rows whose nextRetryAt has elapsed and dispatches
// each to every subscribed WebhookEndpoint via signed HTTP POST. Also fires
// in-app side effects (e.g. PAYMENT_SETTLED → InAppNotification).
//
// Retry policy (6 attempts total): 10s, 1m, 5m, 30m, 2h, 6h.
// On 2xx from an endpoint → status=PUBLISHED. On exhausted attempts → FAILED.
//
// Each event is wrapped in try/catch so a single bad event never blocks the
// rest of the batch. Returns aggregate stats for the cron route caller.

import { db } from "@/lib/db";
import { signPayload, TURBOPAY_SIGNATURE_HEADER } from "../webhooks/sign";
import { validateOutboundUrl } from "@/lib/security/ssrf";

const BATCH_SIZE = 50;

// Retry backoff ladder in milliseconds. Index 0 is the delay applied after
// the first failure, index 5 after the sixth (and final) attempt.
const RETRY_DELAYS_MS = [
  10_000, // 10s
  60_000, // 1m
  5 * 60_000, // 5m
  30 * 60_000, // 30m
  2 * 60 * 60_000, // 2h
  6 * 60 * 60_000, // 6h
];

const MAX_ATTEMPTS = RETRY_DELAYS_MS.length; // 6

export interface PublishStats {
  processed: number;
  published: number;
  failed: number;
  inAppDispatched: number;
  errors: number;
}

export async function publishPendingEvents(): Promise<PublishStats> {
  const stats: PublishStats = {
    processed: 0,
    published: 0,
    failed: 0,
    inAppDispatched: 0,
    errors: 0,
  };

  const now = new Date();
  const events = await db.outboxEvent.findMany({
    where: { status: "PENDING", nextRetryAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  stats.processed = events.length;
  if (events.length === 0) return stats;

  for (const event of events) {
    try {
      await publishOne(event, stats);
    } catch (e) {
      stats.errors += 1;
      console.error(`[outbox] event ${event.id} (${event.type}) failed:`, e);
      // Mark as failed so we don't loop forever on a poisoned event.
      await markAttempted(event, false, "internal-error").catch(() => {});
    }
  }

  return stats;
}

async function publishOne(event: any, stats: PublishStats): Promise<void> {
  // --- In-app side effects (always fire, independent of webhook endpoints) ---
  try {
    if (event.type === "PAYMENT_SETTLED" && event.aggregateType === "TRANSACTION") {
      const tx = await db.transaction.findUnique({
        where: { id: event.aggregateId },
        select: {
          id: true,
          userId: true,
          reference: true,
          amountKobo: true,
          type: true,
          direction: true,
        },
      });
      if (tx) {
        const incoming = tx.direction === "CREDIT";
        await db.inAppNotification
          .create({
            data: {
              userId: tx.userId,
              type: "TRANSACTION",
              title: incoming ? "Payment received" : "Payment sent",
              body: `Ref ${tx.reference} • ₦${(tx.amountKobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              priority: "NORMAL",
              actionUrl: `/history?ref=${tx.reference}`,
            },
          })
          .catch(() => {});
        stats.inAppDispatched += 1;
      }
    }
  } catch (e) {
    console.error(`[outbox] in-app dispatch for ${event.id} failed:`, e);
  }

  // --- Webhook endpoints ---
  const endpoints = await findSubscribers(event);
  if (endpoints.length === 0) {
    // No subscribers — mark PUBLISHED so we stop retrying. The in-app side
    // effect above still fires; this just clears the outbox row.
    await db.outboxEvent.update({
      where: { id: event.id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    stats.published += 1;
    return;
  }

  const payloadStr = JSON.stringify({
    id: event.id,
    type: event.type,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    payload: JSON.parse(event.payloadJSON || "{}"),
    headers: JSON.parse(event.headersJSON || "{}"),
    timestamp: event.createdAt.toISOString(),
  });

  let allOk = true;
  for (const ep of endpoints) {
    try {
      // SSRF guard — webhook URLs are merchant-controlled and the most
      // critical SSRF vector. Block private IPs + cloud metadata endpoints.
      const safeUrl = validateOutboundUrl(ep.url);
      const signature = signPayload(payloadStr, ep.secretHash);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(safeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [TURBOPAY_SIGNATURE_HEADER]: signature,
        },
        body: payloadStr,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (res.ok) {
        await db.webhookEndpoint
          .update({
            where: { id: ep.id },
            data: { consecutiveFailures: 0, lastFailedAt: null },
          })
          .catch(() => {});
      } else {
        allOk = false;
        await db.webhookEndpoint
          .update({
            where: { id: ep.id },
            data: { consecutiveFailures: { increment: 1 }, lastFailedAt: new Date() },
          })
          .catch(() => {});
        console.warn(`[outbox] endpoint ${ep.id} returned ${res.status} for event ${event.id}`);
      }
    } catch (e) {
      allOk = false;
      await db.webhookEndpoint
        .update({
          where: { id: ep.id },
          data: { consecutiveFailures: { increment: 1 }, lastFailedAt: new Date() },
        })
        .catch(() => {});
      console.warn(`[outbox] endpoint ${ep.id} fetch failed for event ${event.id}:`, e);
    }
  }

  await markAttempted(event, allOk, "dispatched");
  if (allOk) stats.published += 1;
  else stats.failed += 1;
}

/** Find WebhookEndpoints subscribed to this event type. */
async function findSubscribers(event: any) {
  const endpoints = await db.webhookEndpoint.findMany({
    where: { enabled: true },
  });
  return endpoints.filter((ep: any) => {
    let events: string[] = [];
    try {
      events = JSON.parse(ep.eventsJSON || "[]");
    } catch {
      events = [];
    }
    // Wildcard subscription ("*") or explicit event-type match.
    return events.includes("*") || events.includes(event.type);
  });
}

/** Bump attempts and decide PUBLISHED / FAILED / next retry. */
async function markAttempted(event: any, success: boolean, _reason: string): Promise<void> {
  if (success) {
    await db.outboxEvent.update({
      where: { id: event.id },
      data: { status: "PUBLISHED", publishedAt: new Date(), attempts: { increment: 1 } },
    });
    return;
  }

  const nextAttempts = (event.attempts ?? 0) + 1;
  if (nextAttempts >= MAX_ATTEMPTS) {
    await db.outboxEvent.update({
      where: { id: event.id },
      data: { status: "FAILED", attempts: nextAttempts },
    });
    return;
  }

  const delay = RETRY_DELAYS_MS[Math.min(nextAttempts - 1, RETRY_DELAYS_MS.length - 1)];
  await db.outboxEvent.update({
    where: { id: event.id },
    data: { attempts: nextAttempts, nextRetryAt: new Date(Date.now() + delay) },
  });
}
