// Turbopay admin — single routing rule
//
// PATCH  : update priority/weight/canaryPercent/enabled.
// DELETE : hard-delete the route row.

import { db } from "@/lib/db";
import { json, handleError, requireAdmin, audit, getClientIp } from "@/lib/api";
import { invalidateCapabilityCache } from "@/lib/turbocore/routing-engine";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const existing = await db.providerRoute.findUnique({ where: { id } });
    if (!existing) return json({ error: "Route not found" }, 404);

    const data: Record<string, unknown> = {};
    if (body.priority !== undefined) data.priority = Math.max(0, Math.min(100, Number(body.priority) || 0));
    if (body.weight !== undefined) data.weight = Math.max(0, Math.min(100, Number(body.weight) || 0));
    if (body.canaryPercent !== undefined) data.canaryPercent = Math.max(0, Math.min(100, Number(body.canaryPercent) || 0));
    if (typeof body.enabled === "boolean") data.enabled = body.enabled;

    const updated = await db.providerRoute.update({ where: { id }, data });
    invalidateCapabilityCache();
    await audit({
      userId: user.id,
      action: "ADMIN_ROUTE_PATCH",
      category: "ADMIN",
      severity: "WARN",
      ip: getClientIp(req),
      metadata: { id, changes: data },
    });
    return json({ route: updated });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin();
    const { id } = await ctx.params;
    const existing = await db.providerRoute.findUnique({ where: { id } });
    if (!existing) return json({ error: "Route not found" }, 404);
    await db.providerRoute.delete({ where: { id } });
    invalidateCapabilityCache();
    await audit({
      userId: user.id,
      action: "ADMIN_ROUTE_DELETE",
      category: "ADMIN",
      severity: "WARN",
      ip: getClientIp(req),
      metadata: { id, contract: existing.contract, providerCode: existing.providerCode },
    });
    return json({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
