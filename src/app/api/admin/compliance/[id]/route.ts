// Turbopay admin — single compliance case
//
// PATCH {status, assignedTo}
//        Updates a ComplianceCase status (OPEN | IN_REVIEW | ESCALATED | CLOSED)
//        and/or assigns it to an operator. When status transitions to CLOSED,
//        we also stamp closedAt = now.

import { db } from "@/lib/db";
import { json, handleError, requireAdmin, audit, getClientIp } from "@/lib/api";

export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set(["OPEN", "IN_REVIEW", "ESCALATED", "CLOSED"]);

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const existing = await db.complianceCase.findUnique({ where: { id } });
    if (!existing) return json({ error: "Compliance case not found" }, 404);

    const data: Record<string, unknown> = {};
    if (typeof body.status === "string") {
      const s = body.status.toUpperCase();
      if (!VALID_STATUSES.has(s)) {
        return json({ error: `status must be one of OPEN, IN_REVIEW, ESCALATED, CLOSED` }, 400);
      }
      data.status = s;
      if (s === "CLOSED") data.closedAt = new Date();
      else if (s !== "CLOSED") data.closedAt = null;
    }
    if (typeof body.assignedTo === "string") data.assignedTo = body.assignedTo || null;
    if (typeof body.summary === "string") data.summary = body.summary;

    const updated = await db.complianceCase.update({ where: { id }, data });
    await audit({
      userId: user.id,
      action: "ADMIN_COMPLIANCE_CASE_PATCH",
      category: "COMPLIANCE",
      severity: body.status === "ESCALATED" || body.status === "CLOSED" ? "WARN" : "INFO",
      ip: getClientIp(req),
      metadata: { caseId: id, changes: data, type: existing.type },
    });
    return json({ case: updated });
  } catch (e) {
    return handleError(e);
  }
}
