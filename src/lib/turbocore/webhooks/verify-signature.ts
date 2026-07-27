// TurboCore — unified inbound webhook signature verification.
//
// This is the public, single-entry-point helper for verifying that an
// inbound webhook really came from the provider it claims to. It wraps
// the per-provider rules (HMAC variant + header name) behind one API:
//
//   verifyWebhookSignature(provider, payload, signature, secret): boolean
//   getSignatureHeader(provider): string
//
// It complements the lower-level `verify.ts` (which returns the
// diagnostic { valid, scheme, reason } object the receiver logs). The
// receiver now delegates to this helper for the actual comparison so
// there's a single source of truth for "did the signature match?".
//
// Constant-time comparison via `crypto.timingSafeEqual` is used in every
// branch — length-mismatched inputs return false safely without raising.
//
// Per-provider rules:
//   - paystack:     HMAC-SHA512 hex of raw body, header `x-paystack-signature`.
//   - flutterwave:  plain string equality of `verif-hash` header vs secret.
//   - monnify:      HMAC-SHA512 hex of raw body, header `signature` (or
//                   `Monnify-Signature`).
//   - mpesa:        base64-encoded HMAC-SHA512 of raw body, header
//                   `x-paystack-signature`-style — Safaricom's stk callback
//                   actually sends an `x-paystack-signature`-like header in
//                   the sandbox mirror; production deployments use a
//                   signed URL path. We treat the secret as the HMAC key
//                   and compare base64 digests.
//   - default (turbopay + unknown providers):
//                   HMAC-SHA256 hex of raw body, header `X-Turbopay-Signature`.
//
// The header names returned by `getSignatureHeader` are lowercase —
// `Headers.get()` is case-insensitive so this is safe.

import { createHmac, timingSafeEqual } from "crypto";

export type WebhookAlgorithm =
  "hmac-sha512" | "hmac-sha256" | "hmac-sha512-base64" | "plain-equal" | "none";

export interface ProviderSignatureSpec {
  header: string;
  algorithm: WebhookAlgorithm;
}

const SPECS: Record<string, ProviderSignatureSpec> = {
  paystack: { header: "x-paystack-signature", algorithm: "hmac-sha512" },
  flutterwave: { header: "verif-hash", algorithm: "plain-equal" },
  monnify: { header: "signature", algorithm: "hmac-sha512" },
  // M-Pesa sandbox mirrors paystack-style header; production M-Pesa uses
  // a signed URL but if a secret is configured we compare a base64
  // HMAC-SHA512 of the raw body.
  mpesa: { header: "x-paystack-signature", algorithm: "hmac-sha512-base64" },
};

const DEFAULT_SPEC: ProviderSignatureSpec = {
  header: "x-turbopay-signature",
  algorithm: "hmac-sha256",
};

/** Get the verification spec for a provider (falls back to default). */
export function getSignatureSpec(provider: string): ProviderSignatureSpec {
  return SPECS[provider.toLowerCase()] ?? DEFAULT_SPEC;
}

/** Get the header name a provider uses to send its webhook signature. */
export function getSignatureHeader(provider: string): string {
  return getSignatureSpec(provider).header;
}

/** Compute the HMAC digest string for the given algorithm (hex or base64). */
function computeExpected(algorithm: WebhookAlgorithm, payload: string, secret: string): string {
  switch (algorithm) {
    case "hmac-sha512":
      return createHmac("sha512", secret).update(payload, "utf8").digest("hex");
    case "hmac-sha256":
      return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
    case "hmac-sha512-base64":
      return createHmac("sha512", secret).update(payload, "utf8").digest("base64");
    default:
      return "";
  }
}

/**
 * Constant-time comparison of two strings. Returns false on length
 * mismatch (which is not a timing leak — the lengths of HMAC outputs
 * are public, fixed by the algorithm).
 */
function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  try {
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export interface VerifyResult {
  valid: boolean;
  scheme: string;
  reason?: "no-secret" | "missing-signature" | "mismatch" | "no-algorithm";
}

/**
 * Verify a webhook payload against the provider's signature scheme.
 *
 * `signature` should be the raw value of the provider's signature header
 * (the caller is responsible for header lookup, so this helper is
 * testable without constructing a full `Headers` object).
 *
 * For providers with `algorithm: "none"`, returns valid=true regardless
 * of secret/signature (the caller should still verify via URL path or
 * short-code).
 *
 * For mpesa specifically: if no secret is configured we treat the
 * payload as valid (mirrors the legacy behaviour where M-Pesa's auth
 * comes from the signed callback URL, not a payload signature). When
 * a secret IS configured, we enforce HMAC-SHA512 base64.
 */
export function verifyWebhookSignature(
  provider: string,
  payload: string,
  signature: string | null | undefined,
  secret: string | null | undefined
): VerifyResult {
  const spec = getSignatureSpec(provider);
  const providerKey = provider.toLowerCase();
  const scheme = `${providerKey}:${spec.algorithm}`;

  if (spec.algorithm === "none") {
    return { valid: true, scheme };
  }

  // M-Pesa with no secret configured → treat as "no verification needed".
  // Production deployments should configure a secret (then we enforce
  // the base64 HMAC path below); sandbox/dev without one keeps working.
  if (providerKey === "mpesa" && !secret) {
    return { valid: true, scheme: `${providerKey}:none` };
  }

  if (!secret) {
    return { valid: false, scheme, reason: "no-secret" };
  }
  if (!signature) {
    return { valid: false, scheme, reason: "missing-signature" };
  }

  if (spec.algorithm === "plain-equal") {
    const ok = safeEqual(signature.trim(), secret.trim());
    return {
      valid: ok,
      scheme,
      reason: ok ? undefined : "mismatch",
    };
  }

  const expected = computeExpected(spec.algorithm, payload, secret);
  const provided = signature.trim().toLowerCase();
  const expectedNorm = spec.algorithm === "hmac-sha512-base64" ? expected : expected.toLowerCase();
  const valid = safeEqual(provided, expectedNorm);
  return { valid, scheme, reason: valid ? undefined : "mismatch" };
}

/**
 * Convenience: read the signature from a `Headers` instance (case-
 * insensitive) and verify. This is what the webhook receiver calls.
 */
export function verifyWebhookHeaders(
  provider: string,
  payload: string,
  headers: Headers,
  secret: string | null
): VerifyResult {
  const spec = getSignatureSpec(provider);
  if (spec.algorithm === "none") {
    return { valid: true, scheme: `${provider.toLowerCase()}:none` };
  }
  // Headers.get is case-insensitive but try a couple of common variants
  // anyway in case upstream proxies munge the casing.
  const sig =
    headers.get(spec.header) ??
    headers.get(spec.header.toLowerCase()) ??
    headers.get(spec.header.replace(/-/g, "_")) ??
    null;
  return verifyWebhookSignature(provider, payload, sig, secret);
}
