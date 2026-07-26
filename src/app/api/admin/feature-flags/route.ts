// Turbopay admin — feature flags + overrides
//
// GET: list all FeatureFlag rows with their overrides attached.
// POST {key, description, type, valueJSON, enabled}
//      Creates a new flag. type ∈ BOOL | PERCENT | VARIANT.
//      valueJSON should match the type:
//        BOOL    → "true" | "false"
//        PERCENT → "0.25" (0..1)
//        VARIANT → "\"variantA\""

import { db } from "@/lib/db";
import { json, handleError, audit, getClientIp } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set(["BOOL", "PERCENT", "VARIANT"]);

export async function GET() {
  try {
    await requirePermission(Permissions.FLAGS_VIEW);
    const [flags, overrides] = await Promise.all([
      db.featureFlag.findMany({ orderBy: { key: "asc" } }),
      db.featureFlagOverride.findMany({ orderBy: { flagKey: "asc" } }),
    ]);
    const overridesByKey = new Map<string, typeof overrides>();
    for (const o of overrides) {
      const arr = overridesByKey.get(o.flagKey) ?? [];
      arr.push(o);
      overridesByKey.set(o.flagKey, arr);
    }
    return json({
      flags: flags.map((f) => ({
        ...f,
        overrides: (overridesByKey.get(f.key) ?? []).map((o) => ({
          id: o.id,
          flagKey: o.flagKey,
          targetType: o.targetType,
          targetId: o.targetId,
          valueJSON: o.valueJSON,
          createdAt: o.createdAt,
        })),
      })),
      count: flags.length,
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requirePermission(Permissions.FLAGS_MANAGE);
    const body = await req.json().catch(() => ({}));
    const key = String(body.key ?? "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    if (!key) return json({ error: "key is required" }, 400);
    const type = String(body.type ?? "BOOL").toUpperCase();
    if (!VALID_TYPES.has(type)) return json({ error: "type must be BOOL, PERCENT, or VARIANT" }, 400);

    // Default value depends on type
    let valueJSON: string;
    if (body.valueJSON !== undefined && body.valueJSON !== null) {
      valueJSON = typeof body.valueJSON === "string" ? body.valueJSON : JSON.stringify(body.valueJSON);
    } else {
      valueJSON = type === "BOOL" ? "true" : type === "PERCENT" ? "0" : "\"default\"";
    }
    // Validate shape
    try {
      const parsed = JSON.parse(valueJSON);
      if (type === "BOOL" && typeof parsed !== "boolean") return json({ error: "BOOL flag value must be true/false" }, 400);
      if (type === "PERCENT" && (typeof parsed !== "number" || parsed < 0 || parsed > 1)) {
        return json({ error: "PERCENT flag value must be a number between 0 and 1" }, 400);
      }
      if (type === "VARIANT" && typeof parsed !== "string") {
        return json({ error: "VARIANT flag value must be a string" }, 400);
      }
    } catch {
      return json({ error: "valueJSON is not valid JSON" }, 400);
    }

    const description = typeof body.description === "string" ? body.description : null;
    const enabled = Boolean(body.enabled ?? true);

    const created = await db.featureFlag.upsert({
      where: { key },
      create: {
        key,
        description,
        type,
        valueJSON,
        enabled,
        updatedBy: user.id,
      },
      update: {
        description: description ?? undefined,
        type,
        valueJSON,
        enabled,
        updatedBy: user.id,
      },
    });
    await audit({
      userId: user.id,
      action: "ADMIN_FEATURE_FLAG_UPSERT",
      category: "ADMIN",
      severity: "WARN",
      ip: getClientIp(req),
      metadata: { key, type, valueJSON, enabled },
    });
    return json({ flag: created }, 201);
  } catch (e) {
    return handleError(e);
  }
}
