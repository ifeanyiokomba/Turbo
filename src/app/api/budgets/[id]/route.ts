import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  json,
  errorJson,
  handleError,
  requireUser,
  audit,
  getClientIp,
  getUserAgent,
  ServiceError,
} from "@/lib/api";

/**
 * DELETE /api/budgets/[id]
 * Removes a budget owned by the authenticated user.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    if (!id) return errorJson("Budget id is required", 400, "MISSING_ID");

    const existing = await db.spendingBudget.findUnique({ where: { id } });
    if (!existing) return errorJson("Budget not found", 404, "NOT_FOUND");
    if (existing.userId !== user.id) {
      throw new ServiceError("Forbidden", 403, "FORBIDDEN");
    }

    await db.spendingBudget.delete({ where: { id } });

    await audit({
      userId: user.id,
      action: "BUDGET_DELETE",
      category: "BUDGET",
      severity: "WARN",
      ip: getClientIp(_req),
      userAgent: getUserAgent(_req),
      metadata: { budgetId: id, category: existing.category },
    });

    return json({ ok: true });
  } catch (e) {
    if (e instanceof ServiceError) return errorJson(e.message, e.statusCode, e.code);
    return handleError(e);
  }
}
