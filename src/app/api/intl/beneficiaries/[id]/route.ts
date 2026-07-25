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

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;

    const existing = await db.beneficiary.findFirst({
      where: { id, userId: user.id, type: "INTERNATIONAL" },
    });
    if (!existing) {
      throw new ServiceError("International beneficiary not found", 404, "NOT_FOUND");
    }

    await db.beneficiary.delete({ where: { id } });

    await audit({
      userId: user.id,
      action: "INTL_BENEFICIARY_DELETE",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { beneficiaryId: id, name: existing.name },
    });

    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
