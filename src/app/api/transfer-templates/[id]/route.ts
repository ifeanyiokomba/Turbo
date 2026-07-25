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

    const template = await db.transferTemplate.findUnique({ where: { id } });
    if (!template || template.userId !== user.id)
      throw new ServiceError("Template not found", 404, "NOT_FOUND");

    const data: {
      isFavorite?: boolean;
      name?: string;
      amountKobo?: number | null;
      note?: string | null;
      lastUsedAt?: Date;
    } = {};

    if (typeof body?.isFavorite === "boolean") data.isFavorite = body.isFavorite;
    if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (body?.touch === true) data.lastUsedAt = new Date();

    // Allow updating amount/note — both nullable
    if (body?.amountKobo !== undefined) {
      if (body.amountKobo == null || body.amountKobo === "") {
        data.amountKobo = null;
      } else {
        const n = Math.round(Number(body.amountKobo));
        if (!Number.isFinite(n) || n < 0)
          throw new ServiceError("Invalid amount", 400, "INVALID_AMOUNT");
        data.amountKobo = n;
      }
    }
    if (body?.note !== undefined) {
      data.note = body.note == null ? null : String(body.note).trim().slice(0, 100);
    }

    if (Object.keys(data).length === 0)
      throw new ServiceError("No fields to update", 400, "NO_FIELDS");

    const updated = await db.transferTemplate.update({ where: { id }, data });

    if (typeof body?.isFavorite === "boolean" || typeof body?.name === "string") {
      await audit({
        userId: user.id,
        action: "TRANSFER_TEMPLATE_UPDATE",
        category: "TRANSFER",
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        metadata: { templateId: id, fields: Object.keys(data) },
      });
    }

    return json({ template: updated });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const template = await db.transferTemplate.findUnique({ where: { id } });
    if (!template || template.userId !== user.id)
      throw new ServiceError("Template not found", 404, "NOT_FOUND");

    await db.transferTemplate.delete({ where: { id } });

    await audit({
      userId: user.id,
      action: "TRANSFER_TEMPLATE_DELETE",
      category: "TRANSFER",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { templateId: id, name: template.name },
    });

    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
