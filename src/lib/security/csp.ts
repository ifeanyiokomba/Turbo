<<<<<<< HEAD
// CSP + OWASP security headers — Edge Runtime compatible.
//
// This module runs inside `src/proxy.ts` (Next.js 16 middleware), which executes
// on the Edge Runtime. Therefore:
//   - NO Node.js `crypto`, `Buffer`, or `process` imports.
//   - Use the Web Crypto API (`globalThis.crypto.getRandomValues`) for nonce
//     generation.
//   - Use `btoa()` for base64 encoding (globally available in Edge Runtime).
//
// Headers produced (11 OWASP-aligned):
//   1.  Content-Security-Policy          (nonce-based, strict-dynamic in prod)
//   2.  Strict-Transport-Security        (HSTS — 2 years + preload)
//   3.  X-Frame-Options                  (DENY — clickjacking)
//   4.  X-Content-Type-Options           (nosniff — MIME sniffing)
//   5.  Referrer-Policy                  (strict-origin-when-cross-origin)
//   6.  Permissions-Policy               (lock down camera/mic/geolocation/…)
//   7.  Cross-Origin-Opener-Policy       (same-origin — COOP)
//   8.  Cross-Origin-Resource-Policy     (same-origin — CORP)
//   9.  Cross-Origin-Embedder-Policy     (credentialless — COEP)
//   10. X-XSS-Protection                 (1; mode=block — legacy browsers)
//   11. Cache-Control                    (no-store for API — set selectively)

/** Generate a per-request CSP nonce using the Web Crypto API. */
export function generateCspNonce(): string {
  // 18 random bytes → 24 base64 chars. The CSP spec recommends at least 128
  // bits of entropy; 18 bytes = 144 bits.
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  // btoa is available in both Edge Runtime and browsers. Convert each byte to
  // a char and base64-encode the resulting string.
=======
// TurboCore — Content Security Policy (CSP) Generator
//
// CSP is the browser's last line of defense against XSS. If an attacker
// manages to inject a <script> tag, CSP blocks it from executing.
//
// TurboCore uses a nonce-based CSP in production:
//   - Each request gets a unique random nonce
//   - Only <script> tags with the correct nonce attribute can execute
//   - Inline event handlers (onclick=) are blocked
//   - eval() is blocked
//
// In development, we relax CSP to allow Turbopack HMR (which uses eval +
// inline scripts for hot module replacement).
//
// IMPORTANT: This module is used in the Edge Runtime middleware, so it must
// NOT import Node.js built-ins like "crypto". It uses the Web Crypto API
// instead.
//
// Usage:
//   import { generateCspNonce, buildCspHeader } from "@/lib/security/csp";
//
//   const nonce = generateCspNonce();
//   const csp = buildCspHeader(nonce, isProduction);
//   res.headers.set("Content-Security-Policy", csp);

/**
 * Generates a cryptographically random nonce for CSP.
 * 32 bytes = 256 bits = base64-encoded to 44 chars.
 * Uses Web Crypto API (Edge Runtime compatible).
 */
export function generateCspNonce(): string {
  const bytes = new Uint8Array(32);
  if (typeof globalThis !== "undefined" && globalThis.crypto) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Fallback for very old environments
    for (let i = 0; i < 32; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  // Convert to base64
>>>>>>> ecead5e1765c9674c5c6ba0b7f23bbf8d0791ddf
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
<<<<<<< HEAD
 * Build the Content-Security-Policy header value.
 *
 * Production:
 *   - script-src uses 'nonce-<nonce>' 'strict-dynamic' — no 'unsafe-inline'
 *     or 'unsafe-eval'.
 *   - All other directives locked down to 'self' or 'none'.
 *
 * Development:
 *   - Relaxed to allow Turbopack HMR: 'unsafe-inline' + 'unsafe-eval' for
 *     script-src, ws: + wss: for connect-src (HMR websocket), and localhost
 *     origins for style-src.
=======
 * Builds a Content-Security-Policy header value.
 *
 * In production:
 *   - script-src uses 'nonce-{nonce}' instead of 'unsafe-inline'
 *   - No 'unsafe-eval'
 *   - connect-src restricted to self + allowlisted domains
 *
 * In development:
 *   - 'unsafe-inline' + 'unsafe-eval' allowed (Turbopack HMR needs them)
>>>>>>> ecead5e1765c9674c5c6ba0b7f23bbf8d0791ddf
 */
export function buildCspHeader(nonce: string, isProduction: boolean): string {
  if (isProduction) {
    return [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
<<<<<<< HEAD
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "frame-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "manifest-src 'self'",
      "worker-src 'self' blob:",
      "media-src 'self' blob:",
      "upgrade-insecure-requests",
    ].join("; ");
  }

  // Dev: allow Turbopack HMR + React DevTools + inline styles.
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss: http: https:",
    "frame-ancestors 'self'",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
=======
      "style-src 'self' 'unsafe-inline'", // Tailwind requires inline styles
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      `connect-src 'self' https:`, // Allow provider API calls
      "frame-ancestors 'none'",
      "frame-src 'self' https:", // Payment provider iframes (checkout)
      "object-src 'none'", // Block Flash/Java/etc
      "base-uri 'self'",
      "form-action 'self' https:",
      "manifest-src 'self'",
      "worker-src 'self' blob:",
      "child-src 'self' blob:",
      "upgrade-insecure-requests",
      "block-all-mixed-content",
    ].join("; ");
  }

  // Development — relaxed for Turbopack HMR
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: ws: wss:", // WebSocket for HMR
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
>>>>>>> ecead5e1765c9674c5c6ba0b7f23bbf8d0791ddf
  ].join("; ");
}

