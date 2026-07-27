import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// CORS origins — comma-separated list in env, defaults to localhost dev origin.
const allowedOrigins = process.env.ALLOWED_ORIGINS || "http://localhost:3000";
const allowedOriginList = allowedOrigins
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// Single origin to echo back when CORS_ALLOW_ORIGIN is set in static headers.
// For multi-origin we fall back to the first configured origin in headers()
// (browsers require a single value here); the runtime middleware in
// src/middleware.ts handles per-request reflection for OPTIONS preflight.
const primaryAllowedOrigin = allowedOriginList[0] || "http://localhost:3000";

// Content-Security-Policy: relaxed enough for dev (unsafe-inline + eval) but
// strict enough to defeat the most common injection vectors. Tighten the
// script-src directive in production.
const CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https:; " +
  "font-src 'self' data:; " +
  "connect-src 'self' https:; " +
  "frame-ancestors 'none'";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

const corsHeaders = [
  { key: "Access-Control-Allow-Origin", value: primaryAllowedOrigin },
  {
    key: "Access-Control-Allow-Methods",
    value: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  },
  {
    key: "Access-Control-Allow-Headers",
    value: "Content-Type, Authorization, X-Idempotency-Key",
  },
  { key: "Access-Control-Max-Age", value: "86400" },
  { key: "Access-Control-Allow-Credentials", value: "true" },
  { key: "Vary", value: "Origin" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async headers() {
    return [
      {
        // Security headers apply to every route.
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // CORS headers added on top for API routes.
        source: "/api/:path*",
        headers: [...securityHeaders, ...corsHeaders],
      },
    ];
  },
};

// withSentryConfig is a no-op at runtime when SENTRY_AUTH_TOKEN is unset
// (silent: true). It only kicks in during `next build` for source-map upload
// and tree-shaking. Safe to wrap in dev — dev uses Turbopack which ignores
// the Sentry webpack plugins.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.SENTRY_AUTH_TOKEN,
  // Hide source maps after upload (no .map files served to clients).
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  disableLogger: true,
  // Skip the Sentry webpack plugin entirely when there's no auth token —
  // avoids noisy "auth token missing" warnings during local dev.
  disableSentryWebpackConfig: !process.env.SENTRY_AUTH_TOKEN,
});
