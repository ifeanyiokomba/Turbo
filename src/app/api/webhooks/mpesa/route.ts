// Turbopay — M-Pesa STK push callback handler.
//
// POST /api/webhooks/mpesa
//
// M-Pesa sends a POST with `Body.stkCallback` containing:
//   - CheckoutRequestID   (matches Transaction.providerRef)
//   - MerchantRequestID
//   - ResultCode          (0 = success, anything else = failure)
//   - ResultDesc          (human-readable reason)
//   - CallbackMetadata    (only on success — Amount, MpesaReceiptNumber, PhoneNumber)
//
// Auth: M-Pesa callbacks don't carry a payload signature by default — auth is
// via the callback URL itself (signed path in production). If a webhook
// secret IS configured, the unified verifier enforces HMAC-SHA512 base64 on
// the raw body. With no secret configured (sandbox/dev), we treat the
// callback as valid (matches the legacy + verify-signature.ts behaviour).
//
// Always returns 200 — M-Pesa retries aggressively on non-2xx and we'd rather
// log a bad payload once than have it hammer the endpoint.

import { db } from "@/lib/db";
import { json, audit } from "@/lib/api";
import { getProviderWebhookSecret } from "@/lib/turbocore/webhooks/credentials";
import { verifyWebhookHeaders } from "@/lib/turbocore/webhooks/verify-signature";
import { confirmOrReverseTransaction } from "@/lib/turbocore/recovery";

export const dynamic = "force-dynamic";

const PROVIDER_CODE = "mpesa";

interface MpesaCallback {
  Body?: {
    stkCallback?: {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      ResultCode?: number;
      ResultDesc?: string;
      CallbackMetadata?: {
        Item?: Array<{ Name?: string; Value?: string | number }>;
      };
    };
  };
}

function pickMeta(meta: any, name: string): string | null {
  if (!meta || !Array.isArray(meta.Item)) return null;
  const found = meta.Item.find((it: any) => it.Name === name);
  return found?.Value != null ? String(found.Value) : null;
}

