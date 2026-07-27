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
}
