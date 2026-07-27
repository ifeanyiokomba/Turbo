// Next.js 16 security middleware (renamed from `middleware.ts`).
//
// Next.js 16 renamed the middleware entry point: the exported function is now
// `proxy` (not `middleware`). This file runs on the Edge Runtime and is
// invoked on every request that matches the `config.matcher` pattern below.
//
// Responsibilities (in execution order):
//   1. Short-circuit OPTIONS (CORS preflight) with origin-reflected headers.
//   2. Generate a per-request CSP nonce via the Web Crypto API.
//   3. Apply all 11 OWASP security headers to the response.
//   4. CSRF validation for POST/PUT/PATCH/DELETE API requests using the
//      double-submit cookie pattern (X-CSRF-Token header vs tp_csrf cookie).
//      Exempt routes: webhooks (signature auth), auth login/register, cron.
//   5. Auto-refresh the tp_csrf cookie on GET requests so the client always
//      has a valid token for its next mutating request.
//
// Edge Runtime constraints:
//   - NO Node.js `crypto`, `Buffer`, or `process` imports.
//   - Uses `globalThis.crypto.getRandomValues` (via `generateCspNonce` and
//     `generateCsrfToken` in `@/lib/security`).
//   - Uses `btoa()` for base64 encoding.
//
// Imported modules:
//   - `@/lib/security/csp`   — Edge-safe (Web Crypto + btoa only).
//   - `@/lib/security/csrf`  — Edge-safe (Web Crypto only).

import { NextResponse, type NextRequest } from "next/server";
import {
  generateCspNonce,
  buildSecurityHeaders,
  buildCorsHeaders,
  buildCorsPreflightHeaders,
} from "@/lib/security/csp";
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  generateCsrfToken,
  validateCsrfToken,
  isCsrfExempt,
} from "@/lib/security/csrf";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Allowed CORS origins. In production this should be a closed list of trusted
 * merchant domains. In dev we allow the preview origin and localhost.
 */
function getAllowedOrigins(): string[] {
  const env = (globalThis as { process?: { env?: Record<string, string> } }).process?.env ?? {};
  const raw = env.CORS_ALLOWED_ORIGINS ?? env.NEXT_PUBLIC_CORS_ALLOWED_ORIGINS ?? "";
  if (raw) return raw.split(",").map((s) => s.trim()).filter(Boolean);
  // Dev default — localhost variants for the sandbox preview.
  return ["http://localhost:3000", "http://127.0.0.1:3000"];
}

/**
 * Routes excluded from middleware entirely. These are static assets that
 * Next.js can serve without security headers (the headers would just bloat
 * the response and break some content types).
 *
 * The `config.matcher` below already excludes most of these, but we keep a
 * runtime check as a defense-in-depth.
 */
const STATIC_ASSET_PATTERN =
  /^\/(_next\/static|_next\/image|favicon\.ico|robots\.txt|sitemap\.xml|logo\.svg|public)/;

/**
 * Next.js 16 middleware config — runs on every route EXCEPT:
 *   - static asset paths under _next/static, _next/image
 *   - favicon, robots.txt, sitemap.xml, logo.svg
 *
 * The `(?!...)` negative lookaheads prevent the matcher from firing on those
 * paths, which keeps the middleware hot path lean.
 */
export const config = {
  matcher: [
    /*
     * Match all paths except:
     *   /api/* (we DO want to run on API — see note)
     *   /_next/static/*
     *   /_next/image/*
     *   /favicon.ico
     *
     * Note: We intentionally DO run on /api/* so we can apply CSRF + CORS.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|logo\\.svg).*)",
  ],
};

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Next.js 16 security middleware.
 *
 * Exported as `proxy` (NOT `middleware`) per the Next.js 16 rename.
 */
export function proxy(req: NextRequest): NextResponse {
  const { pathname, origin } = req.nextUrl;
  const method = req.method.toUpperCase();

  // Skip middleware for static assets that slipped past the matcher.
  if (STATIC_ASSET_PATTERN.test(pathname)) {
    return NextResponse.next();
  }

  const isProduction =
    (globalThis as { process?: { env?: Record<string, string> } }).process?.env?.NODE_ENV ===
    "production";
  const allowedOrigins = getAllowedOrigins();
  const requestOrigin = req.headers.get("origin");

  // -------------------------------------------------------------------------
  // 1. CORS preflight (OPTIONS) — short-circuit with 204.
  // -------------------------------------------------------------------------
  if (method === "OPTIONS") {
    const preflightHeaders = buildCorsPreflightHeaders(
      requestOrigin,
      allowedOrigins,
    );
    // If origin isn't allowed, return 403 so the browser blocks the actual
    // request before it's even sent.
    if (requestOrigin && !preflightHeaders["Access-Control-Allow-Origin"]) {
      return new NextResponse(null, {
        status: 403,
        headers: { "Content-Length": "0" },
      });
    }
    return new NextResponse(null, {
      status: 204,
      headers: preflightHeaders,
    });
  }

  // -------------------------------------------------------------------------
  // 2. Generate per-request CSP nonce.
  // -------------------------------------------------------------------------
  const nonce = generateCspNonce();
  const securityHeaders = buildSecurityHeaders(nonce, isProduction);

  // -------------------------------------------------------------------------
  // 3. CSRF validation for mutating API requests.
  // -------------------------------------------------------------------------
  const isApiRoute = pathname.startsWith("/api/");
  const isMutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

  if (isApiRoute && isMutating) {
    if (!isCsrfExempt(req)) {
      const csrfCheck = validateCsrfToken(req);
      if (!csrfCheck.ok) {
        const body = JSON.stringify({
          error: "CSRF validation failed",
          code: "CSRF_INVALID",
          reason: csrfCheck.reason,
        });
        return new NextResponse(body, {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            ...securityHeaders,
            ...buildCorsHeaders(requestOrigin, allowedOrigins),
          },
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. Build the response — clone request headers, inject security headers.
  // -------------------------------------------------------------------------
  const requestHeaders = new Headers(req.headers);
  // Expose the nonce to server components / pages via a request header so
  // they can render <Script nonce={...}> if needed.
  requestHeaders.set("x-csp-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Apply all OWASP security headers.
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }

  // Apply CORS headers (only if the origin is allowed).
  const corsHeaders = buildCorsHeaders(requestOrigin, allowedOrigins);
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }

  // -------------------------------------------------------------------------
  // 5. Auto-set / refresh the tp_csrf cookie on safe (GET/HEAD) requests.
  // -------------------------------------------------------------------------
  // Only set the CSRF cookie on same-origin requests — never leak it cross-
  // origin even if CORS would otherwise allow it.
  const isSameOrigin = !requestOrigin || requestOrigin === origin;
  if (isSameOrigin && (method === "GET" || method === "HEAD")) {
    const csrfToken = generateCsrfToken();
    response.cookies.set({
      name: CSRF_COOKIE,
      value: csrfToken,
      httpOnly: false, // MUST be readable by client JS (double-submit pattern).
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours — refreshed on every safe request.
    });
    // Also expose the header name to the client for discoverability.
    response.headers.set("x-csrf-header", CSRF_HEADER);
  }

  return response;
}

// Backwards-compat: some Next.js tooling still looks for a `middleware`
// export. Aliasing it doesn't change behavior — Next.js 16 only honors
// `proxy`. This is purely defensive.
export { proxy as middleware };
