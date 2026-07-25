import { db } from "@/lib/db";
import { json, handleError, requireUser, audit } from "@/lib/api";
import { BADGES, BADGE_ORDER, BADGE_TOTAL, type BadgeKey } from "@/lib/badges";

/**
 * GET /api/badges
 * Evaluates the user's activity against every badge criterion, awards any
 * newly-earned badges (writing UserBadge rows + an InAppNotification per new
 * badge), and returns the full badge collection along with completion stats.
 *
 * Response shape:
 *   {
 *     badges: [{ key, name, description, icon, color, earned, earnedAt }],
 *     stats:  { earned, total, completionPct },
 *     newlyEarned: BadgeKey[]   // badges awarded by this call (for toasts)
 *   }
 */
export async function GET() {
  try {
    const user = await requireUser();

    // ----- Pull everything we need in parallel ---------------------------
    const [
      existingBadges,
      txCounts,
      hasFunding,
      hasTransfer,
      hasAirtime,
      hasBill,
      hasCard,
      hasSavings,
      hasInvestment,
      referralCount,
      savingsDepositsTotal,
      spending30dTotal,
      userRank,
    ] = await Promise.all([
      db.userBadge.findMany({
        where: { userId: user.id },
        orderBy: { earnedAt: "desc" },
      }),
      // total SUCCESS transactions (for context, not currently used in criteria)
      db.transaction.count({
        where: { userId: user.id, status: "SUCCESS" },
      }),
      db.transaction.findFirst({
        where: { userId: user.id, type: "FUNDING", status: "SUCCESS" },
        select: { id: true },
      }),
      db.transaction.findFirst({
        where: { userId: user.id, type: "TRANSFER", status: "SUCCESS" },
        select: { id: true },
      }),
      db.transaction.findFirst({
        where: {
          userId: user.id,
          status: "SUCCESS",
          type: { in: ["AIRTIME", "DATA"] },
        },
        select: { id: true },
      }),
      db.transaction.findFirst({
        where: { userId: user.id, type: "BILL", status: "SUCCESS" },
        select: { id: true },
      }),
      db.virtualCard.findFirst({
        where: { userId: user.id },
        select: { id: true },
      }),
      db.savingsTransaction.findFirst({
        where: { userId: user.id, type: "DEPOSIT" },
        select: { id: true },
      }),
      db.userInvestment.findFirst({
        where: { userId: user.id },
        select: { id: true },
      }),
      db.transaction.count({
        where: { userId: user.id, type: "REFERRAL", status: "SUCCESS" },
      }),
      db.savingsTransaction.aggregate({
        where: { userId: user.id, type: "DEPOSIT", status: "SUCCESS" },
        _sum: { amountKobo: true },
      }),
      db.transaction.aggregate({
        where: {
          userId: user.id,
          direction: "DEBIT",
          status: "SUCCESS",
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        _sum: { amountKobo: true },
      }),
      // Count users created before this one (for EARLY_BIRD — first 100)
      db.user.count({
        where: { createdAt: { lt: user.createdAt } },
      }),
    ]);

    void txCounts; // reserved for future criterion expansion

    // ----- Evaluate each badge criterion --------------------------------
    const criteria: Record<BadgeKey, boolean> = {
      FIRST_FUNDING: !!hasFunding,
      FIRST_TRANSFER: !!hasTransfer,
      FIRST_AIRTIME: !!hasAirtime,
      FIRST_BILL: !!hasBill,
      FIRST_CARD: !!hasCard,
      FIRST_SAVINGS: !!hasSavings,
      FIRST_INVESTMENT: !!hasInvestment,
      KYC_VERIFIED: user.kycStatus === "VERIFIED",
      PIN_SET: !!user.transactionPinHash,
      SAVVY_SAVER: (savingsDepositsTotal._sum.amountKobo ?? 0) >= 10_000_000,
      BIG_SPENDER: (spending30dTotal._sum.amountKobo ?? 0) >= 50_000_000,
      REFERRAL_PRO: referralCount >= 3,
      SECURE_USER: user.kycTier >= 2,
      EARLY_BIRD: userRank < 100,
    };

    // ----- Diff against existing badges ---------------------------------
    const existingKeys = new Set(existingBadges.map((b) => b.badgeKey));
    const newlyEarned: BadgeKey[] = [];
    for (const key of BADGE_ORDER) {
      if (criteria[key] && !existingKeys.has(key)) {
        newlyEarned.push(key);
      }
    }

    // ----- Persist new badges + notifications ---------------------------
    if (newlyEarned.length > 0) {
      await db.$transaction(async (tx) => {
        // SQLite's createMany doesn't support skipDuplicates, so we create
        // each badge individually and swallow the rare unique-constraint
        // race (the @@unique([userId, badgeKey]) guard is the source of truth).
        await Promise.all(
          newlyEarned.map((key) =>
            tx.userBadge
              .create({ data: { userId: user.id, badgeKey: key } })
              .catch((err) => {
                // P2002 = unique constraint violation — acceptable here.
                if (
                  typeof err === "object" &&
                  err !== null &&
                  "code" in err &&
                  (err as { code: string }).code === "P2002"
                ) {
                  return;
                }
                throw err;
              }),
          ),
        );
        await tx.inAppNotification.createMany({
          data: newlyEarned.map((key) => ({
            userId: user.id,
            type: "REWARD",
            title: "Badge unlocked!",
            body: `You earned the "${BADGES[key].name}" badge — ${BADGES[key].description}.`,
            priority: "NORMAL",
            actionUrl: "/achievements",
          })),
        });
      });
      await audit({
        userId: user.id,
        action: "BADGES_EARNED",
        category: "WALLET",
        severity: "INFO",
        metadata: { count: newlyEarned.length, badges: newlyEarned },
      });
    }

    // ----- Re-fetch the full badge set so earnedAt is fresh -------------
    const finalBadges = newlyEarned.length > 0
      ? await db.userBadge.findMany({
          where: { userId: user.id },
          orderBy: { earnedAt: "desc" },
        })
      : existingBadges;

    const earnedByBadgeKey = new Map(finalBadges.map((b) => [b.badgeKey, b.earnedAt]));

    const badgesPayload = BADGE_ORDER.map((key) => {
      const meta = BADGES[key];
      const earnedAt = earnedByBadgeKey.get(key);
      return {
        key,
        name: meta.name,
        description: meta.description,
        icon: meta.icon,
        color: meta.color,
        earned: !!earnedAt,
        earnedAt: earnedAt ? earnedAt.toISOString() : null,
      };
    });

    const earnedCount = badgesPayload.filter((b) => b.earned).length;
    const completionPct = Math.round((earnedCount / BADGE_TOTAL) * 100);

    return json({
      badges: badgesPayload,
      stats: {
        earned: earnedCount,
        total: BADGE_TOTAL,
        completionPct,
      },
      newlyEarned,
    });
  } catch (e) {
    return handleError(e);
  }
}
