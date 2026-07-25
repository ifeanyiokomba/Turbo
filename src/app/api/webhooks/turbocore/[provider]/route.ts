// Turbopay — generic inbound webhook receiver.
//
// URL: POST /api/webhooks/turbocore/[provider]
//
// Accepts webhook deliveries from any TurboCore-integrated provider and:
//   1. Verifies the signature using the provider's scheme (Paystack
//      HMAC-SHA512 / Flutterwave verif-hash / Monnify HMAC-SHA512 /
//      M-Pesa none / default HMAC-SHA256).
//   2. Inserts a WebhookEvent row, idempotent on `eventId` derived from
//      the payload. Duplicate deliveries return 200 immediately without
//      re-processing.
//   3. If the signature is valid, finds the related Transaction by
//      providerRef and applies confirm-or-reverse logic (mirrors
//      orchestrator step 7-8) via the shared recovery module.
//   4. Marks processedAt on the WebhookEvent row.
//
// Always returns 200 — providers retry aggressively on non-2xx and we'd
// rather log a bad payload once than have it hammer the endpoint.

import { db } from "@/lib/db";
import { json, handleError, audit } from "@/lib/api";
import { getProviderWebhookSecret } from "@/lib/turbocore/webhooks/credentials";
import { verifyProviderSignature } from "@/lib/turbocore/webhooks/verify";
import { extractPayload } from "@/lib/turbocore/webhooks/extract";
import { confirmOrReverseTransaction } from "@/lib/turbocore/recovery";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const provider = (await ctx.params).provider?.toLowerCase() ?? "";
  const startedAt = new Date().toISOString();

  try {
    // Read raw body — needed for signature verification (must be byte-exact).
    const rawBody = await req.text();

    // Verify signature.
    const secret = await getProviderWebhookSecret(provider);
    const verifyResult = verifyProviderSignature(provider, rawBody, req.headers, secret);

    // Extract normalized fields from the payload.
    const extracted = extractPayload(provider, rawBody);

    // Idempotent insert — duplicate eventId → return 200 immediately.
    try {
      await db.webhookEvent.create({
        data: {
          providerCode: provider,
          eventId: extracted.eventId,
          eventType: extracted.eventType,
          payloadJSON: rawBody.slice(0, 65_535), // cap stored size; huge payloads get truncated
          signatureValid: verifyResult.valid,
        },
      });
    } catch (e: any) {
      // Prisma throws P2002 on unique constraint violation — that's our
      // duplicate-event signal, not a real error.
      if (e?.code === "P2002") {
        console.log(
          `[webhook:${provider}] duplicate eventId=${extracted.eventId} — returning 200`,
        );
        return json({ ok: true, duplicate: true, eventId: extracted.eventId }, 200);
      }
      throw e;
    }

    // If signature is invalid, record the delivery but don't process.
    if (!verifyResult.valid) {
      console.warn(
        `[webhook:${provider}] signature invalid — scheme=${verifyResult.scheme} reason=${verifyResult.reason ?? "mismatch"}`,
      );
      await audit({
        action: "WEBHOOK_SIGNATURE_INVALID",
        category: "SECURITY",
        severity: "WARN",
        metadata: { provider, eventId: extracted.eventId, scheme: verifyResult.scheme, reason: verifyResult.reason },
      }).catch(() => {});
      // Still 200 so the provider doesn't retry — we logged the bad delivery.
      return json({ ok: false, reason: "invalid-signature" }, 200);
    }

    // Find the related Transaction by providerRef and apply confirm-or-reverse.
    if (!extracted.providerRef) {
      console.log(`[webhook:${provider}] no providerRef in payload — recorded only`);
      await db.webhookEvent.updateMany({
        where: { eventId: extracted.eventId },
        data: { processedAt: new Date() },
      });
      return json({ ok: true, processed: false, reason: "no-provider-ref" }, 200);
    }

    const tx = await db.transaction.findFirst({
      where: { providerRef: extracted.providerRef },
      select: { id: true, state: true, reference: true, userId: true },
    });

    if (!tx) {
      console.log(
        `[webhook:${provider}] no tx for providerRef=${extracted.providerRef} — recorded only`,
      );
      await db.webhookEvent.updateMany({
        where: { eventId: extracted.eventId },
        data: { processedAt: new Date() },
      });
      return json({ ok: true, processed: false, reason: "tx-not-found" }, 200);
    }

    // Mark the WebhookEvent row with the transactionId so we can cross-reference.
    await db.webhookEvent.updateMany({
      where: { eventId: extracted.eventId },
      data: { transactionId: tx.id, processedAt: new Date() },
    });

    if (extracted.status === "UNKNOWN") {
      // Provider hasn't reached a final state yet — leave the tx alone.
      console.log(
        `[webhook:${provider}] tx ${tx.reference} status UNKNOWN — leaving as-is`,
      );
      return json({ ok: true, processed: false, reason: "status-unknown" }, 200);
    }

    const outcome = await confirmOrReverseTransaction(
      tx.id,
      extracted.status,
      `webhook:${provider}`,
    );

    console.log(
      `[webhook:${provider}] tx ${tx.reference} → ${outcome.outcome} (${outcome.reason ?? "ok"})`,
    );

    return json({
      ok: true,
      processed: true,
      outcome: outcome.outcome,
      reference: tx.reference,
      startedAt,
    }, 200);
  } catch (e) {
    console.error(`[webhook:${provider}] handler error:`, e);
    // Always 200 — see header comment.
    return json(
      { ok: false, error: e instanceof Error ? e.message : "internal-error", startedAt },
      200,
    );
  }
}

// HEAD/GET support so providers that probe the URL before registering
// get a 200 instead of a 405.
export async function GET() {
  return json({ ok: true, service: "turbopay-webhook-receiver" }, 200);
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}

// Suppress handleError returning 500 — we always want 200. (We import it
// only to keep parity with other cron/api routes; not used here.)
void handleError;
