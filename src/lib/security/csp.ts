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
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
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
 */
export function buildCspHeader(nonce: string, isProduction: boolean): string {
  if (isProduction) {
    return [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
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
  ].join("; ");
}

/**
 * Build all 11 OWASP-aligned security headers as a plain object suitable for
 * spreading into a `Response`/`NextResponse` headers init.
 *
 * Pass the nonce if you want CSP to be nonce-based; omit it for a relaxed
 * policy (used for static asset responses where the nonce isn't injected).
 */
export function buildSecurityHeaders(
  nonce?: string,
  isProduction: boolean = process.env.NODE_ENV === "production"
): Record<string, string> {
  const headers: Record<string, string> = {
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
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
  allowedOrigins: string[] = []
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
  allowedOrigins: string[] = []
): Record<string, string> {
  return {
    ...buildCorsHeaders(origin, allowedOrigins),
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-CSRF-Token, X-Request-ID, X-Requested-With",
    "Access-Control-Max-Age": "86400",
  };
}
