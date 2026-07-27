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

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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
  init: RequestInit = {}
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
      url = new URL(
        input,
        typeof window !== "undefined" ? window.location.href : "http://localhost"
      );
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
}
