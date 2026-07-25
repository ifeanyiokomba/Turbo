// Turbopay cron — provider health flush.
//
// Reads the in-memory circuit breaker states + EMA health scores from the
// TurboCore registry (getBreakerStates()) and persists one ProviderHealthCheck
// row per known provider. This gives the admin console a historical record
// of provider health trends (the registry only keeps the latest score
// in-memory; rows here feed the time-series charts in /admin/health).
//
// Protection: x-cron-secret + CronLock("health-flush").

import { db } from "@/lib/db";
import { json, handleError } from "@/lib/api";
import { guardCron } from "@/lib/turbocore/cron-guard";
import { withCronLock } from "@/lib/turbocore/cron-lock";
import { getBreakerStates, registry } from "@/lib/turbocore/registry";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const guard = guardCron(req);
    if (guard) return guard;

    const result = await withCronLock("health-flush", async () => {
      const startedAt = new Date().toISOString();
      console.log(`[cron:health-flush] start at ${startedAt}`);

      const states = getBreakerStates();
      const providerCodes = Array.from(new Set([
        ...Object.keys(states),
        // Also flush any provider that's been registered but has no
        // breaker state yet (no traffic recorded yet).
        ...registry.listAll().map((r) => r.providerCode),
      ]));

      let flushed = 0;
      for (const code of providerCodes) {
        const s = states[code];
        const score = s?.score ?? registry.getHealth(code).score;
        const breakerState = s?.state ?? "CLOSED";
        // A provider is "ok" if its breaker isn't open and the score is
        // >= 30 (matches routing-engine's health filter).
        const ok = breakerState !== "OPEN" && score >= 30;
        try {
          await db.providerHealthCheck.create({
            data: {
              providerCode: code,
              ok,
              latencyMs: 0, // not tracked at flush time — recorded per-call by the proxy
              errorCode: ok ? null : (breakerState === "OPEN" ? "PROVIDER_DOWN" : "LOW_HEALTH"),
              healthScore: score,
            },
          });
          flushed += 1;
        } catch (e) {
          console.warn(`[cron:health-flush] flush failed for ${code}:`, e instanceof Error ? e.message : e);
        }
      }

      const finishedAt = new Date().toISOString();
      console.log(
        `[cron:health-flush] done at ${finishedAt} — flushed=${flushed} of ${providerCodes.length} providers`,
      );
      return { flushed, providers: providerCodes.length, startedAt, finishedAt };
    });

    return json(result ?? { flushed: 0, skipped: true });
  } catch (e) {
    return handleError(e);
  }
}
