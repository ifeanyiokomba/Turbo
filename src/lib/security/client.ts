<<<<<<< HEAD
// Client-side CSRF helper.
//
// This module runs ONLY in the browser. It provides:
//
//   1. getCsrfToken()       — reads the `tp_csrf` cookie set by `proxy.ts`.
//   2. csrfFetch(input, init) — drop-in fetch() replacement that auto-injects
//                               the X-CSRF-Token header on mutating requests.
//   3. installCsrfInterceptor() — monkey-patches window.fetch ONCE so every
//                               same-origin POST/PUT/PATCH/DELETE carries the
//                               CSRF token automatically. Idempotent and
//                               only intercepts same-origin requests.
//
// The cookie is HttpOnly-disabled so client JS can read it. The server
// compares the header against the cookie using a constant-time compare (see
// `csrf.ts`).
//
// IMPORTANT: This file is imported by client components. It must NOT import
// any Node-only modules. Keep all references to `document`, `window`, and
// `fetch` guarded by `typeof` checks so SSR doesn't blow up.

export const CSRF_COOKIE_CLIENT = "tp_csrf";
export const CSRF_HEADER_CLIENT = "X-CSRF-Token";

const MUTATING_METHODS = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

/**
 * Read the CSRF token from document.cookie.
 *
 * Returns an empty string if the cookie is missing (e.g. on first page load
 * before `proxy.ts` has had a chance to set it). Callers should treat an
 * empty token as "let the request go through and let the server reject it"
 * — the server will return 403, at which point the caller can refresh.
 */
export function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const cookies = document.cookie ? document.cookie.split(";") : [];
  for (const raw of cookies) {
    const eq = raw.indexOf("=");
    if (eq < 0) continue;
    const name = raw.slice(0, eq).trim();
    if (name === CSRF_COOKIE_CLIENT) {
      try {
        return decodeURIComponent(raw.slice(eq + 1).trim());
      } catch {
        return raw.slice(eq + 1).trim();
      }
    }
  }
  return "";
}

/**
 * Determine if a URL is same-origin with the current document.
 *
 * Used by `installCsrfInterceptor` to avoid leaking CSRF tokens to
 * third-party origins (which would be pointless anyway since the cookie
 * won't be sent).
 */
function isSameOrigin(input: string | URL): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = typeof input === "string" ? new URL(input, window.location.href) : input;
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}

/** Normalize the request method to uppercase for matching. */
function normalizeMethod(init: RequestInit | undefined): string {
  const method = init?.method ?? "GET";
  return String(method).toUpperCase();
}

/**
 * Drop-in `fetch` replacement that auto-injects the X-CSRF-Token header on
 * same-origin mutating requests.
 *
 *   - Reads the token from the `tp_csrf` cookie.
 *   - Only adds the header for POST/PUT/PATCH/DELETE.
 *   - Only adds the header for same-origin requests (avoids leaking the
 *     token to third parties).
 *   - If the caller has already set X-CSRF-Token, it is preserved.
 */
export async function csrfFetch(
  input: string | URL | Request,
  init: RequestInit = {},
): Promise<Response> {
  const method = normalizeMethod(init);

  // Only mutating requests need CSRF.
  if (!MUTATING_METHODS.has(method)) {
    return fetch(input as RequestInfo, init);
  }

  // Resolve URL for same-origin check. `input` may be a Request or a string.
  let url: URL | null = null;
  try {
    if (typeof input === "string") {
      url = new URL(input, typeof window !== "undefined" ? window.location.href : "http://localhost");
    } else if (input instanceof URL) {
      url = input;
    } else if (typeof Request !== "undefined" && input instanceof Request) {
      url = new URL(input.url);
    }
  } catch {
    url = null;
  }

  // Cross-origin — skip token injection (cookie wouldn't be sent anyway).
  if (!url || !isSameOrigin(url)) {
    return fetch(input as RequestInfo, init);
  }

  const headers = new Headers(init.headers ?? undefined);
  // Don't overwrite a caller-provided token.
  if (!headers.has(CSRF_HEADER_CLIENT)) {
    const token = getCsrfToken();
    if (token) headers.set(CSRF_HEADER_CLIENT, token);
  }
  return fetch(input as RequestInfo, { ...init, headers });
}

// ---------------------------------------------------------------------------
// Global fetch interceptor (monkey-patch)
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    __tpCsrfInterceptorInstalled?: boolean;
  }
}

/**
 * Monkey-patch `window.fetch` ONCE so that every same-origin mutating request
 * automatically carries the X-CSRF-Token header.
 *
 * Properties:
 *   - Idempotent — checks `window.__tpCsrfInterceptorInstalled` and returns
 *     early on the second call.
 *   - Same-origin only — never injects the token into cross-origin requests.
 *   - Preserves caller-provided tokens — if the caller explicitly sets
 *     X-CSRF-Token, the interceptor leaves it alone.
 *   - No-op in non-browser environments (SSR).
 *
 * Call this from a top-level client component's `useEffect` (e.g. the root
 * `<Providers>` component) so the patch is installed before any app code
 * issues a mutating fetch.
 */
