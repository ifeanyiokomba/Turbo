// TurboCore — per-provider inbound webhook payload extraction.
//
// Different providers send differently-shaped webhook bodies. This module
// extracts three things, normalized across providers:
//   - eventId: stable unique id for idempotency (so we can re-receive
//     the same webhook safely).
//   - providerRef: the provider's reference for the underlying transaction
//     (matches Transaction.providerRef).
//   - status: "SUCCESS" | "FAILED" | "PENDING" | "UNKNOWN".
//
// All extractors are defensive — missing fields return null/UNKNOWN rather
// than throwing, so a malformed payload from one provider never breaks
// the webhook pipeline.

import { createHash } from "crypto";

export interface ExtractedPayload {
  eventId: string;
  eventType: string;
  providerRef: string | null;
  status: string;
}

/** Hash a raw body to a stable id when the provider's body lacks a natural id. */
function hashId(provider: string, raw: string): string {
  return `${provider}:${createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 32)}`;
}

/** Read a string field from a nested object via a list of candidate paths. */
function pick(obj: any, paths: string[]): any {
  for (const p of paths) {
    const parts = p.split(".");
    let cur: any = obj;
    let ok = true;
    for (const part of parts) {
      if (cur == null || typeof cur !== "object" || !(part in cur)) {
        ok = false;
        break;
      }
      cur = cur[part];
    }
    if (ok && cur != null) return cur;
  }
  return undefined;
}

/** Extract eventId/eventType/providerRef/status from a provider webhook body. */
export function extractPayload(provider: string, raw: string): ExtractedPayload {
  let body: any = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return {
      eventId: hashId(provider, raw),
      eventType: "unparseable",
      providerRef: null,
      status: "UNKNOWN",
    };
  }

  switch (provider.toLowerCase()) {
    case "paystack":
      return extractPaystack(body, raw);
    case "flutterwave":
      return extractFlutterwave(body, raw);
    case "monnify":
      return extractMonnify(body, raw);
    case "mpesa":
      return extractMpesa(body, raw);
    default:
      return extractDefault(provider, body, raw);
  }
}

function extractPaystack(body: any, raw: string): ExtractedPayload {
  const eventId =
    pick(body, ["data.id", "data.reference", "event"])?.toString() || hashId("paystack", raw);
  const eventType = (body.event ?? "paystack.event").toString();
  const providerRef =
    pick(body, ["data.reference", "data.id", "data.providerRef"])?.toString() ?? null;
  const rawStatus = (pick(body, ["data.status", "event"]) ?? "").toString().toLowerCase();
  const status = rawStatus.includes("success")
    ? "SUCCESS"
    : rawStatus.includes("fail") || rawStatus.includes("abandon")
      ? "FAILED"
      : rawStatus.includes("pending")
        ? "PENDING"
        : "UNKNOWN";
  return { eventId, eventType, providerRef, status };
}

function extractFlutterwave(body: any, raw: string): ExtractedPayload {
  const eventId =
    pick(body, ["data.id", "event.id", "data.tx_ref", "event"])?.toString() ||
    hashId("flutterwave", raw);
  const eventType = (body.event ?? "flutterwave.event").toString();
  const providerRef =
    pick(body, ["data.tx_ref", "data.flw_ref", "data.id", "data.reference"])?.toString() ?? null;
  const rawStatus = (pick(body, ["data.status", "event", "status"]) ?? "").toString().toLowerCase();
  const status = rawStatus.includes("success")
    ? "SUCCESS"
    : rawStatus.includes("fail") || rawStatus.includes("cancel")
      ? "FAILED"
      : rawStatus.includes("pending")
        ? "PENDING"
        : "UNKNOWN";
  return { eventId, eventType, providerRef, status };
}

function extractMonnify(body: any, raw: string): ExtractedPayload {
  const eventId =
    pick(body, ["eventReference", "event.reference", "data.transactionReference"])?.toString() ||
    hashId("monnify", raw);
  const eventType = (body.eventType ?? body.event ?? "monnify.event").toString();
  const providerRef =
    pick(body, [
      "data.transactionReference",
      "data.paymentReference",
      "eventData.transactionReference",
    ])?.toString() ?? null;
  const rawStatus = (
    pick(body, ["eventData.paymentStatus", "data.paymentStatus", "paymentStatus", "eventType"]) ??
    ""
  )
    .toString()
    .toUpperCase();
  const status =
    rawStatus.includes("SUCCESS") || rawStatus.includes("PAID")
      ? "SUCCESS"
      : rawStatus.includes("FAIL") || rawStatus.includes("OVERPAY")
        ? "FAILED"
        : rawStatus.includes("PENDING")
          ? "PENDING"
          : "UNKNOWN";
  return { eventId, eventType, providerRef, status };
}

function extractMpesa(body: any, raw: string): ExtractedPayload {
  const stk = pick(body, ["Body.stkCallback"]) ?? null;
  const eventId =
    (stk && pick(stk, ["CheckoutRequestID", "MerchantRequestID"])?.toString()) ||
    hashId("mpesa", raw);
  const eventType = "mpesa.stk_callback";
  const providerRef =
    (stk && pick(stk, ["CheckoutRequestID", "MerchantRequestID"])?.toString()) ?? null;
  const resultCode = pick(stk, ["ResultCode"]);
  const status =
    resultCode === 0
      ? "SUCCESS"
      : typeof resultCode === "number" && resultCode !== 0
        ? "FAILED"
        : "UNKNOWN";
  return { eventId, eventType, providerRef, status };
}

function extractDefault(provider: string, body: any, raw: string): ExtractedPayload {
  const eventId =
    pick(body, ["id", "eventId", "event_id", "data.id", "reference"])?.toString() ||
    hashId(provider, raw);
  const eventType = (body.event ?? body.type ?? `${provider}.event`).toString();
  const providerRef =
    pick(body, [
      "providerRef",
      "data.providerRef",
      "data.reference",
      "reference",
      "data.id",
    ])?.toString() ?? null;
  const rawStatus = (pick(body, ["data.status", "status", "data.state"]) ?? "")
    .toString()
    .toUpperCase();
  const status = rawStatus.includes("SUCCESS")
    ? "SUCCESS"
    : rawStatus.includes("FAIL")
      ? "FAILED"
      : rawStatus.includes("PENDING")
        ? "PENDING"
        : "UNKNOWN";
  return { eventId, eventType, providerRef, status };
}
