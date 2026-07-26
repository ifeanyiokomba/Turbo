// Turbopay edge-runtime Sentry init.
// Loaded by instrumentation.ts `register()` when NEXT_RUNTIME === "edge".

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.SENTRY_DSN;

if (SENTRY_DSN && SENTRY_DSN.length > 0) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV,
    ignoreErrors: [
      "UNAUTHENTICATED",
      "ACCOUNT_INACTIVE",
      "FORBIDDEN",
      "ServiceError",
    ],
  });
}
