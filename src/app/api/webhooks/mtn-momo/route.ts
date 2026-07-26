// Turbopay — MTN MoMo request-to-pay callback handler.
//
// POST /api/webhooks/mtn-momo
//
// MTN sends a POST with:
//   - status                 (SUCCESSFUL | FAILED | PENDING | TIMEOUT)
//   - externalId             (the caller-supplied reference we passed in
//                            `externalId` when initiating request-to-pay)
//   - financialTransactionId (MTN's internal id)
//   - amount, currency
//   - payerMessage, payeeNote
//   - referenceId (sometimes; usually delivered as the X-Reference-Id header
//     on the originating request, which we stored as Transaction.providerRef)
//
// Auth: MTN uses OAuth2 client-credentials for outbound calls, but inbound
// webhook callbacks rely on the callback URL being registered with the
// subscription. There is no signature header. We accept the payload and rely
// on providerRef correlation for safety. (A production deployment should put
// the callback URL behind a secret path segment.)
//
// Always returns 200 — MTN retries on non-2xx.

import { db } from "@/lib/db";
import { json, audit } from "@/lib/api";
import { confirmOrReverseTransaction } from "@/lib/turbocore/recovery";

export const dynamic = "force-dynamic";

const PROVIDER_CODE = "mtn_momo";

interface MtnCallback {
  status?: string;
  externalId?: string;
  financialTransactionId?: string;
  amount?: string;
  currency?: string;
  payerMessage?: string;
  payeeNote?: string;
  referenceId?: string;
}

function normalizeStatus(raw: string | undefined): string {
  const s = String(raw ?? "").toUpperCase();
  if (s === "SUCCESSFUL" || s === "SUCCESS") return "SUCCESS";
  if (s === "FAILED" || s === "TIMEOUT" || s === "REJECTED") return "FAILED";
  if (s === "PENDING") return "PENDING";
  return "UNKNOWN";
}

export async function POST(req: Request) {
  const startedAt = new Date().toISOString();
  try {
    const rawBody = await req.text();

    let body: MtnCallback = {};
    try {
      body = JSON.parse(rawBody) as MtnCallback;
    } catch {
      console.warn("[webhook:mtn-momo] unparseable body");
    }

    const financialTxId = body.financialTransactionId ?? null;
    const externalId = body.externalId ?? null;
    const referenceId = body.referenceId ?? null;

    // eventId — prefer financialTransactionId (most stable), then externalId,
    // then a sha of the raw body so duplicate deliveries dedupe.
    const eventId =
      financialTxId ?? externalId ?? referenceId ?? `mtn_momo:${hashOf(rawBody)}`;

    const status = normalizeStatus(body.status);

    // Idempotent insert.
    try {
      await db.webhookEvent.create({
        data: {
          providerCode: PROVIDER_CODE,
          eventId,
          eventType: "mtn_momo.request_to_pay_callback",
          payloadJSON: rawBody.slice(0, 65_535),
          signatureValid: true, // MTN callbacks have no signature header
        },
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        console.log(`[webhook:mtn-momo] duplicate eventId=${eventId} — returning 200`);
        return json({ ok: true, duplicate: true, eventId }, 200);
      }
      throw e;
    }

    // The Transaction.providerRef we stored at initiation was the
    // X-Reference-Id UUID (returned by `collect`). MTN's callback usually
    // echoes it as `referenceId` in the body. As a fallback, we also try the
    // externalId (which we set to the first 16 chars of our internal
    // reference).
    const candidateRefs = [referenceId, externalId, financialTxId].filter(
      (v): v is string => !!v,
    );

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
        `[webhook:mtn-momo] no tx for refs=${JSON.stringify(candidateRefs)} — recorded only`,
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
      console.log(`[webhook:mtn-momo] tx ${tx.reference} status ${status} — leaving as-is`);
      return json({ ok: true, processed: false, reason: `status-${status.toLowerCase()}` }, 200);
    }

    const outcome = await confirmOrReverseTransaction(
      tx.id,
      status,
      `webhook:${PROVIDER_CODE}`,
    );

    console.log(
      `[webhook:mtn-momo] tx ${tx.reference} → ${outcome.outcome} (${outcome.reason ?? "ok"})`,
    );

    await audit({
      userId: tx.userId,
      action: "MTN_MOMO_CALLBACK_RECEIVED",
      category: "WALLET",
      severity: status === "SUCCESS" ? "INFO" : "WARN",
      metadata: {
        reference: tx.reference,
        externalId,
        financialTransactionId: financialTxId,
        status: body.status,
        amount: body.amount,
        currency: body.currency,
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
    console.error(`[webhook:mtn-momo] handler error:`, e);
    return json(
      { ok: false, error: e instanceof Error ? e.message : "internal-error", startedAt },
      200,
    );
  }
}

export async function GET() {
  return json({ ok: true, service: "turbopay-webhook-mtn-momo" }, 200);
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
