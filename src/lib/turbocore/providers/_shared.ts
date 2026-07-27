// TurboCore — small shared helpers for real provider adapters.
//
// - requireCreds(): centralizes the "no creds → mock in dev / AUTH_FAILED in
//   prod" decision so every adapter opens with the same 3 lines.
// - mockWarnOnce(): logs the `[provider:CODE] mock mode` banner exactly once
//   per provider code per process (so dev logs aren't flooded).
// - http(): thin fetch wrapper that times out and converts non-2xx into a
//   ProviderResult-shaped failure via the `onHttpError` callback.
// - sanitize(): scrubs a value for inclusion in ProviderError.raw — strips
//   anything that looks like a key/secret so we never log credentials.

import type { ProviderResult, ProviderErrorCode } from "../result";
import { fail } from "../result";
import { getCredentials, type ProviderCredentials } from "./credentials";
import { validateOutboundUrl } from "@/lib/security/ssrf";

const mockLogged = new Set<string>();

/** Log "[provider:CODE] mock mode — no credentials" exactly once per code. */
export function mockWarnOnce(code: string): void {
  if (mockLogged.has(code)) return;
  mockLogged.add(code);
  console.log(`[provider:${code}] mock mode — no credentials`);
}

/**
 * Resolve credentials for a provider code.
 *
 * - Returns the decrypted creds if a row exists.
 * - If no row AND NODE_ENV === "production", returns a fail() result the
 *   caller can `return` immediately.
 * - If no row AND not production, logs mock mode once and returns null — the
 *   caller should then synthesize demo data via ok().
 *
 * Usage:
 *   const notConfigured = await requireCreds("paystack");
 *   if (notConfigured) return notConfigured; // prod AUTH_FAILED short-circuit
 *   const creds = await getCredentials("paystack"); // null in mock mode
 *   if (!creds) { mockWarnOnce("paystack"); return ok(demoData, "mock", 0); }
 */
export async function requireCreds(code: string): Promise<ProviderResult<never> | null> {
  const creds = await getCredentials(code);
  if (creds) return null; // configured — caller proceeds with real call
  if (process.env.NODE_ENV === "production") {
    return fail("AUTH_FAILED", `Provider ${code} not configured`, {
      providerCode: code,
    });
  }
  return null; // non-prod mock mode — caller handles
}

/** Convenience: returns the (cached) creds object, or null if unconfigured. */
export async function loadCreds(code: string): Promise<ProviderCredentials | null> {
  return getCredentials(code);
}

/**
 * fetch() wrapper that:
 *   - validates the destination URL with the SSRF guard (blocks private IPs,
 *     loopback, link-local, CGNAT, metadata endpoints, and obfuscated IPs),
 *   - applies a 20s timeout (PROVIDER_TIMEOUT on abort),
 *   - parses JSON response (or returns {} if body is empty/non-JSON),
 *   - on non-2xx calls `onHttpError(status, body)` to map to a ProviderResult.
 *
 * Network failures bubble up as exceptions; the caller's try/catch should
 * convert them to `fail("UPSTREAM_ERROR", e.message, ...)`.
 */
export async function http(
  url: string,
  init: RequestInit & { timeoutMs?: number },
  onHttpError: (status: number, body: unknown) => ProviderResult<never>
): Promise<{ status: number; body: unknown }> {
  // SSRF guard — runs BEFORE the network call so we never even establish a
  // TCP connection to an internal address. The original SsrfError is re-
  // thrown so the caller's existing try/catch (which treats any thrown
  // Error as a network failure and maps it via `fail("UPSTREAM_ERROR", ...)`)
  // preserves the human-readable block reason in the error message.
  await validateOutboundUrl(url);

  const { timeoutMs = 20_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: controller.signal });
    let body: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { _raw: text };
      }
    }
    if (!res.ok) {
      throw onHttpError(res.status, body);
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sanitize a value for inclusion in ProviderError.raw.
 *
 * Recursively walks objects/arrays and redacts any string value whose key
 * looks like a secret (secret, key, token, password, authorization, bearer,
 * apikey, api_key, privatekey, private_key). Also truncates long strings to
 * 512 chars so we don't dump entire response bodies into the error log.
 */
export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[truncated:depth]";
  if (value == null) return value;
  if (typeof value === "string") {
    return value.length > 512 ? value.slice(0, 512) + "…[truncated]" : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const lk = k.toLowerCase();
      if (
        lk.includes("secret") ||
        lk.includes("token") ||
        lk.includes("password") ||
        lk.includes("authorization") ||
        lk.includes("bearer") ||
        lk.includes("apikey") ||
        lk.includes("api_key") ||
        lk.includes("privatekey") ||
        lk.includes("private_key") ||
        lk.includes("cvv") ||
        lk.includes("pan")
      ) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = sanitize(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

/** Standard "non-2xx → fail" mapper for providers that don't publish richer codes. */
export function defaultHttpError(
  code: string,
  status: number,
  body: unknown
): ProviderResult<never> {
  let errCode: ProviderErrorCode = "UPSTREAM_ERROR";
  if (status === 401 || status === 403) errCode = "AUTH_FAILED";
  else if (status === 429) errCode = "RATE_LIMITED";
  else if (status >= 500) errCode = "PROVIDER_DOWN";
  else if (status === 400 || status === 422) errCode = "INVALID_REQUEST";
  const msg =
    body && typeof body === "object" && "message" in body
      ? String((body as { message: unknown }).message)
      : `${code} returned HTTP ${status}`;
  return fail(errCode, msg, { providerCode: code, httpStatus: status, raw: sanitize(body) });
}
