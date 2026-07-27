// Turbopay — Paga callback handler.
//
// POST /api/webhooks/paga
//
// Paga sends a POST with:
//   - transactionReference   (matches Transaction.providerRef)
//   - status                 (SUCCESSFUL | FAILED | PENDING)
//   - amount, currency
//   - customerPhoneNumber
//   - reference              (our internal reference)
//   - statusCode             (numeric)
//
// Auth: Paga uses HMAC-SHA512 over the request body, sent in either the
// `X-Paga-Auth` header or `signature` header. The shared secret is the
// merchant's secretKey (stored as the provider's webhook secret). If a secret
// is configured, we enforce the HMAC; if not, we accept but flag the
// delivery as unverified (sandbox / dev behaviour).
//
// Always returns 200 — Paga retries on non-2xx.

import { db } from "@/lib/db";
import { json, audit } from "@/lib/api";
import { getProviderWebhookSecret } from "@/lib/turbocore/webhooks/credentials";
import { confirmOrReverseTransaction } from "@/lib/turbocore/recovery";
import { createHmac, timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

const PROVIDER_CODE = "paga";

interface PagaCallback {
  transactionReference?: string;
  reference?: string;
  status?: string;
  statusCode?: string | number;
  amount?: string | number;
  currency?: string;
  customerPhoneNumber?: string;
  customerEmail?: string;
  fee?: string | number;
}

function normalizeStatus(body: PagaCallback): string {
  const st = String(body.status ?? body.statusCode ?? "").toUpperCase();
  if (st === "SUCCESS" || st === "SUCCESSFUL") return "SUCCESS";
  if (st === "FAILED" || st === "FAILURE" || st === "REJECTED") return "FAILED";
  if (st === "PENDING") return "PENDING";
  return "UNKNOWN";
}

/**
 * Verify Paga's HMAC-SHA512 signature on the raw body.
 *
 * Paga signs requests with HMAC-SHA512 using the merchant's `secretKey` and
 * sends the hex digest in `X-Paga-Auth` (sometimes `signature`). We compute
 * the same digest over the raw body and compare in constant time.
 *
 * If no secret is configured, we accept the callback (sandbox / dev mode).
 */
function verifyPagaSignature(
  rawBody: string,
  headers: Headers,
  secret: string | null
): { valid: boolean; scheme: string; reason?: string } {
  if (!secret) {
    return { valid: true, scheme: "paga:none", reason: "no-secret" };
  }
  const sig =
    headers.get("x-paga-auth") ??
    headers.get("signature") ??
    headers.get("x-signature") ??
    headers.get("paga-auth") ??
    null;
  if (!sig) return { valid: false, scheme: "paga:hmac-sha512", reason: "missing-signature" };

  const expected = createHmac("sha512", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(sig.trim().toLowerCase(), "utf8");
  const b = Buffer.from(expected.toLowerCase(), "utf8");
  if (a.length !== b.length || a.length === 0) {
    return { valid: false, scheme: "paga:hmac-sha512", reason: "mismatch" };
  }
  try {
    return {
      valid: timingSafeEqual(a, b),
      scheme: "paga:hmac-sha512",
    };
  } catch {
    return { valid: false, scheme: "paga:hmac-sha512", reason: "mismatch" };
  }
}

export async function POST(req: Request) {
  const startedAt = new Date().toISOString();
  try {
    const rawBody = await req.text();
    const secret = await getProviderWebhookSecret(PROVIDER_CODE);
    const verifyResult = verifyPagaSignature(rawBody, req.headers, secret);

    let body: PagaCallback = {};
    try {
      body = JSON.parse(rawBody) as PagaCallback;
    } catch {
      console.warn("[webhook:paga] unparseable body");
    }

    const transactionReference = body.transactionReference ?? null;
    const internalReference = body.reference ?? null;

    const eventId = transactionReference ?? internalReference ?? `paga:${hashOf(rawBody)}`;
    const status = normalizeStatus(body);

    // Idempotent insert.
    try {
      await db.webhookEvent.create({
        data: {
          providerCode: PROVIDER_CODE,
          eventId,
          eventType: "paga.transaction_callback",
          payloadJSON: rawBody.slice(0, 65_535),
          signatureValid: verifyResult.valid,
        },
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        console.log(`[webhook:paga] duplicate eventId=${eventId} — returning 200`);
        return json({ ok: true, duplicate: true, eventId }, 200);
      }
      throw e;
    }

    if (!verifyResult.valid) {
      console.warn(
        `[webhook:paga] signature invalid — scheme=${verifyResult.scheme} reason=${verifyResult.reason ?? "mismatch"}`
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

    // Find the transaction by providerRef === transactionReference.
    const candidateRefs = [transactionReference, internalReference].filter((v): v is string => !!v);
    let tx: { id: string; state: string; reference: string; userId: string } | null = null;
    for (const ref of candidateRefs) {
      tx = await db.transaction.findFirst({
        where: { providerRef: ref },
        select: { id: true, state: true, reference: true, userId: true },
      });
      if (tx) break;
    }

    if (!tx) {
      console.log(`[webhook:paga] no tx for refs=${JSON.stringify(candidateRefs)} — recorded only`);
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
      console.log(`[webhook:paga] tx ${tx.reference} status ${status} — leaving as-is`);
      return json({ ok: true, processed: false, reason: `status-${status.toLowerCase()}` }, 200);
    }

    const outcome = await confirmOrReverseTransaction(tx.id, status, `webhook:${PROVIDER_CODE}`);

    console.log(
      `[webhook:paga] tx ${tx.reference} → ${outcome.outcome} (${outcome.reason ?? "ok"})`
    );

    await audit({
      userId: tx.userId,
      action: "PAGA_CALLBACK_RECEIVED",
      category: "WALLET",
      severity: status === "SUCCESS" ? "INFO" : "WARN",
      metadata: {
        reference: tx.reference,
        transactionReference,
        status: body.status,
        statusCode: body.statusCode,
        amount: body.amount,
        currency: body.currency,
        customerPhoneNumber: body.customerPhoneNumber,
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
    console.error(`[webhook:paga] handler error:`, e);
    return json(
      { ok: false, error: e instanceof Error ? e.message : "internal-error", startedAt },
      200
    );
  }
}

export async function GET() {
  return json({ ok: true, service: "turbopay-webhook-paga" }, 200);
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
