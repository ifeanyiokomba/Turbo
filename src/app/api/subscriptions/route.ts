import { db } from "@/lib/db";
import {
  json,
  handleError,
  requireUser,
} from "@/lib/api";
import { ensureMarketplaceSeeded } from "@/lib/marketplace-data";
import { nairaCompact } from "@/lib/money";

/** Convert a plan amount to its monthly-equivalent in kobo. */
function monthlyEquivalentKobo(amountMinor: number, interval: string, intervalCount: number): number {
  const n = Math.max(1, intervalCount || 1);
  switch (interval) {
    case "DAY":
      return Math.round((amountMinor * 30) / n);
    case "WEEK":
      return Math.round((amountMinor * 52) / (12 * n));
    case "MONTH":
      return Math.round(amountMinor / n);
    case "YEAR":
      return Math.round(amountMinor / (12 * n));
    default:
      return Math.round(amountMinor / n);
  }
}

const DEMO_PLANS: Array<{
  planName: string;
  amountMinor: number;
  interval: "MONTH" | "YEAR";
  intervalCount: number;
  trialDays: number;
  merchantCategory: string;
  merchantName: string;
  description: string;
}> = [
  {
    planName: "Spotify Premium",
    amountMinor: 150000, // ₦1,500/mo
    interval: "MONTH",
    intervalCount: 1,
    trialDays: 0,
    merchantCategory: "ENTERTAINMENT",
    merchantName: "Spotify",
    description: "Ad-free music streaming + offline downloads.",
  },
  {
    planName: "Netflix Standard",
    amountMinor: 550000, // ₦5,500/mo
    interval: "MONTH",
    intervalCount: 1,
    trialDays: 0,
    merchantCategory: "ENTERTAINMENT",
    merchantName: "Netflix",
    description: "HD streaming on 2 devices, unlimited movies & shows.",
  },
  {
    planName: "DStv Compact Plus",
    amountMinor: 1450000, // ₦14,500/mo
    interval: "MONTH",
    intervalCount: 1,
    trialDays: 0,
    merchantCategory: "UTILITIES",
    merchantName: "DSTV",
    description: "Premium sports, movies and entertainment channels.",
  },
  {
    planName: "Spectranet Unlimited",
    amountMinor: 2500000, // ₦25,000/mo
    interval: "MONTH",
    intervalCount: 1,
    trialDays: 0,
    merchantCategory: "UTILITIES",
    merchantName: "Spectranet",
    description: "Unlimited 4G LTE home broadband.",
  },
  {
    planName: "Showmax Premium (Annual)",
    amountMinor: 3600000, // ₦36,000/yr (saves 33%)
    interval: "YEAR",
    intervalCount: 1,
    trialDays: 7,
    merchantCategory: "ENTERTAINMENT",
    merchantName: "Showmax",
    description: "Annual plan — best value, 7-day free trial.",
  },
];

/** Idempotently seed a handful of demo subscriptions for the given user. */
async function ensureSubscriptionsSeeded(userId: string): Promise<void> {
  try {
    const existing = await db.subscription.count({ where: { customerId: userId } });
    if (existing > 0) return;

    await ensureMarketplaceSeeded();
    const merchants = await db.marketplaceMerchant.findMany({
      where: { status: "ACTIVE" },
    });
    const byName = new Map(merchants.map((m) => [m.name, m]));

    const now = new Date();
    for (const p of DEMO_PLANS) {
      const merchant = byName.get(p.merchantName);
      const merchantId = merchant?.id ?? `mkt-${p.merchantName.toLowerCase().replace(/\s+/g, "-")}`;
      const plan = await db.subscriptionPlan.create({
        data: {
          merchantId,
          name: p.planName,
          amountMinor: p.amountMinor,
          currency: "NGN",
          interval: p.interval,
          intervalCount: p.intervalCount,
          trialDays: p.trialDays,
          status: "ACTIVE",
        },
      });

      // Stagger next-charge dates across the next 30 days.
      const offsetDays = 1 + Math.floor(Math.random() * 28);
      const nextChargeAt = new Date(now);
      nextChargeAt.setDate(nextChargeAt.getDate() + offsetDays);
      const currentPeriodEnd = new Date(nextChargeAt);

      await db.subscription.create({
        data: {
          planId: plan.id,
          customerId: userId,
          status: p.trialDays > 0 ? "TRIALING" : "ACTIVE",
          currentPeriodEnd,
          nextChargeAt,
        },
      });
    }
    console.log(`[subscriptions] seeded ${DEMO_PLANS.length} demo subscriptions for ${userId}`);
  } catch (e) {
    console.error("[subscriptions] seed failed", e);
  }
}

