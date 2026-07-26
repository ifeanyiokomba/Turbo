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
import { ensureMarketplaceSeeded } from "@/lib/marketplace-data";

interface ShapedReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  userFullName: string;
}

function shapeReview(
  r: { id: string; rating: number; comment: string | null; createdAt: Date; userId: string },
  userFullNameById: Map<string, string>,
): ShapedReview {
  return {
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt,
    userFullName: userFullNameById.get(r.userId) ?? "Anonymous",
  };
}

/**
 * Build the aggregate rating + distribution.
 *
 * The marketplace seed data seeds each merchant with a baseline `rating`
 * (e.g. 4.4) and `reviewCount` (e.g. 18420) representing historical reviews
 * that are not stored as rows in `MerchantReview`. To keep the displayed
 * average meaningful when only a handful of in-app reviews exist, we treat
 * the seeded values as a synthetic baseline and blend them with the real
 * per-user reviews.
 *
 *   avgRating = (baselineRating * baselineCount + sum(realRatings))
 *               / (baselineCount + realCount)
 *
 * `ratingDistribution` is computed from real reviews only (the baseline has
 * no per-star breakdown to draw from).
 */
function buildAggregate(
  baselineRating: number,
  baselineCount: number,
  realReviews: { rating: number }[],
) {
  const realCount = realReviews.length;
  const totalReviews = baselineCount + realCount;

  const sumReal = realReviews.reduce((acc, r) => acc + r.rating, 0);
  const avgRating =
    totalReviews > 0
      ? (baselineRating * baselineCount + sumReal) / totalReviews
      : baselineRating;

  // Distribution from real reviews only
  const ratingDistribution: Record<string, number> = {
    "5": 0,
    "4": 0,
    "3": 0,
    "2": 0,
    "1": 0,
  };
  for (const r of realReviews) {
    const key = String(Math.max(1, Math.min(5, Math.round(r.rating))));
    ratingDistribution[key] = (ratingDistribution[key] ?? 0) + 1;
  }

  return {
    avgRating: Math.round(avgRating * 10) / 10,
    totalReviews,
    ratingDistribution,
  };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    await ensureMarketplaceSeeded();
    const { id } = await ctx.params;

    const merchant = await db.marketplaceMerchant.findUnique({ where: { id } });
    if (!merchant || merchant.status !== "ACTIVE") {
      throw new ServiceError("Merchant not found", 404, "NOT_FOUND");
    }

    const rawReviews = await db.merchantReview.findMany({
      where: { merchantId: id, status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Resolve user fullNames in one batched lookup — the MerchantReview model
    // intentionally has no Prisma relation to User (per the task spec), so we
    // join manually here.
    const userIds = Array.from(new Set(rawReviews.map((r) => r.userId)));
    const users = userIds.length
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const userFullNameById = new Map(users.map((u) => [u.id, u.fullName]));

    const reviews = rawReviews.map((r) => shapeReview(r, userFullNameById));
    const aggregate = buildAggregate(merchant.rating, merchant.reviewCount, rawReviews);

    return json({
      reviews,
      avgRating: aggregate.avgRating,
      totalReviews: aggregate.totalReviews,
      ratingDistribution: aggregate.ratingDistribution,
    });
  } catch (e) {
    return handleError(e);
  }
}

interface PostBody {
  rating?: number;
  comment?: string;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await ensureMarketplaceSeeded();
    const { id } = await ctx.params;

    const merchant = await db.marketplaceMerchant.findUnique({ where: { id } });
    if (!merchant || merchant.status !== "ACTIVE") {
      throw new ServiceError("Merchant not found", 404, "NOT_FOUND");
    }

    const body = (await req.json().catch(() => ({}))) as PostBody;
    const rating = Math.round(Number(body.rating ?? 0));
    const comment =
      typeof body.comment === "string" ? body.comment.trim().slice(0, 1000) : null;

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new ServiceError("Rating must be between 1 and 5", 400, "INVALID_RATING");
    }

    // One review per user per merchant — upsert.
    const existing = await db.merchantReview.findUnique({
      where: { merchantId_userId: { merchantId: id, userId: user.id } },
    });

    const review = await db.merchantReview.upsert({
      where: { merchantId_userId: { merchantId: id, userId: user.id } },
      create: {
        merchantId: id,
        userId: user.id,
        rating,
        comment: comment || null,
        status: "PUBLISHED",
      },
      update: {
        rating,
        comment: comment || null,
        status: "PUBLISHED",
      },
    });

    // Recompute the merchant's displayed aggregate using the blend formula.
    // We seed the baseline by subtracting the user's prior contribution
    // (if any) from the stored aggregate first, so the math stays consistent
    // across edits.
    const baselineRating = merchant.rating;
    const baselineCount = merchant.reviewCount;
    const priorUserRating = existing?.rating ?? 0;
    const hadExisting = !!existing;

    const adjustedCount = Math.max(0, baselineCount - (hadExisting ? 1 : 0));
    const adjustedSum =
      hadExisting && baselineCount > 0
        ? baselineRating * baselineCount - priorUserRating
        : baselineRating * baselineCount;

    const newCount = adjustedCount + 1;
    const newAvg =
      newCount > 0 ? (adjustedSum + rating) / newCount : baselineRating;

    await db.marketplaceMerchant.update({
      where: { id },
      data: {
        rating: Math.round(newAvg * 100) / 100,
        reviewCount: newCount,
      },
    });

    await audit({
      userId: user.id,
      action: existing ? "MERCHANT_REVIEW_UPDATED" : "MERCHANT_REVIEW_CREATED",
      category: "MARKETPLACE",
      severity: "INFO",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        merchantId: merchant.id,
        merchantName: merchant.name,
        rating,
        updated: hadExisting,
      },
    });

    return json({
      review: shapeReview(review, new Map([[review.userId, user.fullName]])),
      avgRating: Math.round(newAvg * 10) / 10,
      totalReviews: newCount,
    });
  } catch (e) {
    return handleError(e);
  }
}
