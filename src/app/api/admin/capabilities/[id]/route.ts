// Turbopay admin — single capability row
//
// PATCH  : update feeBps/feeFixedMinor/settleHours/enabled/min/max/amounts etc.
// DELETE : hard-delete the capability row.

import { db } from "@/lib/db";
import { json, handleError, requireAdmin, audit, getClientIp } from "@/lib/api";
import { invalidateCapabilityCache } from "@/lib/turbocore/routing-engine";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const existing = await db.providerCapability.findUnique({ where: { id } });
    if (!existing) return json({ error: "Capability not found" }, 404);

    const data: Record<string, unknown> = {};
    if (typeof body.enabled === "boolean") data.enabled = body.enabled;
    if (body.feeBps !== undefined) {
      data.feeBps = Math.max(0, Math.min(10000, Number(body.feeBps) || 0));
    }
    if (body.feeFixedMinor !== undefined) {
      data.feeFixedMinor = Math.max(0, Number(body.feeFixedMinor) || 0);
    }
    if (body.settleHours !== undefined) {
      data.settleHours = Math.max(0, Math.min(720, Number(body.settleHours) || 0));
    }
    if (body.minAmountMinor !== undefined) {
      data.minAmountMinor = Math.max(0, Number(body.minAmountMinor) || 0);
    }
    if (body.maxAmountMinor !== undefined) {
      data.maxAmountMinor = Math.max(0, Number(body.maxAmountMinor) || 0);
    }
    if (typeof body.country === "string") data.country = body.country.toUpperCase();
    if (typeof body.currency === "string") data.currency = body.currency.toUpperCase();
    if (typeof body.direction === "string") {
      const d = body.direction.toUpperCase();
      if (d === "INBOUND" || d === "OUTBOUND") data.direction = d;
    }
    if (body.service !== undefined) data.service = body.service ? String(body.service) : null;

    const updated = await db.providerCapability.update({ where: { id }, data });
    invalidateCapabilityCache();
    await audit({
      userId: user.id,
      action: "ADMIN_CAPABILITY_PATCH",
      category: "ADMIN",
      severity: "WARN",
      ip: getClientIp(req),
      metadata: { id, changes: data },
    });
    return json({ capability: updated });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin();
    const { id } = await ctx.params;
    const existing = await db.providerCapability.findUnique({ where: { id } });
    if (!existing) return json({ error: "Capability not found" }, 404);
    await db.providerCapability.delete({ where: { id } });
    invalidateCapabilityCache();
    await audit({
      userId: user.id,
      action: "ADMIN_CAPABILITY_DELETE",
      category: "ADMIN",
      severity: "WARN",
      ip: getClientIp(req),
      metadata: { id, providerCode: existing.providerCode, contract: existing.contract },
    });
    return json({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