export async function GET() {
  try {
    const user = await requireUser();
    await ensureSubscriptionsSeeded(user.id);

    const subs = await db.subscription.findMany({
      where: { customerId: user.id },
      orderBy: [{ status: "asc" }, { nextChargeAt: "asc" }],
    });
    if (subs.length === 0) {
      return json({ subscriptions: [], totalActive: 0, totalMonthly: 0, nextChargeAt: null });
    }

    const planIds = Array.from(new Set(subs.map((s) => s.planId)));
    const plans = await db.subscriptionPlan.findMany({ where: { id: { in: planIds } } });
    const planMap = new Map(plans.map((p) => [p.id, p]));

    // Resolve merchant names from MarketplaceMerchant first, then Merchant.
    const merchantIds = Array.from(new Set(plans.map((p) => p.merchantId)));
    const marketplaceMerchants = await db.marketplaceMerchant.findMany({
      where: { id: { in: merchantIds } },
    });
    const mmMap = new Map(marketplaceMerchants.map((m) => [m.id, m]));
    const missingMerchantIds = merchantIds.filter((id) => !mmMap.has(id));
    const merchants = missingMerchantIds.length
      ? await db.merchant.findMany({ where: { id: { in: missingMerchantIds } } })
      : [];
    const merchantMap = new Map(merchants.map((m) => [m.id, m]));

    const out = subs.map((s) => {
      const plan = planMap.get(s.planId);
      const mm = plan ? mmMap.get(plan.merchantId) : undefined;
      const m = plan ? merchantMap.get(plan.merchantId) : undefined;
      return {
        id: s.id,
        status: s.status,
        nextChargeAt: s.nextChargeAt,
        currentPeriodEnd: s.currentPeriodEnd,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        plan: plan
          ? {
              id: plan.id,
              name: plan.name,
              amountMinor: plan.amountMinor,
              currency: plan.currency,
              interval: plan.interval,
              intervalCount: plan.intervalCount,
              trialDays: plan.trialDays,
            }
          : null,
        merchant: mm
          ? {
              id: mm.id,
              name: mm.name,
              category: mm.category,
              logoUrl: mm.logoUrl,
              rating: mm.rating,
              verified: mm.verified,
            }
          : m
            ? {
                id: m.id,
                name: m.businessName ?? m.name,
                category: null,
                logoUrl: null,
                rating: 0,
                verified: m.status === "ACTIVE",
              }
            : { id: plan?.merchantId ?? "unknown", name: "Unknown merchant", category: null, logoUrl: null, rating: 0, verified: false },
      };
    });

    const active = out.filter((s) => s.status === "ACTIVE" || s.status === "TRIALING");
    const totalActive = active.length;
    const totalMonthly = active.reduce(
      (sum, s) =>
        sum + (s.plan ? monthlyEquivalentKobo(s.plan.amountMinor, s.plan.interval, s.plan.intervalCount) : 0),
      0,
    );

    // Earliest upcoming charge among active subs
    const upcoming = active
      .map((s) => new Date(s.nextChargeAt).getTime())
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b);
    const nextChargeAt = upcoming.length ? new Date(upcoming[0]).toISOString() : null;

    return json({
      subscriptions: out,
      totalActive,
      totalMonthly,
      nextChargeAt,
      monthlyDisplay: nairaCompact(totalMonthly),
    });
  } catch (e) {
    return handleError(e);
  }
}
