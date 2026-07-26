// Turbopay savings — auto-save rule toggle/delete
//
// PATCH /[id] { enabled: boolean }   — toggle the rule's enabled state.
// DELETE /[id]                        — permanently delete the rule.

import { db } from "@/lib/db";
import {
  json,
  handleError,
  requireUser,
  audit,
  getClientIp,
  getUserAgent,
  ServiceError,
} from "@/lib/api";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const enabled = Boolean(body?.enabled);

    const existing = await db.autoSaveRule.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      throw new ServiceError("Auto-save rule not found", 404, "RULE_NOT_FOUND");
    }

    const updated = await db.autoSaveRule.update({
      where: { id },
      data: { enabled },
    });

    await audit({
      userId: user.id,
      action: enabled ? "AUTO_SAVE_RULE_ENABLED" : "AUTO_SAVE_RULE_DISABLED",
      category: "SAVINGS",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { ruleId: id, type: existing.type, productId: existing.productId },
    });

    return json({
      id: updated.id,
      type: updated.type,
      amountKobo: updated.amountKobo,
      productId: updated.productId,
      enabled: updated.enabled,
      totalSavedKobo: updated.totalSavedKobo,
      lastRunAt: updated.lastRunAt?.toISOString() ?? null,
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;

    const existing = await db.autoSaveRule.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      throw new ServiceError("Auto-save rule not found", 404, "RULE_NOT_FOUND");
    }

    await db.autoSaveRule.delete({ where: { id } });

    await audit({
      userId: user.id,
      action: "AUTO_SAVE_RULE_DELETED",
      category: "SAVINGS",
      severity: "WARN",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        ruleId: id,
        type: existing.type,
        amountKobo: existing.amountKobo,
        productId: existing.productId,
        totalSavedKobo: existing.totalSavedKobo,
      },
    });

    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
