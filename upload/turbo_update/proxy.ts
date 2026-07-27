// Turbopay middleware — handles CORS preflight (OPTIONS) for /api/* routes.
//
// Next.js does not auto-respond to OPTIONS, so we intercept them here and
// return 204 with the proper CORS headers. We also reflect the request's
// Origin header when it matches an entry in ALLOWED_ORIGINS so that
// multi-origin deployments work correctly.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function getAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS || "http://localhost:3000";
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = getAllowedOrigins();
  const allowOrigin =
    origin && allowed.includes(origin) ? origin : allowed[0] || "http://localhost:3000";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Idempotency-Key",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: buildCorsHeaders(origin),
    });
  }

  // For non-preflight requests we still want CORS headers present, but
  // NextResponse.next() preserves the headers() config in next.config.ts
  // so we don't need to re-attach them here. We do attach the dynamic
  // Access-Control-Allow-Origin so multi-origin setups reflect correctly.
  const res = NextResponse.next();
  const allowed = getAllowedOrigins();
  if (origin && allowed.includes(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
  }
  return res;
}

export const config = {
  // Run on all /api routes only — don't intercept static assets or pages.
  matcher: "/api/:path*",
};
