<<<<<<< HEAD
// Barrel export for all security modules.
//
// Import paths:
//   import { generateCsrfToken, validateOutboundUrl, sanitizeBody } from "@/lib/security";
//
// Note: the SSRF guard (`ssrf.ts`) and sanitizer (`sanitize.ts`) are server-
// only. The CSRF client (`client.ts`) is browser-only. The CSP and CSRF
// server modules (`csp.ts`, `csrf.ts`) are Edge Runtime compatible and safe
// to import from `proxy.ts`.

// Edge Runtime compatible — used by proxy.ts.
export {
  generateCspNonce,
  buildCspHeader,
  buildSecurityHeaders,
  buildCorsHeaders,
  buildCorsPreflightHeaders,
} from "./csp";

// Edge Runtime compatible — used by proxy.ts.
export {
  CSRF_COOKIE,
  CSRF_HEADER,
  generateCsrfToken,
  safeCompare,
  validateCsrfToken,
  isCsrfExempt,
  CSRF_EXEMPT_PATTERNS,
} from "./csrf";

// Server-only (Node Runtime) — used by API route handlers.
export {
  sanitizeString,
  sanitizeEmail,
  sanitizePhone,
  sanitizeUrl,
  sanitizeId,
  sanitizeObject,
  sanitizeBody,
  detectMalicious,
  fingerprint,
  XSS_PATTERNS,
  SQL_PATTERNS,
  PATH_TRAVERSAL_PATTERNS,
} from "./sanitize";

// Server-only (Node Runtime) — used before any outbound fetch.
export {
  validateOutboundUrl,
  checkUrl,
  isPrivateUrl,
  fetchSafe,
  SsrfError,
  hashOutboundUrl,
} from "./ssrf";

// Browser-only — used by client components.
export {
  getCsrfToken,
  csrfFetch,
  installCsrfInterceptor,
  CSRF_COOKIE_CLIENT,
  CSRF_HEADER_CLIENT,
} from "./client";
=======
// TurboCore — Security barrel export

export * from "./sanitize";
export * from "./csp";
export * from "./csrf";
export * from "./ssrf";
export * from "./client";
>>>>>>> ecead5e1765c9674c5c6ba0b7f23bbf8d0791ddf
