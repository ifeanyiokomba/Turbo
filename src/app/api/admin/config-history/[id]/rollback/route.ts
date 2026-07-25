// Turbopay admin — config version rollback
//
// POST /api/admin/config-history/[id]/rollback
//      Restores the snapshot stored on ConfigVersion[id] back to the live tables.
//      Behavior:
//        PROVIDERS   → wipe & reseed ProviderConfig rows from snapshot
//        CAPABILITIES → wipe & reseed ProviderCapability rows
//        ROUTING     → wipe & reseed ProviderRoute rows
//        FEATURE_FLAGS → wipe & reseed FeatureFlag + FeatureFlagOverride
//        FX          → wipe & reseed FxConfig
//        WEBHOOKS    → wipe & reseed WebhookEndpoint
//      After a successful rollback we capture a NEW snapshot (so the rollback
//      itself is recorded in history) and audit the action.

import { db } from "@/lib/db";
import { json, handleError, requireAdmin, audit, getClientIp } from "@/lib/api";
import { invalidateCapabilityCache } from "@/lib/turbocore/routing-engine";

export const dynamic = "force-dynamic";

type ProviderSnapshotRow = {
  code: string;
  displayName: string;
  sandbox: boolean;
  enabled: boolean;
  weightsJSON: string;
  defaultPriority: number;
  website?: string | null;
  logoUrl?: string | null;
};

type CapabilitySnapshotRow = {
  id?: string;
  providerCode: string;
  contract: string;
  country: string;
  currency: string;
  service?: string | null;
  direction: string;
  minAmountMinor: number;
  maxAmountMinor: number;
  feeBps: number;
  feeFixedMinor: number;
  settleHours: number;
  enabled: boolean;
};

type RouteSnapshotRow = {
  id?: string;
  contract: string;
  providerCode: string;
  country: string;
  currency: string;
  priority: number;
  weight: number;
  canaryPercent: number;
  enabled: boolean;
};

type FxSnapshotRow = {
  id?: string;
  base: string;
  quote: string;
  spreadBps: number;
  markupBps: number;
  feeFixedMinor: number;
  feeBps: number;
};

type FlagSnapshotRow = {
  id?: string;
  key: string;
  description?: string | null;
  type: string;
  valueJSON: string;
  enabled: boolean;
  updatedBy?: string | null;
};

type OverrideSnapshotRow = {
  id?: string;
  flagKey: string;
  targetType: string;
  targetId: string;
  valueJSON: string;
};

type WebhookEndpointSnapshotRow = {
  id?: string;
  merchantId: string;
  url: string;
  secretHash: string;
  eventsJSON: string;
  enabled: boolean;
};

