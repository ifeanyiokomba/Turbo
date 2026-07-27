// TurboCore Bounded Service — Webhook Service
//
// Thin facade over the webhook signature verifier + payload extractor +
// outbox publisher. Receives raw provider webhook bodies, verifies their
// signatures, persists them as WebhookEvent rows, and dispatches resulting
// domain events to subscribers via the outbox.
//
// Idempotent on eventId — re-delivering the same webhook is safe.

import { db } from "@/lib/db";
import { verifyWebhookHeaders, type VerifyResult } from "@/lib/turbocore/webhooks/verify-signature";
import { extractPayload } from "@/lib/turbocore/webhooks/extract";
import { getProviderWebhookSecret } from "@/lib/turbocore/webhooks/credentials";
import { publishPendingEvents, type PublishStats } from "@/lib/turbocore/outbox/publisher";

export interface ReceiveResult {
  event: {
    id: string;
    eventId: string;
    providerCode: string;
    eventType: string;
    signatureValid: boolean;
    transactionId: string | null;
    processedAt: Date | null;
  };
  verify: VerifyResult;
  duplicate: boolean;
}

export interface DispatchInput {
  aggregateType: string; // TRANSACTION | USER | WALLET
  aggregateId: string;
  type: string; // PAYMENT_SETTLED | PAYMENT_REVERSED | ...
  payload: Record<string, unknown>;
  headers?: Record<string, unknown>;
}

export const webhookService = {
  /**
   * Receive an inbound webhook: verify the signature, extract the normalized
   * { eventId, eventType, providerRef, status } from the provider's body
   * shape, persist a WebhookEvent row (idempotent on eventId), and link it
   * to the underlying Transaction if the providerRef matches one.
   */
  async receive(provider: string, rawBody: string, headers: Headers): Promise<ReceiveResult> {
    // 1. Verify signature — provider-specific scheme (HMAC-SHA512/SHA256/plain-equal).
    const secret = await getProviderWebhookSecret(provider);
    const verify = verifyWebhookHeaders(provider, rawBody, headers, secret);

    // 2. Extract normalized fields from the provider-specific body.
    const extracted = extractPayload(provider, rawBody);

    // 3. Idempotent insert — eventId is unique. If we've already seen this
    //    event, return the existing row + duplicate=true.
    let duplicate = false;
    const existing = await db.webhookEvent
      .findUnique({ where: { eventId: extracted.eventId } })
      .catch(() => null);
    if (existing) {
      duplicate = true;
      return {
        event: {
          id: existing.id,
          eventId: existing.eventId,
          providerCode: existing.providerCode,
          eventType: existing.eventType,
          signatureValid: existing.signatureValid,
          transactionId: existing.transactionId,
          processedAt: existing.processedAt,
        },
        verify,
        duplicate,
      };
    }

    // 4. Try to link to a transaction by the extracted providerRef.
    let transactionId: string | null = null;
    if (extracted.providerRef) {
      const tx = await db.transaction
        .findFirst({ where: { providerRef: extracted.providerRef }, select: { id: true } })
        .catch(() => null);
      if (tx) transactionId = tx.id;
    }

    // 5. Persist the WebhookEvent row. We persist even when the signature
    //    is invalid so operators can investigate — but processedAt stays
    //    null until an admin reviews it.
    const processedAt = verify.valid ? new Date() : null;
    const event = await db.webhookEvent.create({
      data: {
        providerCode: provider,
        eventId: extracted.eventId,
        eventType: extracted.eventType,
        payloadJSON: rawBody,
        signatureValid: verify.valid,
        processedAt,
        transactionId,
      },
    });

    return {
      event: {
        id: event.id,
        eventId: event.eventId,
        providerCode: event.providerCode,
        eventType: event.eventType,
        signatureValid: event.signatureValid,
        transactionId: event.transactionId,
        processedAt: event.processedAt,
      },
      verify,
      duplicate,
    };
  },

  /** Verify a webhook signature against the provider's secret (no DB write). */
  async verifySignature(
    provider: string,
    payload: string,
    signature: string,
    secret: string
  ): Promise<VerifyResult> {
    // Delegate to the low-level helper — supports the same provider schemes.
    const { verifyWebhookSignature } = await import("@/lib/turbocore/webhooks/verify-signature");
    return verifyWebhookSignature(provider, payload, signature, secret);
  },

  /**
   * Dispatch a domain event to subscribers. Persists an OutboxEvent row
   * (status=PENDING) and immediately triggers the publisher so it gets
   * flushed on this request. Returns the publisher's aggregate stats.
   */
  async dispatch(event: DispatchInput): Promise<PublishStats> {
    await db.outboxEvent.create({
      data: {
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        type: event.type,
        payloadJSON: JSON.stringify(event.payload),
        headersJSON: JSON.stringify(event.headers ?? {}),
        status: "PENDING",
        nextRetryAt: new Date(),
      },
    });
    return publishPendingEvents();
  },

  /** List recent webhook events, optionally filtered by provider. Newest first. */
  async listEvents(provider?: string, limit = 50) {
    return db.webhookEvent.findMany({
      where: provider ? { providerCode: provider } : undefined,
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
  },
};
