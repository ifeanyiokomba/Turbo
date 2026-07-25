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

const VALID_STATUS = new Set(["ACTIVE", "PAUSED"]);

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const existing = await db.scheduledPayment.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      throw new ServiceError("Scheduled payment not found", 404, "NOT_FOUND");
    }

    const data: Record<string, unknown> = {};
    if (typeof body.status === "string") {
      const s = body.status.toUpperCase();
      if (!VALID_STATUS.has(s)) {
        throw new ServiceError("Status must be ACTIVE or PAUSED", 400, "INVALID_STATUS");
      }
      data.status = s;
    }
    if (body.nextRunAt) {
      const d = new Date(body.nextRunAt);
      if (isNaN(d.getTime())) {
        throw new ServiceError("Invalid next run date", 400, "INVALID_NEXT_RUN");
      }
      data.nextRunAt = d;
    }

    if (Object.keys(data).length === 0) {
      throw new ServiceError("No fields to update", 400, "NO_FIELDS");
    }

    const updated = await db.scheduledPayment.update({ where: { id }, data });
    await audit({
      userId: user.id,
      action: "SCHEDULED_PAYMENT_UPDATE",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { scheduledId: id, fields: Object.keys(data) },
    });

    return json({ scheduled: updated });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;

    const existing = await db.scheduledPayment.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      throw new ServiceError("Scheduled payment not found", 404, "NOT_FOUND");
    }

    await db.scheduledPayment.delete({ where: { id } });
    await audit({
      userId: user.id,
      action: "SCHEDULED_PAYMENT_DELETE",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { scheduledId: id, type: existing.type },
    });

    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
