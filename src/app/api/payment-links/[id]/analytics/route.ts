import { db } from "@/lib/db";
import {
  json,
  handleError,
  requireUser,
  ServiceError,
} from "@/lib/api";

/**
 * GET /api/payment-links/[id]/analytics
 *
 * Returns analytics for a single link:
 *   - views (from metadataJSON.views, with sane fallback)
 *   - paymentAttempts (all PaymentLinkPayment rows)
 *   - successfulPayments (status=SUCCESS)
 *   - failedPayments (status=FAILED)
 *   - totalCollectedMinor (sum of SUCCESS amounts)
 *   - conversionRate (%)
 *   - recentPayments (last 10)
 */
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

    const payments = await db.paymentLinkPayment.findMany({
      where: { paymentLinkId: link.id },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    // Parse metadata for stored views + customization
    let meta: Record<string, unknown> = {};
    try {
      const v = JSON.parse(link.metadataJSON);
      if (typeof v === "object" && v !== null) meta = v as Record<string, unknown>;
    } catch {
      /* ignore */
    }

    const storedViews = typeof meta.views === "number" ? meta.views : 0;
    const attempts = payments.length;
    const successful = payments.filter((p) => p.status === "SUCCESS");
    const failed = payments.filter((p) => p.status === "FAILED");
    const totalCollected = successful.reduce((s, p) => s + p.amountMinor, 0);
    const successCount = successful.length || link.usesCount;
    const views = Math.max(storedViews, attempts, link.usesCount);
    const conversion = views > 0 ? (successCount / views) * 100 : 0;

    return json({
      link: {
        id: link.id,
        slug: link.slug,
        title: link.title,
        amountMinor: link.amountMinor,
        currency: link.currency,
        status: link.status,
        maxUses: link.maxUses,
        usesCount: link.usesCount,
        expiresAt: link.expiresAt,
        createdAt: link.createdAt,
        customization: {
          description: (meta.description as string | null) ?? null,
          successUrl: (meta.successUrl as string | null) ?? null,
          cancelUrl: (meta.cancelUrl as string | null) ?? null,
          themeColor: (meta.themeColor as string | null) ?? "#10b981",
          logoUrl: (meta.logoUrl as string | null) ?? null,
          allowCustomAmount: (meta.allowCustomAmount as boolean | null) ?? true,
        },
      },
      analytics: {
        views,
        paymentAttempts: attempts,
        successfulPayments: successCount,
        failedPayments: failed.length,
        conversionRate: Number(conversion.toFixed(2)),
        totalCollectedMinor: totalCollected,
        currency: link.currency,
      },
      recentPayments: payments.slice(0, 10).map((p) => ({
        id: p.id,
        amountMinor: p.amountMinor,
        currency: p.currency,
        payerEmail: p.payerEmail,
        payerName: p.payerName,
        status: p.status,
        reference: p.reference,
        createdAt: p.createdAt,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
