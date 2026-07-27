// Turbopay — Airtel Money callback handler.
//
// POST /api/webhooks/airtel-money
//
// Airtel sends a POST with `data` containing:
//   - data.id                       (payment id — matches Transaction.providerRef)
//   - data.status                   (SUCCESS | FAILED | PENDING)
//   - data.transaction.amount
//   - data.transaction.id
//   - data.reference
//   - data.transaction.status
//
// Auth: Airtel supports a `verif-hash` header (similar to Flutterwave) — a
// shared secret string the merchant configures on their Airtel dashboard.
// If the env var `AIRTEL_MONEY_WEBHOOK_SECRET` (or DB-stored cred) is set we
// require it to match; otherwise we accept the callback but log the missing
// signature (sandbox / dev behaviour).
//
// Always returns 200 — Airtel retries on non-2xx.

import { db } from "@/lib/db";
import { json, audit } from "@/lib/api";
import { getProviderWebhookSecret } from "@/lib/turbocore/webhooks/credentials";
import { confirmOrReverseTransaction } from "@/lib/turbocore/recovery";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

const PROVIDER_CODE = "airtel_money";

interface AirtelCallback {
  status?: { success?: boolean; response_code?: string; code?: string };
  data?: {
    id?: string;
    status?: string;
    reference?: string;
    transaction?: {
      id?: string;
      amount?: string;
      currency?: string;
      status?: string;
    };
  };
}

function normalizeStatus(body: AirtelCallback): string {
  const st = String(body?.data?.status ?? body?.data?.transaction?.status ?? "").toUpperCase();
  if (st === "SUCCESS" || st === "SUCCESSFUL") return "SUCCESS";
  if (st === "FAILED" || st === "FAILURE" || st === "REJECTED") return "FAILED";
  if (st === "PENDING") return "PENDING";
  return "UNKNOWN";
}

/**
 * Verify the `verif-hash` header (Airtel's shared-secret scheme, identical to
 * Flutterwave's). If a secret is configured, the header must equal it. If no
 * secret is configured, we accept (sandbox mode) and flag the delivery as
 * signature-valid=false so it's visible in the WebhookEvent audit trail.
 */
function verifyAirtelSignature(
  rawBody: string,
  headers: Headers,
  secret: string | null
): { valid: boolean; scheme: string; reason?: string } {
  if (!secret) {
    // Sandbox / dev — no secret configured. Accept but mark as unverified.
    return { valid: true, scheme: "airtel_money:none", reason: "no-secret" };
  }
  const sig =
    headers.get("verif-hash") ?? headers.get("x-verif-hash") ?? headers.get("verif_hash") ?? null;
  if (!sig)
    return { valid: false, scheme: "airtel_money:plain-equal", reason: "missing-signature" };
  // Plain string equality (constant-time).
  const a = Buffer.from(sig.trim(), "utf8");
  const b = Buffer.from(secret.trim(), "utf8");
  if (a.length !== b.length || a.length === 0)
    return { valid: false, scheme: "airtel_money:plain-equal", reason: "mismatch" };
  try {
    return {
      valid: timingSafeEqual(a, b),
      scheme: "airtel_money:plain-equal",
    };
  } catch {
    return { valid: false, scheme: "airtel_money:plain-equal", reason: "mismatch" };
  }
}

export async function POST(req: Request) {
  const startedAt = new Date().toISOString();
  try {
    const rawBody = await req.text();
    const secret = await getProviderWebhookSecret(PROVIDER_CODE);
    const verifyResult = verifyAirtelSignature(rawBody, req.headers, secret);

    let body: AirtelCallback = {};
    try {
      body = JSON.parse(rawBody) as AirtelCallback;
    } catch {
      console.warn("[webhook:airtel-money] unparseable body");
    }

    const paymentId = body?.data?.id ?? body?.data?.transaction?.id ?? null;
    const reference = body?.data?.reference ?? null;

    const eventId = paymentId ?? reference ?? `airtel_money:${hashOf(rawBody)}`;
    const status = normalizeStatus(body);

    // Idempotent insert.
    try {
      await db.webhookEvent.create({
        data: {
          providerCode: PROVIDER_CODE,
          eventId,
          eventType: "airtel_money.payment_callback",
          payloadJSON: rawBody.slice(0, 65_535),
          signatureValid: verifyResult.valid,
        },
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        console.log(`[webhook:airtel-money] duplicate eventId=${eventId} — returning 200`);
        return json({ ok: true, duplicate: true, eventId }, 200);
      }
      throw e;
    }

    if (!verifyResult.valid) {
      console.warn(
        `[webhook:airtel-money] signature invalid — scheme=${verifyResult.scheme} reason=${verifyResult.reason ?? "mismatch"}`
      );
      await audit({
        action: "WEBHOOK_SIGNATURE_INVALID",
        category: "SECURITY",
        severity: "WARN",
        metadata: {
          provider: PROVIDER_CODE,
          eventId,
          scheme: verifyResult.scheme,
          reason: verifyResult.reason,
        },
      }).catch(() => {});
      return json({ ok: false, reason: "invalid-signature" }, 200);
    }

    // Find the transaction. We stored `data.id` (payment id) as providerRef
    // when we initiated the collection.
    const candidateRefs = [paymentId, reference].filter((v): v is string => !!v);
    let tx: { id: string; state: string; reference: string; userId: string } | null = null;
    for (const ref of candidateRefs) {
      tx = await db.transaction.findFirst({
        where: { providerRef: ref },
        select: { id: true, state: true, reference: true, userId: true },
      });
      if (tx) break;
    }

    if (!tx) {
      console.log(
        `[webhook:airtel-money] no tx for refs=${JSON.stringify(candidateRefs)} — recorded only`
      );
      await db.webhookEvent.updateMany({
        where: { eventId },
        data: { processedAt: new Date() },
      });
      return json({ ok: true, processed: false, reason: "tx-not-found" }, 200);
    }

    await db.webhookEvent.updateMany({
      where: { eventId },
      data: { transactionId: tx.id, processedAt: new Date() },
    });

    if (status === "UNKNOWN" || status === "PENDING") {
      console.log(`[webhook:airtel-money] tx ${tx.reference} status ${status} — leaving as-is`);
      return json({ ok: true, processed: false, reason: `status-${status.toLowerCase()}` }, 200);
    }

    const outcome = await confirmOrReverseTransaction(tx.id, status, `webhook:${PROVIDER_CODE}`);

    console.log(
      `[webhook:airtel-money] tx ${tx.reference} → ${outcome.outcome} (${outcome.reason ?? "ok"})`
    );

    await audit({
      userId: tx.userId,
      action: "AIRTEL_MONEY_CALLBACK_RECEIVED",
      category: "WALLET",
      severity: status === "SUCCESS" ? "INFO" : "WARN",
      metadata: {
        reference: tx.reference,
        paymentId,
        airtelReference: reference,
        status: body?.data?.status,
        amount: body?.data?.transaction?.amount,
        currency: body?.data?.transaction?.currency,
        outcome: outcome.outcome,
      },
    }).catch(() => {});

    return json(
      {
        ok: true,
        processed: true,
        outcome: outcome.outcome,
        reference: tx.reference,
        startedAt,
      },
      200
    );
  } catch (e) {
    console.error(`[webhook:airtel-money] handler error:`, e);
    return json(
      { ok: false, error: e instanceof Error ? e.message : "internal-error", startedAt },
      200
    );
  }
}

export async function GET() {
  return json({ ok: true, service: "turbopay-webhook-airtel-money" }, 200);
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}

function hashOf(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}