export async function POST(req: Request) {
  const startedAt = new Date().toISOString();
  let rawBody = "";
  try {
    rawBody = await req.text();
    const secret = await getProviderWebhookSecret(PROVIDER_CODE);
    const verifyResult = verifyWebhookHeaders(PROVIDER_CODE, rawBody, req.headers, secret);

    // Parse + extract the STK callback fields.
    let body: MpesaCallback = {};
    try {
      body = JSON.parse(rawBody) as MpesaCallback;
    } catch {
      // Unparseable — record the delivery but don't process.
      console.warn("[webhook:mpesa] unparseable body");
    }

    const stk = body?.Body?.stkCallback ?? null;
    const checkoutRequestID = stk?.CheckoutRequestID ?? null;
    const merchantRequestID = stk?.MerchantRequestID ?? null;
    const resultCode = stk?.ResultCode;
    const resultDesc = stk?.ResultDesc ?? "";
    const amount = stk?.CallbackMetadata ? pickMeta(stk.CallbackMetadata, "Amount") : null;
    const receipt = stk?.CallbackMetadata ? pickMeta(stk.CallbackMetadata, "MpesaReceiptNumber") : null;
    const phone = stk?.CallbackMetadata ? pickMeta(stk.CallbackMetadata, "PhoneNumber") : null;

    // eventId = CheckoutRequestID (stable per STK push). Fall back to a hash
    // of the raw body if missing so we still record the delivery idempotently.
    const eventId = checkoutRequestID ?? merchantRequestID ?? `mpesa:${hashOf(rawBody)}`;
    const eventType = "mpesa.stk_callback";
    const status =
      resultCode === 0
        ? "SUCCESS"
        : typeof resultCode === "number" && resultCode !== 0
          ? "FAILED"
          : "UNKNOWN";

    // Idempotent insert — duplicate eventId → return 200 immediately.
    try {
      await db.webhookEvent.create({
        data: {
          providerCode: PROVIDER_CODE,
          eventId,
          eventType,
          payloadJSON: rawBody.slice(0, 65_535),
          signatureValid: verifyResult.valid,
        },
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        console.log(`[webhook:mpesa] duplicate eventId=${eventId} — returning 200`);
        return json({ ok: true, duplicate: true, eventId }, 200);
      }
      throw e;
    }

    // If the signature was invalid, record the delivery but don't process.
    if (!verifyResult.valid) {
      console.warn(
        `[webhook:mpesa] signature invalid — scheme=${verifyResult.scheme} reason=${verifyResult.reason ?? "mismatch"}`,
      );
      await audit({
        action: "WEBHOOK_SIGNATURE_INVALID",
        category: "SECURITY",
        severity: "WARN",
        metadata: { provider: PROVIDER_CODE, eventId, scheme: verifyResult.scheme, reason: verifyResult.reason },
      }).catch(() => {});
      return json({ ok: false, reason: "invalid-signature" }, 200);
    }

    // No CheckoutRequestID — can't find the related transaction.
    if (!checkoutRequestID) {
      console.log("[webhook:mpesa] no CheckoutRequestID in payload — recorded only");
      await db.webhookEvent.updateMany({
        where: { eventId },
        data: { processedAt: new Date() },
      });
      return json({ ok: true, processed: false, reason: "no-checkout-id" }, 200);
    }

    // Find the related Transaction by providerRef === CheckoutRequestID.
    const tx = await db.transaction.findFirst({
      where: { providerRef: checkoutRequestID },
      select: { id: true, state: true, reference: true, userId: true },
    });

    if (!tx) {
      console.log(
        `[webhook:mpesa] no tx for CheckoutRequestID=${checkoutRequestID} — recorded only`,
      );
      await db.webhookEvent.updateMany({
        where: { eventId },
        data: { processedAt: new Date() },
      });
      return json({ ok: true, processed: false, reason: "tx-not-found" }, 200);
    }

    // Link the WebhookEvent to the transaction.
    await db.webhookEvent.updateMany({
      where: { eventId },
      data: { transactionId: tx.id, processedAt: new Date() },
    });

    if (status === "UNKNOWN") {
      console.log(`[webhook:mpesa] tx ${tx.reference} status UNKNOWN — leaving as-is`);
      return json({ ok: true, processed: false, reason: "status-unknown" }, 200);
    }

    // Apply confirm-or-reverse (idempotent — skips if tx already settled/reversed).
    const outcome = await confirmOrReverseTransaction(
      tx.id,
      status,
      `webhook:${PROVIDER_CODE}`,
    );

    console.log(
      `[webhook:mpesa] tx ${tx.reference} → ${outcome.outcome} (${outcome.reason ?? "ok"})`,
    );

    // Extra audit line with the M-Pesa-specific receipt info (the recovery
    // module audits the confirm/reverse itself; this one records the
    // receipt/phone for reconciliation).
    await audit({
      userId: tx.userId,
      action: "MPESA_CALLBACK_RECEIVED",
      category: "WALLET",
      severity: status === "SUCCESS" ? "INFO" : "WARN",
      metadata: {
        reference: tx.reference,
        checkoutRequestID,
        resultCode,
        resultDesc,
        amount,
        receipt,
        phone,
        outcome: outcome.outcome,
      },
    }).catch(() => {});

    return json({
      ok: true,
      processed: true,
      outcome: outcome.outcome,
      reference: tx.reference,
      startedAt,
    }, 200);
  } catch (e) {
    console.error(`[webhook:mpesa] handler error:`, e);
    // Always 200 — see header comment.
    return json(
      { ok: false, error: e instanceof Error ? e.message : "internal-error", startedAt },
      200,
    );
  }
}

// HEAD/GET support so providers that probe the URL before registering get a 200.
export async function GET() {
  return json({ ok: true, service: "turbopay-webhook-mpesa" }, 200);
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}

function hashOf(s: string): string {
  // Tiny stable hash for fallback eventId — not crypto-grade, just needs to be
  // deterministic per payload.
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}
