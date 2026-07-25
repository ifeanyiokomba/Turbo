// TurboCore — outbound webhook payload signing + signature verification.
//
// Outbound (publisher → merchant endpoint): HMAC-SHA256 hex of the raw JSON
// body, sent in the `X-Turbopay-Signature` header. Merchants verify by
// recomputing the HMAC over the raw body with their shared secret.
//
// Verification uses `timingSafeEqual` to defend against timing attacks —
// never use `===` to compare signatures.

import { createHmac, timingSafeEqual } from "crypto";

/** Sign a payload string with the shared secret and return hex HMAC-SHA256. */
export function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

/**
 * Verify a signature against a payload. Returns true iff the signature
 * matches the HMAC-SHA256 of `payload` under `secret`, compared in
 * constant time. Length-mismatched inputs return false safely.
 */
export function verifySignature(payload: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = signPayload(payload, secret);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Header name used for outbound Turbopay webhook signatures. */
export const TURBOPAY_SIGNATURE_HEADER = "X-Turbopay-Signature";
