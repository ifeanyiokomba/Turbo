// CSRF protection — Edge Runtime compatible.
//
// Implements the double-submit cookie pattern:
//   1. On GET requests, `proxy.ts` mints a random token and sets it as the
//      `tp_csrf` HttpOnly-disabled cookie (must be readable by JS so the
//      client can copy it into the `X-CSRF-Token` request header).
//   2. On mutating requests (POST/PUT/PATCH/DELETE), the server compares the
//      `X-CSRF-Token` header against the `tp_csrf` cookie value using a
//      constant-time comparison.
//   3. If they don't match (or either is missing), the request is rejected
//      with 403.
//
// Edge Runtime constraints:
//   - NO Node.js `crypto` import. Use `globalThis.crypto.getRandomValues`.
//   - NO `Buffer`. Use a manual byte→hex converter.

import type { NextRequest } from "next/server";

export const CSRF_COOKIE = "tp_csrf";
export const CSRF_HEADER = "X-CSRF-Token";

/**
 * Generate a 32-byte random CSRF token, hex-encoded (64 chars).
 *
 * Uses the Web Crypto API which is available in both Edge Runtime and
 * browsers.
 */
export function generateCsrfToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  // Manual hex encoding — avoids `Buffer.toString("hex")` which is Node-only.
  let hex = "";
  const HEX_CHARS = "0123456789abcdef";
  for (let i = 0; i < bytes.length; i++) {
    hex += HEX_CHARS[bytes[i] >> 4] + HEX_CHARS[bytes[i] & 0x0f];
  }
  return hex;
}

/**
 * Constant-time string comparison using XOR.
 *
 * Compares two strings byte-by-byte and always walks the full length of the
 * longer string, so timing attackers can't infer the correct prefix.
 *
 * Returns `true` only if the strings are exactly equal (same length + same
 * bytes).
 */
export function safeCompare(a: string, b: string): boolean {
  // If lengths differ, still walk the longer string to keep timing constant,
  // but the result will always be false because the accumulator will be
  // non-zero from the length check.
  const aLen = a.length;
  const bLen = b.length;
  const maxLen = Math.max(aLen, bLen);

  let result = aLen ^ bLen; // 0 if same length, non-zero otherwise
  for (let i = 0; i < maxLen; i++) {
    const aChar = i < aLen ? a.charCodeAt(i) : 0;
    const bChar = i < bLen ? b.charCodeAt(i) : 0;
    result |= aChar ^ bChar;
  }
  return result === 0;
}

/** Mutating HTTP methods that require a valid CSRF token. */
const MUTATING_METHODS = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

/**
 * Validate the CSRF token on a Next.js request.
 *
 * - GET / HEAD / OPTIONS: always returns `{ ok: true }` (CSRF only applies
 *   to state-changing requests).
 * - POST / PUT / PATCH / DELETE: requires the `X-CSRF-Token` header to match
 *   the `tp_csrf` cookie value (constant-time comparison).
 *
 * Returns `{ ok: false, reason }` on failure so the caller can return a 403.
 */
export function validateCsrfToken(req: NextRequest): {
  ok: boolean;
  reason?: string;
} {
  const method = req.method.toUpperCase();

  // Only mutating requests require CSRF validation.
  if (!MUTATING_METHODS.has(method)) {
    return { ok: true };
  }

  const headerToken = req.headers.get(CSRF_HEADER);
  const cookieToken = req.cookies.get(CSRF_COOKIE)?.value;

  if (!headerToken || !cookieToken) {
    return {
      ok: false,
      reason: !headerToken
        ? "Missing X-CSRF-Token header"
        : "Missing tp_csrf cookie",
    };
  }

  if (!safeCompare(headerToken, cookieToken)) {
    return { ok: false, reason: "CSRF token mismatch" };
  }

  return { ok: true };
}

/**
 * Routes that are exempt from CSRF validation because they use a different
 * authentication mechanism (HMAC signatures, public registration, etc.).
 *
 * Keep this list SHORT — every entry weakens the CSRF shield.
 */
export const CSRF_EXEMPT_PATTERNS: readonly { method: string; pattern: RegExp }[] = [
  // Webhooks authenticate via HMAC signatures, not cookies.
  { method: "POST", pattern: /^\/api\/webhooks\// },
  // Public auth endpoints — no session yet, so no CSRF risk.
  { method: "POST", pattern: /^\/api\/auth\/login$/ },
  { method: "POST", pattern: /^\/api\/auth\/register$/ },
  // Cron routes are invoked by the scheduler with a secret header.
  { method: "POST", pattern: /^\/api\/cron\// },
  { method: "GET", pattern: /^\/api\/cron\// },
];

/** Check whether a request matches a CSRF-exempt route. */
export function isCsrfExempt(req: NextRequest): boolean {
  const method = req.method.toUpperCase();
  const path = req.nextUrl.pathname;
  return CSRF_EXEMPT_PATTERNS.some(
    (p) => p.method === method && p.pattern.test(path),
  );
}
