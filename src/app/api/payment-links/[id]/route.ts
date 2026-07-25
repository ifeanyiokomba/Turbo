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

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;

    const link = await db.paymentLink.findFirst({
      where: { id, merchantId: user.id },
    });
    if (!link) {
      throw new ServiceError("Payment link not found", 404, "NOT_FOUND");
    }

    // No relation in the schema — query payments separately
    const payments = await db.paymentLinkPayment.findMany({
      where: { paymentLinkId: link.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return json({
      link,
      payments,
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const existing = await db.paymentLink.findFirst({
      where: { id, merchantId: user.id },
    });
    if (!existing) {
      throw new ServiceError("Payment link not found", 404, "NOT_FOUND");
    }

    const data: Record<string, unknown> = {};
    if (typeof body.status === "string") {
      const s = body.status.toUpperCase();
      if (!["ACTIVE", "DISABLED"].includes(s)) {
        throw new ServiceError("Status must be ACTIVE or DISABLED", 400, "INVALID_STATUS");
      }
      data.status = s;
    }
    if (body.maxUses !== undefined) {
      data.maxUses = Math.max(0, Math.round(Number(body.maxUses)));
    }

    if (Object.keys(data).length === 0) {
      throw new ServiceError("No fields to update", 400, "NO_FIELDS");
    }

    const updated = await db.paymentLink.update({ where: { id }, data });
    await audit({
      userId: user.id,
      action: "PAYMENT_LINK_UPDATE",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { linkId: id, fields: Object.keys(data) },
    });

    return json({ link: updated });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;

    const existing = await db.paymentLink.findFirst({
      where: { id, merchantId: user.id },
    });
    if (!existing) {
      throw new ServiceError("Payment link not found", 404, "NOT_FOUND");
    }

    await db.paymentLink.delete({ where: { id } });
    await audit({
      userId: user.id,
      action: "PAYMENT_LINK_DELETE",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { linkId: id, slug: existing.slug },
    });

    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
