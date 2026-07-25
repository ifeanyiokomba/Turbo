// Turbopay — Vouchers API (user-facing)
//
// GET : returns the list of ACTIVE vouchers available to redeem + the current
//       user's redemption history.

import { db } from "@/lib/db";
import { json, handleError, requireUser } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();

    const now = new Date();

    // Active vouchers: status ACTIVE, validFrom <= now, (validUntil null or >= now)
    const vouchers = await db.voucher.findMany({
      where: {
        status: "ACTIVE",
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gte: now } }],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // User's redemptions
    const redemptions = await db.voucherRedemption.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        voucher: {
          select: {
            id: true,
            code: true,
            type: true,
            valueKobo: true,
            percentOff: true,
            description: true,
          },
        },
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
      })),
      redemptions: redemptions.map((r) => ({
        id: r.id,
        voucherId: r.voucherId,
        valueAppliedKobo: r.valueAppliedKobo,
        status: r.status,
        createdAt: r.createdAt,
        voucher: r.voucher,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
