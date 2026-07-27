// Turbopay instrumentation hook — runs on cold start in Node.js + edge runtimes.
// Used to initialise Sentry on the server and edge runtimes. The client config
// is auto-loaded by `withSentryConfig` during build, so it does NOT need to be
// imported here.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
