// Turbopay admin — config version history (audit trail + rollback)
//
// GET  : list ConfigVersion rows ordered newest-first. Optional `?scope=` filter.
// POST {scope, snapshotJSON, reason}
//        Snapshots the current config for the given scope. Auto-increments version.
//        `scope` ∈ PROVIDERS | FX | FEES | CAPABILITIES.
//        If `snapshotJSON` is omitted, we snapshot the relevant tables live.

import { db } from "@/lib/db";
import { json, handleError, audit, getClientIp } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

const SCOPES = new Set([
  "PROVIDERS",
  "FX",
  "FEES",
  "CAPABILITIES",
  "ROUTING",
  "FEATURE_FLAGS",
  "WEBHOOKS",
]);

async function captureSnapshot(scope: string): Promise<string> {
  switch (scope) {
    case "PROVIDERS": {
      const rows = await db.providerConfig.findMany({ orderBy: { code: "asc" } });
      return JSON.stringify(rows);
    }
    case "CAPABILITIES": {
      const rows = await db.providerCapability.findMany({
        orderBy: [{ contract: "asc" }, { providerCode: "asc" }],
      });
      return JSON.stringify(rows);
    }
    case "ROUTING": {
      const rows = await db.providerRoute.findMany({ orderBy: { contract: "asc" } });
      return JSON.stringify(rows);
    }
    case "FX": {
      const rows = await db.fxConfig.findMany({});
      return JSON.stringify(rows);
    }
    case "FEATURE_FLAGS": {
      const [flags, overrides] = await Promise.all([
        db.featureFlag.findMany({ orderBy: { key: "asc" } }),
        db.featureFlagOverride.findMany({ orderBy: { flagKey: "asc" } }),
      ]);
      return JSON.stringify({ flags, overrides });
    }
    case "WEBHOOKS": {
      const rows = await db.webhookEndpoint.findMany({});
      return JSON.stringify(rows);
    }
    case "FEES":
    default:
      return JSON.stringify({ note: "no live snapshot for this scope" });
  }
}

export async function GET(req: Request) {
  try {
    await requirePermission(Permissions.CONFIG_VIEW);
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope")?.trim().toUpperCase();
    const where: Record<string, string> = {};
    if (scope) where.scope = scope;
    const rows = await db.configVersion.findMany({
      where,
      orderBy: [{ changedAt: "desc" }],
      take: 100,
    });
    return json({
      versions: rows.map((v) => ({
        id: v.id,
        scope: v.scope,
        version: v.version,
        snapshotJSON: v.snapshotJSON,
        changedBy: v.changedBy,
        changedAt: v.changedAt,
        reason: v.reason,
      })),
      count: rows.length,
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    // Rolling back requires CONFIG_ROLLBACK (only SUPER_ADMIN by default).
    // Creating a new snapshot also requires CONFIG_ROLLBACK because POST is
    // used both for snapshots and rollbacks (rollback is invoked via the
    // /api/admin/config-history/[id]/rollback route, but we gate snapshot
    // creation on CONFIG_ROLLBACK here too for defense in depth).
    const user = await requirePermission(Permissions.CONFIG_ROLLBACK);
    const body = await req.json().catch(() => ({}));
    const scope = String(body.scope ?? "")
      .trim()
      .toUpperCase();
    if (!SCOPES.has(scope)) {
      return json({ error: `scope must be one of ${Array.from(SCOPES).join(", ")}` }, 400);
    }
    const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : null;
    const snapshotJSON =
      typeof body.snapshotJSON === "string" ? body.snapshotJSON : await captureSnapshot(scope);

    const maxAgg = await db.configVersion.aggregate({
      where: { scope },
      _max: { version: true },
    });
    const nextVersion = (maxAgg._max.version ?? 0) + 1;
    const created = await db.configVersion.create({
      data: {
        scope,
        version: nextVersion,
        snapshotJSON,
        changedBy: user.id,
        reason,
      },
    });
    await audit({
      userId: user.id,
      action: "ADMIN_CONFIG_SNAPSHOT",
      category: "ADMIN",
      severity: "WARN",
      ip: getClientIp(req),
      metadata: { scope, version: nextVersion, reason },
    });
    return json({ version: created }, 201);
  } catch (e) {
    return handleError(e);
  }
}
