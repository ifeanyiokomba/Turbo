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

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const beneficiary = await db.beneficiary.findUnique({ where: { id } });
    if (!beneficiary || beneficiary.userId !== user.id)
      throw new ServiceError("Beneficiary not found", 404, "NOT_FOUND");

    const data: { isFavorite?: boolean; lastUsedAt?: Date } = {};
    if (typeof body?.isFavorite === "boolean") data.isFavorite = body.isFavorite;
    if (body?.touch === true) data.lastUsedAt = new Date();
    if (Object.keys(data).length === 0)
      throw new ServiceError("No fields to update", 400, "NO_FIELDS");

    const updated = await db.beneficiary.update({ where: { id }, data });

    if (typeof body?.isFavorite === "boolean") {
      await audit({
        userId: user.id,
        action: body.isFavorite ? "BENEFICIARY_FAVORITE" : "BENEFICIARY_UNFAVORITE",
        category: "WALLET",
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        metadata: { beneficiaryId: id },
      });
    }

    return json({ beneficiary: updated });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const beneficiary = await db.beneficiary.findUnique({ where: { id } });
    if (!beneficiary || beneficiary.userId !== user.id)
      throw new ServiceError("Beneficiary not found", 404, "NOT_FOUND");

    await db.beneficiary.delete({ where: { id } });

    await audit({
      userId: user.id,
      action: "BENEFICIARY_DELETE",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { beneficiaryId: id, name: beneficiary.name },
    });

    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
