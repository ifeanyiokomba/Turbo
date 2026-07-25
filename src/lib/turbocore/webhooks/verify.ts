// TurboCore — per-provider inbound webhook signature verification.
//
// Each provider signs its webhook payloads differently:
//   - Paystack: HMAC-SHA512 hex of the raw body in `x-paystack-signature`.
//   - Flutterwave: plain string equality of the `verif-hash` header
//     against the merchant's secret hash.
//   - Monnify: HMAC-SHA512 hex of the raw body in `signature` (or
//     `Monnify-Signature`).
//   - M-Pesa: no signature — auth is via the callback URL itself, so we
//     treat every payload as "signature valid" (callers should also put
//     the M-Pesa short-code behind a secret path segment if needed).
//   - Default (turbopay + any unknown provider): HMAC-SHA256 hex of the
//     raw body in `X-Turbopay-Signature` (matches our outbound signing).
//
// Returns { valid, scheme } so the caller can record which scheme passed.

import { createHmac, timingSafeEqual } from "crypto";

export interface VerifyResult {
  valid: boolean;
  scheme: string;
  reason?: string;
}

export interface ProviderSignatureSpec {
  /** Header name to read the signature from. */
  header: string;
  /** Verification algorithm. */
  algorithm: "hmac-sha512" | "hmac-sha256" | "plain-equal" | "none";
}

const SPECS: Record<string, ProviderSignatureSpec> = {
  paystack: { header: "x-paystack-signature", algorithm: "hmac-sha512" },
  flutterwave: { header: "verif-hash", algorithm: "plain-equal" },
  monnify: { header: "signature", algorithm: "hmac-sha512" },
  mpesa: { header: "", algorithm: "none" },
};

const DEFAULT_SPEC: ProviderSignatureSpec = {
  header: "x-turbopay-signature",
  algorithm: "hmac-sha256",
};

/** Get the spec for a provider (falls back to the Turbopay default). */
export function getSignatureSpec(provider: string): ProviderSignatureSpec {
  return SPECS[provider.toLowerCase()] ?? DEFAULT_SPEC;
}

/** Compute the HMAC hex digest for the given algorithm. */
function computeHmac(algorithm: "hmac-sha512" | "hmac-sha256", payload: string, secret: string): string {
  const alg = algorithm === "hmac-sha512" ? "sha512" : "sha256";
  return createHmac(alg, secret).update(payload, "utf8").digest("hex");
}

/** Constant-time comparison of two hex/base64 strings. Returns false on length mismatch. */
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

/**
 * Verify a webhook payload against the provider's signature scheme.
 *
 * If the provider has no signature scheme (`none`), returns valid=true.
 * If a secret is required but not configured, returns valid=false with
 * reason="no-secret".
 */
export function verifyProviderSignature(
  provider: string,
  rawBody: string,
  headers: Headers,
  secret: string | null,
): VerifyResult {
  const spec = getSignatureSpec(provider);
  const providerKey = provider.toLowerCase();

  if (spec.algorithm === "none") {
    return { valid: true, scheme: `${providerKey}:none` };
  }

  if (!secret) {
    return { valid: false, scheme: `${providerKey}:${spec.algorithm}`, reason: "no-secret" };
  }

  const sigHeader = spec.header;
  // Try the canonical header, plus a few common variants (case-insensitive
  // via Headers.get already being case-insensitive).
  const provided =
    headers.get(sigHeader) ??
    headers.get(sigHeader.toLowerCase()) ??
    headers.get(sigHeader.replace(/-/g, "_")) ??
    null;

  if (!provided) {
    return { valid: false, scheme: `${providerKey}:${spec.algorithm}`, reason: "missing-signature" };
  }

  if (spec.algorithm === "plain-equal") {
    return {
      valid: safeEqual(provided.trim(), secret.trim()),
      scheme: `${providerKey}:plain-equal`,
    };
  }

  // HMAC variants.
  const expected = computeHmac(spec.algorithm, rawBody, secret);
  return {
    valid: safeEqual(provided.trim().toLowerCase(), expected.toLowerCase()),
    scheme: `${providerKey}:${spec.algorithm}`,
  };
}