export function installCsrfInterceptor(): void {
  // SSR / non-browser guard.
  if (typeof window === "undefined") return;
  if (typeof window.fetch !== "function") return;

  // Idempotency guard.
  if (window.__tpCsrfInterceptorInstalled) return;
  window.__tpCsrfInterceptorInstalled = true;

  const originalFetch = window.fetch.bind(window);

  const patchedFetch: typeof fetch = async (input, init) => {
    const method = normalizeMethod(init);

    // Only mutating requests need CSRF.
    if (!MUTATING_METHODS.has(method)) {
      return originalFetch(input, init);
    }

    // Resolve URL for same-origin check.
    let url: URL | null = null;
    try {
      if (typeof input === "string") {
        url = new URL(input, window.location.href);
      } else if (input instanceof URL) {
        url = input;
      } else if (typeof Request !== "undefined" && input instanceof Request) {
        url = new URL(input.url);
      }
    } catch {
      url = null;
    }

    // Cross-origin — skip token injection.
    if (!url || !isSameOrigin(url)) {
      return originalFetch(input, init);
    }

    // Build merged headers. Preserve any caller-provided X-CSRF-Token.
    const headers = new Headers(init?.headers ?? undefined);
    if (!headers.has(CSRF_HEADER_CLIENT)) {
      const token = getCsrfToken();
      if (token) headers.set(CSRF_HEADER_CLIENT, token);
    }

    return originalFetch(input, { ...(init ?? {}), headers });
  };

  // Preserve static props if any.
  Object.assign(patchedFetch, originalFetch);
  window.fetch = patchedFetch;
=======
// TurboCore — Client-side CSRF Token Helper
//
// The proxy.ts middleware validates CSRF tokens on all POST/PUT/DELETE API
// requests (double-submit cookie pattern). The `tp_csrf` cookie is set on
// every GET response and is readable by JavaScript (not HttpOnly).
//
// This module provides:
//   1. getCsrfToken() — reads the tp_csrf cookie from document.cookie
//   2. csrfFetch() — drop-in replacement for fetch() that auto-injects
//      the X-CSRF-Token header on state-changing requests
//   3. installCsrfInterceptor() — monkey-patches window.fetch ONCE so that
//      ALL existing fetch() calls across the app automatically include the
//      CSRF token without needing to rewrite every call site.
//
// Usage:
//   import { installCsrfInterceptor } from "@/lib/security/client";
//   // Call once at app startup (e.g., in a layout effect):
//   installCsrfInterceptor();
//
// After that, every fetch("POST /api/...") automatically includes the token.

/**
 * Reads the tp_csrf cookie value from document.cookie.
 * Returns null if not found (e.g., on first page load before any GET).
 */
export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)tp_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Drop-in replacement for fetch() that auto-injects the X-CSRF-Token header
 * on POST/PUT/PATCH/DELETE requests.
 *
 * For GET/HEAD/OPTIONS requests, behaves identically to fetch().
 */
export function csrfFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const isStateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

  if (!isStateChanging) {
    return fetch(input as RequestInfo | URL, init);
  }

  const token = getCsrfToken();
  if (!token) {
    // No CSRF token available — proceed without it. The server will reject
    // with 403, which is the correct security behavior. The caller can
    // handle the error (e.g., redirect to refresh the page).
    return fetch(input as RequestInfo | URL, init);
  }

  // Merge the CSRF header into existing headers
  const existingHeaders =
    init?.headers instanceof Headers
      ? Object.fromEntries(init.headers.entries())
      : ((init?.headers as Record<string, string>) ?? {});

  return fetch(input as RequestInfo | URL, {
    ...init,
    headers: {
      ...existingHeaders,
      "X-CSRF-Token": token,
    },
  });
}

/**
 * Installs a global fetch interceptor that automatically adds the X-CSRF-Token
 * header to all same-origin POST/PUT/PATCH/DELETE requests.
 *
 * This is called ONCE at app startup (in a client component's useEffect).
 * After installation, every existing fetch() call across the app automatically
 * includes the CSRF token — no need to rewrite call sites.
 *
 * Safety:
 *   - Only intercepts same-origin requests (relative URLs or matching origin)
 *   - Only adds the header for state-changing methods
 *   - Idempotent — safe to call multiple times (guards against double-install)
 *   - Preserves any caller-provided X-CSRF-Token header
 */
let interceptorInstalled = false;

export function installCsrfInterceptor(): void {
  if (typeof window === "undefined") return; // SSR guard
  if (interceptorInstalled) return; // idempotent
  if (typeof window.fetch !== "function") return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const isStateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

    if (!isStateChanging) {
      return originalFetch(input, init);
    }

    // Only intercept same-origin requests (relative URLs or matching origin)
    let url: string;
    if (typeof input === "string") {
      url = input;
    } else if (input instanceof URL) {
      url = input.toString();
    } else if (input instanceof Request) {
      url = input.url;
    } else {
      url = String(input);
    }

    const isSameOrigin =
      url.startsWith("/") || url.startsWith(window.location.origin) || !url.match(/^https?:\/\//);

    if (!isSameOrigin) {
      // Cross-origin request — don't inject CSRF token
      return originalFetch(input, init);
    }

    // Check if caller already provided the token
    const existingHeaders =
      init?.headers instanceof Headers
        ? Object.fromEntries(init.headers.entries())
        : input instanceof Request
          ? Object.fromEntries(input.headers.entries())
          : ((init?.headers as Record<string, string>) ?? {});

    if (existingHeaders["X-CSRF-Token"] || existingHeaders["x-csrf-token"]) {
      // Caller already set the token — respect it
      return originalFetch(input, init);
    }

    const token = getCsrfToken();
    if (!token) {
      return originalFetch(input, init);
    }

    return originalFetch(input, {
      ...init,
      headers: {
        ...existingHeaders,
        "X-CSRF-Token": token,
      },
    });
  }) as typeof window.fetch;

  interceptorInstalled = true;
>>>>>>> ecead5e1765c9674c5c6ba0b7f23bbf8d0791ddf
}
