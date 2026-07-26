// Turbopay admin — provider config management
//
// GET  : list all ProviderConfig rows joined with health score, circuit breaker
//        state (from registry.getBreakerStates()) and per-provider capability count.
// POST : create or update a ProviderConfig {code, displayName, sandbox, enabled,
//        defaultPriority}. Upsert semantics — if a config with the given code exists,
//        we update its mutable fields; otherwise we create a new row.

import { db } from "@/lib/db";
import { json, handleError, audit, getClientIp } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";
import { getBreakerStates, registry } from "@/lib/turbocore/registry";
import { invalidateCapabilityCache } from "@/lib/turbocore/routing-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePermission(Permissions.PROVIDERS_VIEW);
    const [configs, breakerStates, capCounts] = await Promise.all([
      db.providerConfig.findMany({ orderBy: { code: "asc" } }),
      Promise.resolve(getBreakerStates()),
      db.providerCapability.groupBy({
        by: ["providerCode"],
        _count: { _all: true },
      }),
    ]);
    const capMap = new Map<string, number>();
    for (const r of capCounts) capMap.set(r.providerCode, r._count._all);
    return json({
      providers: configs.map((p) => {
        const breaker = breakerStates[p.code] ?? { state: "CLOSED", failures: 0, score: 100 };
        const health = registry.getHealth(p.code);
        return {
          id: p.code,
          code: p.code,
          displayName: p.displayName,
          sandbox: p.sandbox,
          enabled: p.enabled,
          weightsJSON: p.weightsJSON,
          defaultPriority: p.defaultPriority,
          website: p.website,
          logoUrl: p.logoUrl,
          healthScore: health.score,
          healthUpdatedAt: new Date(health.lastUpdated).toISOString(),
          circuitState: breaker.state,
          circuitFailures: breaker.failures,
          capabilityCount: capMap.get(p.code) ?? 0,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        };
      }),
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requirePermission(Permissions.PROVIDERS_MANAGE);
    const body = await req.json().catch(() => ({}));
    const code = String(body.code ?? "").trim().toLowerCase();
    const displayName = String(body.displayName ?? "").trim();
    if (!code || !displayName) {
      return json({ error: "code and displayName are required" }, 400);
    }
    const sandbox = Boolean(body.sandbox ?? true);
    const enabled = Boolean(body.enabled ?? true);
    const defaultPriority = Math.max(0, Math.min(100, Number(body.defaultPriority ?? 50) || 50));
    const weightsJSON = body.weightsJSON ? String(body.weightsJSON) : "{}";

    const created = await db.providerConfig.upsert({
      where: { code },
      create: {
        code,
        displayName,
        sandbox,
        enabled,
        defaultPriority,
        weightsJSON,
        website: body.website ? String(body.website) : null,
        logoUrl: body.logoUrl ? String(body.logoUrl) : null,
      },
      update: {
        displayName,
        sandbox,
        enabled,
        defaultPriority,
        weightsJSON,
        website: body.website ? String(body.website) : null,
        logoUrl: body.logoUrl ? String(body.logoUrl) : null,
      },
    });
    invalidateCapabilityCache();
    await audit({
      userId: user.id,
      action: "ADMIN_PROVIDER_UPSERT",
      category: "ADMIN",
      severity: "WARN",
      ip: getClientIp(req),
      metadata: { code, displayName, sandbox, enabled, defaultPriority },
    });
    return json({ provider: created }, 201);
  } catch (e) {
    return handleError(e);
  }
}
