// Turbopay — Public health check endpoint
//
// GET /api/health
//   Public (no auth). Returns service status, version, uptime, and DB connectivity.
//   - 200 OK   when DB reachable
//   - 503      when DB unreachable (so load balancers / Docker healthcheck can
//              pull the instance out of rotation)
//
// Used by:
//   - Dockerfile HEALTHCHECK (wget spider)
//   - docker-compose health probe
//   - Kubernetes / external load balancer liveness probes
//   - Uptime monitors (Pingdom, Better Stack, etc.)

import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Process start time — used to compute uptime on every request.
const startedAt = Date.now();

// Read app version from package.json once (works in dev + standalone build).
const APP_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
})();

export async function GET() {
  let dbStatus: "connected" | "error" = "error";

  try {
    // Lightweight query — counts the User table (cheap on Postgres + SQLite).
    await db.user.count();
    dbStatus = "connected";
  } catch (e) {
    console.error(
      "[health] DB check failed:",
      e instanceof Error ? e.message : e,
    );
  }

  const healthy = dbStatus === "connected";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "error",
      timestamp: new Date().toISOString(),
      version: APP_VERSION,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      db: dbStatus,
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    },
  );
}
