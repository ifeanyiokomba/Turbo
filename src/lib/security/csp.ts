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
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Builds a Content-Security-Policy header value.
 *
 * In production:
 *   - script-src uses 'nonce-{nonce}' instead of 'unsafe-inline'
 *   - No 'unsafe-eval'
 *   - connect-src restricted to self + allowlisted domains
 *
 * In development:
 *   - 'unsafe-inline' + 'unsafe-eval' allowed (Turbopack HMR needs them)
 */
export function buildCspHeader(nonce: string, isProduction: boolean): string {
  if (isProduction) {
    return [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
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
  ].join("; ");
}

/**
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
  };
}
