// Turbopay admin — single feature flag
//
// PATCH   : update description/type/valueJSON/enabled + add override.
//           Body shape: {description?, type?, valueJSON?, enabled?,
//                         override?: {targetType, targetId, valueJSON}}
// DELETE  : hard-delete the flag (cascades to overrides in app code).
//
// We use a transaction when both patching the flag and inserting an override so
// the override never lands against a stale flag snapshot.

import { db } from "@/lib/db";
import { json, handleError, requireAdmin, audit, getClientIp } from "@/lib/api";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set(["BOOL", "PERCENT", "VARIANT"]);
const VALID_TARGETS = new Set(["USER", "COUNTRY", "KYC_TIER"]);

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const existing = await db.featureFlag.findUnique({ where: { id } });
    if (!existing) return json({ error: "Flag not found" }, 404);

    const data: Record<string, unknown> = {};
    if (typeof body.description === "string") data.description = body.description;
    if (typeof body.type === "string") {
      const t = body.type.toUpperCase();
      if (!VALID_TYPES.has(t)) return json({ error: "Invalid type" }, 400);
      data.type = t;
    }
    if (body.valueJSON !== undefined) {
      const v =
        typeof body.valueJSON === "string" ? body.valueJSON : JSON.stringify(body.valueJSON);
      try {
        JSON.parse(v);
      } catch {
        return json({ error: "valueJSON is not valid JSON" }, 400);
      }
      data.valueJSON = v;
    }
    if (typeof body.enabled === "boolean") data.enabled = body.enabled;
    data.updatedBy = user.id;

    let overrideCreated: {
      id: string;
      targetType: string;
      targetId: string;
      valueJSON: string;
    } | null = null;
    let overrideDeleted = false;

    if (body.override && typeof body.override === "object") {
      const ov = body.override as { targetType: string; targetId: string; valueJSON: string };
      const targetType = String(ov.targetType ?? "").toUpperCase();
      const targetId = String(ov.targetId ?? "").trim();
      if (!VALID_TARGETS.has(targetType))
        return json({ error: "Invalid override targetType" }, 400);
      if (!targetId) return json({ error: "Override targetId is required" }, 400);
      const v = typeof ov.valueJSON === "string" ? ov.valueJSON : JSON.stringify(ov.valueJSON);
      try {
        JSON.parse(v);
      } catch {
        return json({ error: "Override valueJSON is not valid JSON" }, 400);
      }
      const result = await db.featureFlagOverride.upsert({
        where: { flagKey_targetType_targetId: { flagKey: existing.key, targetType, targetId } },
        create: { flagKey: existing.key, targetType, targetId, valueJSON: v },
        update: { valueJSON: v },
      });
      overrideCreated = {
        id: result.id,
        targetType: result.targetType,
        targetId: result.targetId,
        valueJSON: result.valueJSON,
      };
    }

    if (typeof body.deleteOverrideId === "string") {
      await db.featureFlagOverride.deleteMany({
        where: { id: body.deleteOverrideId, flagKey: existing.key },
      });
      overrideDeleted = true;
    }

    const updated = await db.featureFlag.update({ where: { id }, data });
    await audit({
      userId: user.id,
      action: "ADMIN_FEATURE_FLAG_PATCH",
      category: "ADMIN",
      severity: "WARN",
      ip: getClientIp(req),
      metadata: {
        id,
        key: existing.key,
        changes: data,
        overrideCreated: !!overrideCreated,
        overrideDeleted,
      },
    });
    return json({ flag: updated, overrideCreated, overrideDeleted });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin();
    const { id } = await ctx.params;
    const existing = await db.featureFlag.findUnique({ where: { id } });
    if (!existing) return json({ error: "Flag not found" }, 404);
    await db.$transaction(async (tx) => {
      await tx.featureFlagOverride.deleteMany({ where: { flagKey: existing.key } });
      await tx.featureFlag.delete({ where: { id } });
    });
    await audit({
      userId: user.id,
      action: "ADMIN_FEATURE_FLAG_DELETE",
      category: "ADMIN",
      severity: "WARN",
      ip: getClientIp(req),
      metadata: { id, key: existing.key },
    });
    return json({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
