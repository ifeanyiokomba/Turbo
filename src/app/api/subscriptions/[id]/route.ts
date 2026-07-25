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

    const sub = await db.subscription.findFirst({
      where: { id, customerId: user.id },
    });
    if (!sub) throw new ServiceError("Subscription not found", 404, "NOT_FOUND");

    const plan = await db.subscriptionPlan.findUnique({ where: { id: sub.planId } });

    // Resolve merchant name
    let merchant: { id: string; name: string; category: string | null; logoUrl: string | null; rating: number; verified: boolean } | null = null;
    if (plan) {
      const mm = await db.marketplaceMerchant.findUnique({ where: { id: plan.merchantId } });
      if (mm) {
        merchant = { id: mm.id, name: mm.name, category: mm.category, logoUrl: mm.logoUrl, rating: mm.rating, verified: mm.verified };
      } else {
        const m = await db.merchant.findUnique({ where: { id: plan.merchantId } });
        if (m) {
          merchant = { id: m.id, name: m.businessName ?? m.name, category: null, logoUrl: null, rating: 0, verified: m.status === "ACTIVE" };
        } else {
          merchant = { id: plan.merchantId, name: "Unknown merchant", category: null, logoUrl: null, rating: 0, verified: false };
        }
      }
    }

    // Payment history — transactions whose metadata references this subscription.
    // Stored as JSON string; use string_contains on the subscription id.
    const payments = await db.transaction.findMany({
      where: {
        userId: user.id,
        metadata: { contains: sub.id },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        reference: true,
        amountKobo: true,
        feeKobo: true,
        status: true,
        description: true,
        direction: true,
        createdAt: true,
      },
    });

    return json({ subscription: sub, plan, merchant, payments });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const existing = await db.subscription.findFirst({
      where: { id, customerId: user.id },
    });
    if (!existing) throw new ServiceError("Subscription not found", 404, "NOT_FOUND");

    if (typeof body.status !== "string") {
      throw new ServiceError("Status is required", 400, "NO_STATUS");
    }
    const status = String(body.status).toUpperCase();
    if (!["ACTIVE", "CANCELED", "PAST_DUE", "TRIALING"].includes(status)) {
      throw new ServiceError("Invalid status", 400, "INVALID_STATUS");
    }

    const updated = await db.subscription.update({
      where: { id },
      data: { status },
    });

    await audit({
      userId: user.id,
      action: status === "CANCELED" ? "SUBSCRIPTION_CANCEL" : "SUBSCRIPTION_UPDATE",
      category: "WALLET",
      severity: status === "CANCELED" ? "WARN" : "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: { subscriptionId: id, status, planId: existing.planId },
    });

    return json({ subscription: updated });
  } catch (e) {
    return handleError(e);
  }
}