async function applyRollback(scope: string, snapshotJSON: string): Promise<{ restored: number }> {
  const data = JSON.parse(snapshotJSON);
  switch (scope) {
    case "PROVIDERS": {
      const rows = (Array.isArray(data) ? data : []) as ProviderSnapshotRow[];
      await db.$transaction(async (tx) => {
        await tx.providerConfig.deleteMany({});
        for (const r of rows) {
          await tx.providerConfig.create({
            data: {
              code: r.code,
              displayName: r.displayName,
              sandbox: r.sandbox,
              enabled: r.enabled,
              weightsJSON: r.weightsJSON ?? "{}",
              defaultPriority: r.defaultPriority ?? 50,
              website: r.website ?? null,
              logoUrl: r.logoUrl ?? null,
            },
          });
        }
      });
      return { restored: rows.length };
    }
    case "CAPABILITIES": {
      const rows = (Array.isArray(data) ? data : []) as CapabilitySnapshotRow[];
      await db.$transaction(async (tx) => {
        await tx.providerCapability.deleteMany({});
        for (const r of rows) {
          await tx.providerCapability.create({
            data: {
              providerCode: r.providerCode,
              contract: r.contract,
              country: r.country,
              currency: r.currency,
              service: r.service ?? null,
              direction: r.direction,
              minAmountMinor: r.minAmountMinor ?? 0,
              maxAmountMinor: r.maxAmountMinor ?? 0,
              feeBps: r.feeBps ?? 0,
              feeFixedMinor: r.feeFixedMinor ?? 0,
              settleHours: r.settleHours ?? 0,
              enabled: r.enabled ?? true,
            },
          });
        }
      });
      return { restored: rows.length };
    }
    case "ROUTING": {
      const rows = (Array.isArray(data) ? data : []) as RouteSnapshotRow[];
      await db.$transaction(async (tx) => {
        await tx.providerRoute.deleteMany({});
        for (const r of rows) {
          await tx.providerRoute.create({
            data: {
              contract: r.contract,
              providerCode: r.providerCode,
              country: r.country,
              currency: r.currency,
              priority: r.priority ?? 50,
              weight: r.weight ?? 100,
              canaryPercent: r.canaryPercent ?? 100,
              enabled: r.enabled ?? true,
            },
          });
        }
      });
      return { restored: rows.length };
    }
    case "FX": {
      const rows = (Array.isArray(data) ? data : []) as FxSnapshotRow[];
      await db.$transaction(async (tx) => {
        await tx.fxConfig.deleteMany({});
        for (const r of rows) {
          await tx.fxConfig.create({
            data: {
              base: r.base,
              quote: r.quote,
              spreadBps: r.spreadBps ?? 0,
              markupBps: r.markupBps ?? 0,
              feeFixedMinor: r.feeFixedMinor ?? 0,
              feeBps: r.feeBps ?? 0,
            },
          });
        }
      });
      return { restored: rows.length };
    }
    case "FEATURE_FLAGS": {
      const flags = (data.flags ?? []) as FlagSnapshotRow[];
      const overrides = (data.overrides ?? []) as OverrideSnapshotRow[];
      await db.$transaction(async (tx) => {
        await tx.featureFlagOverride.deleteMany({});
        await tx.featureFlag.deleteMany({});
        for (const f of flags) {
          await tx.featureFlag.create({
            data: {
              key: f.key,
              description: f.description ?? null,
              type: f.type ?? "BOOL",
              valueJSON: f.valueJSON ?? "true",
              enabled: f.enabled ?? true,
              updatedBy: f.updatedBy ?? null,
            },
          });
        }
        for (const o of overrides) {
          await tx.featureFlagOverride.create({
            data: {
              flagKey: o.flagKey,
              targetType: o.targetType,
              targetId: o.targetId,
              valueJSON: o.valueJSON,
            },
          });
        }
      });
      return { restored: flags.length + overrides.length };
    }
    case "WEBHOOKS": {
      const rows = (Array.isArray(data) ? data : []) as WebhookEndpointSnapshotRow[];
      await db.$transaction(async (tx) => {
        await tx.webhookEndpoint.deleteMany({});
        for (const r of rows) {
          await tx.webhookEndpoint.create({
            data: {
              merchantId: r.merchantId,
              url: r.url,
              secretHash: r.secretHash,
              eventsJSON: r.eventsJSON ?? "[]",
              enabled: r.enabled ?? true,
            },
          });
        }
      });
      return { restored: rows.length };
    }
    default:
      return { restored: 0 };
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin();
    const { id } = await ctx.params;
    const version = await db.configVersion.findUnique({ where: { id } });
    if (!version) return json({ error: "Config version not found" }, 404);

    const result = await applyRollback(version.scope, version.snapshotJSON);
    invalidateCapabilityCache();

    // Capture a fresh snapshot after the rollback so the action itself is recorded.
    const maxAgg = await db.configVersion.aggregate({
      where: { scope: version.scope },
      _max: { version: true },
    });
    const nextVersion = (maxAgg._max.version ?? 0) + 1;
    const rollbackSnapshot = await db.configVersion.create({
      data: {
        scope: version.scope,
        version: nextVersion,
        snapshotJSON: version.snapshotJSON,
        changedBy: user.id,
        reason: `Rollback to v${version.version}`,
      },
    });

    await audit({
      userId: user.id,
      action: "ADMIN_CONFIG_ROLLBACK",
      category: "ADMIN",
      severity: "CRITICAL",
      ip: getClientIp(req),
      metadata: {
        scope: version.scope,
        fromVersion: version.version,
        toVersion: nextVersion,
        restored: result.restored,
      },
    });

    return json({
      rolledBack: true,
      scope: version.scope,
      restoredVersion: version.version,
      newSnapshotVersion: rollbackSnapshot.version,
      restored: result.restored,
    });
  } catch (e) {
    return handleError(e);
  }
}
