// Turbopay middleware — security headers + CORS + CSRF protection.
//
// This middleware runs on every request and applies:
//   1. Strict Content-Security-Policy (nonce-based in production)
//   2. CORS preflight handling (OPTIONS) with origin reflection
//   3. All OWASP-recommended security headers (HSTS, X-Frame-Options, etc.)
//   4. CSRF token cookie injection (double-submit pattern)
//
// Security headers are applied to ALL routes (pages + API). CORS is
// API-only. CSRF token is set on all GET responses so the client can
// read it from the cookie and include it in the X-CSRF-Token header on
// subsequent POST/PUT/DELETE requests.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { generateCspNonce, buildSecurityHeaders, buildCorsHeaders } from "@/lib/security/csp";
import { generateCsrfToken, validateCsrfToken } from "@/lib/security/csrf";

function getAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS || "http://localhost:3000";
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

// State-changing methods that require CSRF validation
const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin");
  const allowedOrigins = getAllowedOrigins();
  const isApiRoute = req.nextUrl.pathname.startsWith("/api");

  // --- CORS preflight (OPTIONS) ---
  if (req.method === "OPTIONS" && isApiRoute) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        ...buildCorsHeaders(origin, allowedOrigins),
        ...buildSecurityHeaders(),
      },
    });
  }

  // --- Generate CSP nonce for this request ---
  const nonce = generateCspNonce();
  const securityHeaders = buildSecurityHeaders(nonce);

  // --- CSRF validation for state-changing API requests ---
  // Skip CSRF for:
  //   - Non-API routes (pages don't need CSRF — they're GET)
  //   - Webhook routes (they use signature-based auth, not cookies)
  //   - Auth login/register (CSRF token not yet set)
  //   - Cron routes (use cron-lock, not cookie auth)
  const pathname = req.nextUrl.pathname;
  const isWebhook = pathname.startsWith("/api/webhooks/");
  const isAuthEndpoint =
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/register") ||
    pathname.startsWith("/api/auth/google");
  const isCronEndpoint = pathname.startsWith("/api/cron/");
  const isHealthEndpoint = pathname === "/api/health" || pathname === "/api/route";

  if (
    isApiRoute &&
    STATE_CHANGING.has(req.method) &&
    !isWebhook &&
    !isAuthEndpoint &&
    !isCronEndpoint &&
    !isHealthEndpoint
  ) {
    if (!validateCsrfToken(req)) {
      return new NextResponse(JSON.stringify({ error: "CSRF token validation failed" }), {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          ...securityHeaders,
        },
      });
    }
  }

  // --- Build response with all security headers ---
  const res = NextResponse.next({
    request: {
      headers: new Headers(req.headers),
    },
  });

  // Apply security headers to every response
  for (const [key, value] of Object.entries(securityHeaders)) {
    res.headers.set(key, value);
  }

  // Attach the nonce to the request so server components can use it
  res.headers.set("x-nonce", nonce);

  // CORS for API routes
  if (isApiRoute) {
    const corsHeaders = buildCorsHeaders(origin, allowedOrigins);
    for (const [key, value] of Object.entries(corsHeaders)) {
      res.headers.set(key, value);
    }
  }

  // --- Set CSRF cookie on GET requests (if not already present) ---
  if (req.method === "GET") {
    const cookieHeader = req.headers.get("cookie") ?? "";
    const hasCsrfCookie = cookieHeader.includes("tp_csrf=");
    if (!hasCsrfCookie) {
      const csrfToken = generateCsrfToken();
      const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
      res.headers.append(
        "Set-Cookie",
        `tp_csrf=${csrfToken}; Path=/; SameSite=Lax; Max-Age=86400${secure}`
      );
    }
  }

  return res;
}

export const config = {
  // Run on all routes except static assets
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)$).*)",
  ],
};
