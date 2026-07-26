// Turbopay client-side Sentry init.
// Loaded automatically by `withSentryConfig` during build. In dev without a
// DSN, this is a no-op so the app keeps working.

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN && SENTRY_DSN.length > 0) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,
    environment: process.env.NODE_ENV,
    integrations: [
      // Session Replay — masks text + blocks media to avoid leaking PII.
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    // Don't capture discarded auth errors as crashes.
    ignoreErrors: [
      "NEXT_NOT_FOUND",
      "NEXT_REDIRECT",
      "UNAUTHENTICATED",
      "ACCOUNT_INACTIVE",
      "FORBIDDEN",
    ],
  });

  // Best-effort user context injection. The auth route can later call
  // Sentry.setUser() once it knows the logged-in user; here we just expose
  // the SDK on window for any client-side hooks to call.
  if (typeof window !== "undefined") {
    (window as unknown as { __SENTRY_READY__?: boolean }).__SENTRY_READY__ = true;
  }
}

// Public helper for client-side code to attach user context after login.
export function setSentryUser(user: { id: string; username?: string; email?: string } | null) {
  if (!SENTRY_DSN) return;
  if (user) {
    Sentry.setUser({ id: user.id, username: user.username, email: user.email });
  } else {
    Sentry.setUser(null);
  }
}
