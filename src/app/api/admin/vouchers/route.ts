// Turbopay admin — vouchers list + create
//
// GET  : list all vouchers (active + disabled + expired), newest first.
// POST : create a new voucher. Body:
//        { code, type, valueKobo, percentOff, description, minAmountKobo,
//          maxRedemptions, perUserLimit, validUntil }
//        code is uppercased + sanitized. type ∈ CASHBACK | FEE_WAIVER | PERCENT_OFF | FLAT_OFF | DISCOUNT.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, handleError, audit, getClientIp, getUserAgent, ServiceError } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

const TYPES = new Set(["CASHBACK", "DISCOUNT", "FEE_WAIVER", "PERCENT_OFF", "FLAT_OFF"]);

export async function GET() {
  try {
    await requirePermission(Permissions.VOUCHERS_VIEW);
    const vouchers = await db.voucher.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        _count: { select: { redemptions: true } },
      },
    });
    return json({
      vouchers: vouchers.map((v) => ({
        id: v.id,
        code: v.code,
        type: v.type,
        valueKobo: v.valueKobo,
        percentOff: v.percentOff,
        description: v.description,
        minAmountKobo: v.minAmountKobo,
        maxRedemptions: v.maxRedemptions,
        redemptionsCount: v.redemptionsCount,
        perUserLimit: v.perUserLimit,
        validFrom: v.validFrom,
        validUntil: v.validUntil,
        status: v.status,
        createdById: v.createdById,
        createdAt: v.createdAt,
        redemptionCount: v._count.redemptions,
      })),
      count: vouchers.length,
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requirePermission(Permissions.VOUCHERS_MANAGE);
    const body = await req.json().catch(() => ({}));

    const rawCode = String(body.code ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "-");
    if (!/^[A-Z0-9\-]{4,40}$/.test(rawCode))
      throw new ServiceError("Code must be 4-40 chars: A-Z, 0-9, hyphen", 400, "INVALID_CODE");

    const type = String(body.type ?? "CASHBACK").toUpperCase();
    if (!TYPES.has(type))
      throw new ServiceError(
        "Type must be CASHBACK, DISCOUNT, FEE_WAIVER, PERCENT_OFF, or FLAT_OFF",
        400,
        "INVALID_TYPE"
      );

    const valueKobo = Math.max(0, Math.floor(Number(body.valueKobo ?? 0)));
    const percentOff = Math.max(0, Math.min(100, Math.floor(Number(body.percentOff ?? 0))));
    const minAmountKobo = Math.max(0, Math.floor(Number(body.minAmountKobo ?? 0)));
    const maxRedemptions = Math.max(0, Math.floor(Number(body.maxRedemptions ?? 0)));
    const perUserLimit = Math.max(1, Math.floor(Number(body.perUserLimit ?? 1)));

    const description = String(body.description ?? "").trim();
    if (description.length < 3)
      throw new ServiceError("Description is too short", 400, "VALIDATION");

    // Type-specific value validation
    if ((type === "CASHBACK" || type === "FLAT_OFF" || type === "DISCOUNT") && valueKobo <= 0)
      throw new ServiceError(`${type} vouchers require valueKobo > 0`, 400, "VALUE_REQUIRED");
    if (type === "PERCENT_OFF" && (percentOff <= 0 || percentOff > 100))
      throw new ServiceError("PERCENT_OFF requires 1-100 percentOff", 400, "VALUE_REQUIRED");

    // validUntil — optional ISO string
    let validUntil: Date | null = null;
    if (body.validUntil) {
      const d = new Date(body.validUntil);
      if (isNaN(d.getTime())) throw new ServiceError("Invalid validUntil", 400, "VALIDATION");
      if (d.getTime() < Date.now())
        throw new ServiceError("validUntil cannot be in the past", 400, "VALIDATION");
      validUntil = d;
    }

    // Uniqueness check (DB will also enforce)
    const exists = await db.voucher.findUnique({ where: { code: rawCode } });
    if (exists) throw new ServiceError("Voucher code already exists", 409, "CODE_TAKEN");

    const voucher = await db.voucher.create({
      data: {
        code: rawCode,
        type,
        valueKobo,
        percentOff,
        description,
        minAmountKobo,
        maxRedemptions,
        perUserLimit,
        validUntil,
        status: "ACTIVE",
        createdById: admin.id,
      },
    });

    await audit({
      userId: admin.id,
      action: "ADMIN_VOUCHER_CREATE",
      category: "ADMIN",
      severity: "WARN",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        voucherId: voucher.id,
        code: voucher.code,
        type,
        valueKobo,
        percentOff,
        maxRedemptions,
      },
    });

    return json({ voucher }, 201);
  } catch (e) {
    return handleError(e);
  }
}
