// Turbopay rate-limit middleware — wraps `rateLimit` with IP+identifier
// keying and returns a ready-made 429 response when a request is throttled.
//
// Usage in API routes:
//   const limited = await rateLimitMiddleware(req, "login", body.identifier);
//   if (limited) return limited;
//
// Returns `null` when the request is allowed, so callers can early-return.

import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/api";
import { rateLimit, RATE_LIMITS, type RateLimitEndpoint } from "@/lib/rate-limit";

export async function rateLimitMiddleware(
  req: Request,
  endpoint: RateLimitEndpoint | string,
  identifier?: string
): Promise<NextResponse | null> {
  const config = (RATE_LIMITS as Record<string, { limit: number; windowMs: number }>)[endpoint];
  if (!config) {
    // Unknown endpoint — fail open (no rate limiting configured).
    return null;
  }

  const ip = getClientIp(req);
  const idPart = identifier ? String(identifier).trim().toLowerCase() : "";
  const key = idPart ? `${endpoint}:${ip}:${idPart}` : `${endpoint}:${ip}`;

  const result = rateLimit({
    key,
    limit: config.limit,
    windowMs: config.windowMs,
  });

  if (!result.success) {
    const retryAfterSec = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000));
    return NextResponse.json(
      {
        error: "Too many requests. Please slow down and try again shortly.",
        code: "RATE_LIMITED",
        retryAfter: retryAfterSec,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSec),
          "X-RateLimit-Limit": String(config.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": result.resetAt.toISOString(),
        },
      }
    );
  }

  // Allowed — attach informational headers via a passthrough response is
  // overkill here; callers can read remaining from the limiter if needed.
  return null;
}
