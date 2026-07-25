// Turbopay admin — single voucher management
//
// PATCH  : enable/disable + edit core fields. Body:
//          {enabled?, description?, maxRedemptions?, perUserLimit?,
//           validUntil?, status?}
// DELETE : hard-delete the voucher (cascades to VoucherRedemption).

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  json,
  handleError,
  requireAdmin,
  audit,
  getClientIp,
  getUserAgent,
  ServiceError,
} from "@/lib/api";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const existing = await db.voucher.findUnique({ where: { id } });
    if (!existing) throw new ServiceError("Voucher not found", 404, "NOT_FOUND");

    const data: Record<string, unknown> = {};

    if (typeof body.enabled === "boolean") {
      data.status = body.enabled ? "ACTIVE" : "DISABLED";
    }
    if (typeof body.status === "string") {
      const s = body.status.toUpperCase();
      if (!["ACTIVE", "DISABLED", "EXPIRED"].includes(s))
        throw new ServiceError("Invalid status", 400, "INVALID_STATUS");
      data.status = s;
    }
    if (typeof body.description === "string") {
      if (body.description.trim().length < 3)
        throw new ServiceError("Description too short", 400, "VALIDATION");
      data.description = body.description.trim();
    }
    if (body.maxRedemptions !== undefined) {
      const m = Math.max(0, Math.floor(Number(body.maxRedemptions)));
      if (!Number.isFinite(m))
        throw new ServiceError("Invalid maxRedemptions", 400, "VALIDATION");
      data.maxRedemptions = m;
    }
    if (body.perUserLimit !== undefined) {
      const p = Math.max(1, Math.floor(Number(body.perUserLimit)));
      if (!Number.isFinite(p))
        throw new ServiceError("Invalid perUserLimit", 400, "VALIDATION");
      data.perUserLimit = p;
    }
    if (body.validUntil !== undefined && body.validUntil !== null) {
      const d = new Date(body.validUntil);
      if (isNaN(d.getTime()))
        throw new ServiceError("Invalid validUntil", 400, "VALIDATION");
      data.validUntil = d;
    } else if (body.validUntil === null) {
      data.validUntil = null;
    }

    if (Object.keys(data).length === 0)
      return json({ voucher: existing, unchanged: true });

    const updated = await db.voucher.update({ where: { id }, data });

    await audit({
      userId: admin.id,
      action: "ADMIN_VOUCHER_PATCH",
      category: "ADMIN",
      severity: "WARN",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { voucherId: id, code: existing.code, changes: data },
    });

    return json({ voucher: updated });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const existing = await db.voucher.findUnique({ where: { id } });
    if (!existing) throw new ServiceError("Voucher not found", 404, "NOT_FOUND");

    await db.voucher.delete({ where: { id } });
    await audit({
      userId: admin.id,
      action: "ADMIN_VOUCHER_DELETE",
      category: "ADMIN",
      severity: "WARN",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { voucherId: id, code: existing.code },
    });
    return json({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
