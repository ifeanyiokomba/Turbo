// Turbopay client-side error reporter.
// Acts as a fallback for when NEXT_PUBLIC_SENTRY_DSN is not configured — the
// client can POST uncaught errors here so they at least land in the audit log
// and server console.

import { NextRequest } from "next/server";
import { json, errorJson, handleError, audit, getClientIp, getUserAgent } from "@/lib/api";
import { getSession } from "@/lib/session";
import { z } from "zod";

const schema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  level: z.enum(["error", "warning", "info", "fatal"]).default("error"),
  url: z.string().max(500).optional(),
  userAgent: z.string().max(500).optional(),
  tags: z.record(z.string(), z.string()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return errorJson("Invalid JSON body", 400);

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return errorJson(parsed.error.issues[0]?.message ?? "Invalid payload", 400);
    }

    const { message, stack, level, url, tags } = parsed.data;
    const ip = getClientIp(req);
    const ua = getUserAgent(req);

    // Best-effort user identification (optional — endpoint is unauthenticated
    // so anonymous client errors still report).
    let userId: string | undefined;
    try {
      const session = await getSession();
      if (session?.user) userId = session.user.id;
    } catch {
      // ignore — anonymous report
    }

    const severity = level === "fatal" ? "CRITICAL" : level === "warning" ? "WARN" : "ERROR";

    console.error(`[client-error] ${level.toUpperCase()} ${message}`, {
      url,
      userId,
      ip,
      ua,
      stack,
      tags,
    });

    // Persist to audit log so admins can see client-side errors in the same
    // stream as server events.
    await audit({
      userId,
      action: "CLIENT_ERROR",
      category: "ERROR",
      severity,
      ip,
      userAgent: ua,
      metadata: { message, stack: stack?.slice(0, 4000), url, level, tags },
    });

    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
