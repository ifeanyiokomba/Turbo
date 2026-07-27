// TurboCore — CSRF Protection
//
// Cross-Site Request Forgery (CSRF) attacks trick a user's browser into
// making state-changing requests (POST/PUT/DELETE) to TurboCore while the
// user is authenticated. The browser automatically attaches cookies, so the
// request appears legitimate.
//
// Defense: Double-Submit Cookie pattern
//   1. On every GET request, the server sets a `tp_csrf` cookie with a
//      cryptographically random token.
//   2. On every state-changing request (POST/PUT/DELETE), the client must
//      include the same token in the `X-CSRF-Token` header.
//   3. The server compares the header token to the cookie token — if they
//      match, the request is legitimate.
//
// This works because:
//   - An attacker's site can SET cookies (via <img> tags etc.) but cannot
//     READ cookies from another origin (Same-Origin Policy).
//   - An attacker can't read the `tp_csrf` cookie, so can't include it in
//     the X-CSRF-Token header.
//
// Additionally, SameSite=lax on the session cookie blocks most CSRF vectors
// in modern browsers. This is defense in depth.
//
// IMPORTANT: This module is used in the Edge Runtime middleware, so it must
// NOT import Node.js built-ins like "crypto". It uses the Web Crypto API
// instead (available in both Edge and Node.js runtimes).

/**
 * Generates a cryptographically random CSRF token.
 * Uses Web Crypto API (Edge Runtime compatible).
 * 32 bytes = 256 bits = hex-encoded to 64 chars.
 */
export function generateCsrfToken(): string {
  const bytes = new Uint8Array(32);
  if (typeof globalThis !== "undefined" && globalThis.crypto) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Fallback for very old environments
    for (let i = 0; i < 32; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time string comparison to prevent timing attacks.
 * Uses a simple XOR-based approach that works in Edge Runtime.
 */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Validates that a request's CSRF token matches the cookie.
 *
 * @param req The incoming request
 * @returns true if the token is valid, false otherwise
 */
export function validateCsrfToken(req: Request): boolean {
  // Only validate state-changing methods
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return true;
  }

  // Get token from header
  const headerToken = req.headers.get("x-csrf-token") ?? "";

  // Get token from cookie
  const cookieHeader = req.headers.get("cookie") ?? "";
  const cookieToken = parseCookie(cookieHeader, "tp_csrf");

  if (!headerToken || !cookieToken) {
    return false;
  }

  return safeCompare(headerToken, cookieToken);
}

/**
 * Parses a specific cookie value from the Cookie header.
 */
function parseCookie(cookieHeader: string, name: string): string {
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    const [key, ...valueParts] = cookie.split("=");
    if (key === name) {
      return decodeURIComponent(valueParts.join("="));
    }
  }
  return "";
}

/**
 * Sets the CSRF cookie on a response.
 */
export function setCsrfCookie(token: string): Record<string, string> {
  return {
    "Set-Cookie": `tp_csrf=${token}; Path=/; HttpOnly=false; SameSite=Lax; Max-Age=86400${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  };
}
