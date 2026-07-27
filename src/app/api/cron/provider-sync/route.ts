import { NextRequest } from "next/server";
import { json, handleError } from "@/lib/api";
import { syncAllProviders } from "@/lib/turbocore/sync-engine";
import { withCronLock } from "@/lib/turbocore/cron-lock";

export async function POST(req: NextRequest) {
  try {
    const secret =
      process.env.CRON_SECRET ?? (process.env.NODE_ENV === "production" ? null : "dev-cron-secret");
    if (!secret || req.headers.get("x-cron-secret") !== secret) {
      return json({ error: "Unauthorized" }, 401);
    }
    const result = await withCronLock("provider-sync", () => syncAllProviders());
    return json(result);
  } catch (e) {
    return handleError(e);
  }
}
