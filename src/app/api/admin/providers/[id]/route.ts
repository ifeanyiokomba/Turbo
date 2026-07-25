// Turbopay admin — single provider config
//
// PATCH  : update enabled/sandbox/defaultPriority/weightsJSON on a ProviderConfig.
// DELETE : soft-disable the provider (we never hard-delete — preserves audit trail
//          and lets the operator re-enable later if needed).

import { db } from "@/lib/db";
import { json, handleError, requireAdmin, audit, getClientIp } from "@/lib/api";
import { invalidateCapabilityCache } from "@/lib/turbocore/routing-engine";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin();
    const { id } = await ctx.params;
    const code = id.toLowerCase();
    const body = await req.json().catch(() => ({}));
    const existing = await db.providerConfig.findUnique({ where: { code } });
    if (!existing) return json({ error: "Provider not found" }, 404);

    const data: Record<string, unknown> = {};
    if (typeof body.enabled === "boolean") data.enabled = body.enabled;
    if (typeof body.sandbox === "boolean") data.sandbox = body.sandbox;
    if (body.defaultPriority !== undefined) {
      data.defaultPriority = Math.max(0, Math.min(100, Number(body.defaultPriority) || 50));
    }
    if (typeof body.weightsJSON === "string") data.weightsJSON = body.weightsJSON;
    if (typeof body.displayName === "string") data.displayName = body.displayName;
    if (typeof body.website === "string") data.website = body.website;
    if (typeof body.logoUrl === "string") data.logoUrl = body.logoUrl;

    const updated = await db.providerConfig.update({ where: { code }, data });
    invalidateCapabilityCache();
    await audit({
      userId: user.id,
      action: "ADMIN_PROVIDER_PATCH",
      category: "ADMIN",
      severity: "WARN",
      ip: getClientIp(req),
      metadata: { code, changes: data },
    });
    return json({ provider: updated });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin();
    const { id } = await ctx.params;
    const code = id.toLowerCase();
    const existing = await db.providerConfig.findUnique({ where: { code } });
    if (!existing) return json({ error: "Provider not found" }, 404);
    const updated = await db.providerConfig.update({
      where: { code },
      data: { enabled: false },
    });
    invalidateCapabilityCache();
    await audit({
      userId: user.id,
      action: "ADMIN_PROVIDER_DISABLE",
      category: "ADMIN",
      severity: "WARN",
      ip: getClientIp(req),
      metadata: { code },
    });
    return json({ provider: updated, disabled: true });
  } catch (e) {
    return handleError(e);
  }
}