/**
<<<<<<< HEAD
 * Build all 11 OWASP-aligned security headers as a plain object suitable for
 * spreading into a `Response`/`NextResponse` headers init.
 *
 * Pass the nonce if you want CSP to be nonce-based; omit it for a relaxed
 * policy (used for static asset responses where the nonce isn't injected).
 */
export function buildSecurityHeaders(
  nonce?: string,
  isProduction: boolean = process.env.NODE_ENV === "production",
): Record<string, string> {
  const headers: Record<string, string> = {
    "Strict-Transport-Security":
      "max-age=63072000; includeSubDomains; preload",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=(), " +
      "usb=(), magnetometer=(), gyroscope=(), accelerometer=(), " +
      "interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "credentialless",
    "X-XSS-Protection": "1; mode=block",
  };

  if (nonce) {
    headers["Content-Security-Policy"] = buildCspHeader(nonce, isProduction);
  }

  return headers;
}

/**
 * Build CORS response headers for a given origin.
 *
 * - If `origin` is in `allowedOrigins`, reflects it back via
 *   `Access-Control-Allow-Origin` and sets `Access-Control-Allow-Credentials:
 *   true`.
 * - Otherwise returns an empty object (browser will block the response).
 *
 * The caller is expected to handle preflight (OPTIONS) by also emitting
 * `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers`.
 */
export function buildCorsHeaders(
  origin: string | null,
  allowedOrigins: string[] = [],
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!origin) return headers;
  // Wildcard "*" — allow any origin (no credentials). Use sparingly.
  if (allowedOrigins.includes("*")) {
    headers["Access-Control-Allow-Origin"] = "*";
    headers["Vary"] = "Origin";
    return headers;
  }
  if (allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Vary"] = "Origin";
  }
  return headers;
}

/** Standard CORS preflight headers for an OPTIONS response. */
export function buildCorsPreflightHeaders(
  origin: string | null,
  allowedOrigins: string[] = [],
): Record<string, string> {
  return {
    ...buildCorsHeaders(origin, allowedOrigins),
    "Access-Control-Allow-Methods":
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-CSRF-Token, X-Request-ID, X-Requested-With",
    "Access-Control-Max-Age": "86400",
=======
 * All security headers to apply to every response.
 * Returns a Record<string, string> suitable for NextResponse.headers.set().
 */
export function buildSecurityHeaders(nonce?: string): Record<string, string> {
  const isProduction = process.env.NODE_ENV === "production";
  const csp = buildCspHeader(nonce ?? "", isProduction);

  return {
    "Content-Security-Policy": csp,
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(self)",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-DNS-Prefetch-Control": "on",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    // X-XSS-Protection is deprecated but still useful for older browsers
    "X-XSS-Protection": "1; mode=block",
  };
}

/**
 * Returns the CORS headers for API responses.
 */
export function buildCorsHeaders(
  origin: string | null,
  allowedOrigins: string[]
): Record<string, string> {
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0] || "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Idempotency-Key, X-CSRF-Token",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
>>>>>>> ecead5e1765c9674c5c6ba0b7f23bbf8d0791ddf
  };
}
