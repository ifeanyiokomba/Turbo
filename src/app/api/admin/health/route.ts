// Turbopay admin — aggregated provider health dashboard
//
// GET: for every ProviderConfig, return:
//   - current healthScore (EMA from registry.getHealth)
//   - circuit breaker state (CLOSED | OPEN | HALF_OPEN) from registry.getBreakerStates
//   - last 10 ProviderHealthCheck samples (ok, latencyMs, errorCode, sampledAt)
//   - derived success rate over the last 10 samples
//   - avg latency over the last 10 samples

import { db } from "@/lib/db";
import { json, handleError } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";
import { getBreakerStates, registry } from "@/lib/turbocore/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePermission(Permissions.PROVIDERS_HEALTH);
    const configs = await db.providerConfig.findMany({ orderBy: { code: "asc" } });
    const breakers = getBreakerStates();

    const perProvider = await Promise.all(
      configs.map(async (p) => {
        const samples = await db.providerHealthCheck.findMany({
          where: { providerCode: p.code },
          orderBy: { sampledAt: "desc" },
          take: 10,
        });
        const health = registry.getHealth(p.code);
        const breaker = breakers[p.code] ?? { state: "CLOSED", failures: 0, score: 100 };
        const okCount = samples.filter((s) => s.ok).length;
        const successRate = samples.length > 0 ? (okCount / samples.length) * 100 : 100;
        const avgLatency =
          samples.length > 0
            ? Math.round(samples.reduce((acc, s) => acc + s.latencyMs, 0) / samples.length)
            : 0;
        return {
          code: p.code,
          displayName: p.displayName,
          enabled: p.enabled,
          sandbox: p.sandbox,
          healthScore: health.score,
          healthUpdatedAt: new Date(health.lastUpdated).toISOString(),
          circuitState: breaker.state,
          circuitFailures: breaker.failures,
          successRate: Math.round(successRate * 10) / 10,
          avgLatencyMs: avgLatency,
          sampleCount: samples.length,
          samples: samples.map((s) => ({
            id: s.id,
            ok: s.ok,
            latencyMs: s.latencyMs,
            errorCode: s.errorCode,
            healthScore: s.healthScore,
            sampledAt: s.sampledAt,
          })),
        };
      }),
    );

    return json({ providers: perProvider, generatedAt: new Date().toISOString() });
  } catch (e) {
    return handleError(e);
  }
}
