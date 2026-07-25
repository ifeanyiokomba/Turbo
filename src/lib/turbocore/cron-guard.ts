// TurboCore — shared cron route guards.
//
// Every cron route uses the same x-cron-secret header check + CronLock by
// key, so the boilerplate lives here. Routes import `guardCron` and call
// `withCronLock(key, () => work)`.

import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Returns 401 response if the request is not a valid cron invocation. */
export function guardCron(req: Request): Response | null {
  const secret =
    process.env.CRON_SECRET ??
    (process.env.NODE_ENV === "production" ? null : "dev-cron-secret");
  const headerSecret = req.headers.get("x-cron-secret");
  if (!secret || !headerSecret || headerSecret !== secret) {
    return json({ error: "Unauthorized" }, 401);
  }
  return null;
}
