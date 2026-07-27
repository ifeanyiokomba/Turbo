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
import { generateReferralCode } from "@/lib/auth";
import { TxType, TxDirection, TxStatus } from "@/lib/constants";
import { creditWallet } from "@/lib/ledger";
import { generateReference } from "@/lib/money";

const REFERRAL_BONUS_KOBO = 50_000;

/* ------------------------------------------------------------------ */
/* Tier definitions                                                    */
/* ------------------------------------------------------------------ */

interface TierDef {
  key: "bronze" | "silver" | "gold" | "platinum";
  label: string;
  min: number;
  max: number;
  perks: string[];
  accent: string;
  badge: string;
}

const TIERS: TierDef[] = [
  {
    key: "bronze",
    label: "Bronze",
    min: 0,
    max: 5,
    perks: ["₦500 per referral", "Basic email support", "5% cashback on vouchers"],
    accent: "from-amber-700 to-orange-800",
    badge: "🥉",
  },
  {
    key: "silver",
    label: "Silver",
    min: 6,
    max: 20,
    perks: [
      "₦750 per referral (+50%)",
      "Priority support",
      "10% cashback on vouchers",
      "Early feature access",
    ],
    accent: "from-slate-400 to-slate-600",
    badge: "🥈",
  },
  {
    key: "gold",
    label: "Gold",
    min: 21,
    max: 50,
    perks: [
      "₦1,000 per referral (+100%)",
      "VIP support line",
      "15% cashback",
      "Free premium insights",
      "Birthday bonus",
    ],
    accent: "from-amber-400 to-yellow-600",
    badge: "🥇",
  },
  {
    key: "platinum",
    label: "Platinum",
    min: 51,
    max: Number.MAX_SAFE_INTEGER,
    perks: [
      "₦1,500 per referral (+200%)",
      "Dedicated account manager",
      "20% cashback",
      "Exclusive events",
      "Fee-free transfers",
      "Concierge onboarding",
    ],
    accent: "from-emerald-500 to-teal-700",
    badge: "💎",
  },
];

function tierFor(count: number): TierDef {
  for (const t of TIERS) {
    if (count >= t.min && count <= t.max) return t;
  }
  return TIERS[0];
}

function nextTier(count: number): TierDef | null {
  const current = tierFor(count);
  const idx = TIERS.findIndex((t) => t.key === current.key);
  if (idx < 0 || idx >= TIERS.length - 1) return null;
  return TIERS[idx + 1];
}

/* ------------------------------------------------------------------ */
/* Active campaigns                                                    */
/* ------------------------------------------------------------------ */

const CAMPAIGNS = [
  {
    id: "welcome-2024",
    title: "Welcome bonus",
    description: "Earn ₦500 when you fund your wallet for the first time.",
    rewardKobo: 50_000,
    endsIn: "Ongoing",
    endsAt: null as string | null,
    progress: 0.65,
    goalCount: 1000,
    currentCount: 648,
  },
  {
    id: "referral-boost",
    title: "Refer & earn",
    description: "Get ₦1,000 for every friend who verifies their KYC.",
    rewardKobo: 100_000,
    endsIn: "Ongoing",
    endsAt: null as string | null,
    progress: 0.42,
    goalCount: 5000,
    currentCount: 2100,
  },
  {
    id: "summer-savings",
    title: "Summer savings challenge",
    description: "Save ₦100,000 in a locked goal and earn 12% p.a.",
    rewardKobo: 0,
    endsIn: "31 days",
    endsAt: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
    progress: 0.78,
    goalCount: 500,
    currentCount: 389,
  },
  {
    id: "platinum-launch",
    title: "Platinum launch promo",
    description: "Reach Platinum tier this month for a ₦5,000 bonus.",
    rewardKobo: 500_000,
    endsIn: "14 days",
    endsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    progress: 0.23,
    goalCount: 100,
    currentCount: 23,
  },
];

/* ------------------------------------------------------------------ */
/* GET — referral dashboard with tiers + leaderboard + campaigns      */
/* ------------------------------------------------------------------ */

export async function GET() {
  try {
    const user = await requireUser();

    const referralCode = generateReferralCode(`${user.fullName}-${user.id}`);
    const shareLink = `https://turbopay.app/r/${referralCode.toLowerCase()}`;

    const recentRewards = await db.transaction.findMany({
      where: {
        userId: user.id,
        type: { in: [TxType.REWARD, TxType.REFERRAL] },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const referralTxns = await db.transaction.findMany({
      where: {
        userId: user.id,
        type: TxType.REFERRAL,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reference: true,
        amountKobo: true,
        status: true,
        counterpartyName: true,
        counterpartyAccount: true,
        description: true,
        createdAt: true,
      },
    });

    const referredUsers = referralTxns.map((t) => {
      let username = "—";
      const cpName = t.counterpartyName ?? "";
      if (cpName.startsWith("@")) username = cpName.slice(1);
      else if (cpName) username = cpName.toLowerCase().replace(/\s+/g, "");
      const verified = t.status === TxStatus.SUCCESS;
      return {
        id: t.id,
        username,
        fullName: t.counterpartyName ?? "Referred user",
        status: verified ? "VERIFIED" : "PENDING",
        dateJoined: t.createdAt,
        rewardEarned: verified ? t.amountKobo : REFERRAL_BONUS_KOBO,
        reference: t.reference,
      };
    });

    const earnedTx = await db.transaction.findMany({
      where: {
        userId: user.id,
        type: { in: [TxType.REWARD, TxType.REFERRAL] },
        direction: TxDirection.CREDIT,
        status: TxStatus.SUCCESS,
      },
      select: { amountKobo: true, type: true, createdAt: true },
    });
    const totalEarned = earnedTx.reduce((sum, t) => sum + t.amountKobo, 0);
    const totalReferrals = referralTxns.length;

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const thisMonthReferrals = referralTxns.filter(
      (t) => new Date(t.createdAt) >= monthStart
    ).length;

    const pendingReferrals = referralTxns.filter((t) => t.status !== TxStatus.SUCCESS).length;

    const wallet = await db.wallet.findUnique({
      where: { userId: user.id },
      select: { balanceKobo: true },
    });
    const availableToWithdraw = wallet?.balanceKobo ?? 0;

    /* ---- Tier progress ---- */
    const currentTier = tierFor(totalReferrals);
    const next = nextTier(totalReferrals);
    const tierProgress = next
      ? Math.min(100, ((totalReferrals - currentTier.min) / (next.min - currentTier.min)) * 100)
      : 100;
    const referralsToNextTier = next ? Math.max(0, next.min - totalReferrals) : 0;

    /* ---- Leaderboard (top 10 referrers this month) ---- */
    const monthReferralTxns = await db.transaction.findMany({
      where: {
        type: TxType.REFERRAL,
        status: TxStatus.SUCCESS,
        createdAt: { gte: monthStart },
      },
      select: {
        userId: true,
        amountKobo: true,
        counterpartyName: true,
      },
    });
    const byUser = new Map<
      string,
      { userId: string; count: number; total: number; name: string }
    >();
    for (const t of monthReferralTxns) {
      const entry = byUser.get(t.userId) ?? {
        userId: t.userId,
        count: 0,
        total: 0,
        name: t.counterpartyName ?? "Turbopay user",
      };
      entry.count += 1;
      entry.total += t.amountKobo;
      byUser.set(t.userId, entry);
    }
    const leaderboard = Array.from(byUser.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((entry, i) => ({
        rank: i + 1,
        userId: entry.userId,
        name: entry.userId === user.id ? `${entry.name} (you)` : entry.name,
        referrals: entry.count,
        earned: entry.total,
        isCurrentUser: entry.userId === user.id,
      }));

    const finalLeaderboard =
      leaderboard.length > 0
        ? leaderboard
        : [
            {
              rank: 1,
              userId: "demo-1",
              name: "Adaeze N.",
              referrals: 28,
              earned: 28 * REFERRAL_BONUS_KOBO,
              isCurrentUser: false,
            },
            {
              rank: 2,
              userId: "demo-2",
              name: "Tunde O.",
              referrals: 21,
              earned: 21 * REFERRAL_BONUS_KOBO,
              isCurrentUser: false,
            },
            {
              rank: 3,
              userId: "demo-3",
              name: "Kwame A.",
              referrals: 18,
              earned: 18 * REFERRAL_BONUS_KOBO,
              isCurrentUser: false,
            },
            {
              rank: 4,
              userId: "demo-4",
              name: "Fatima B.",
              referrals: 12,
              earned: 12 * REFERRAL_BONUS_KOBO,
              isCurrentUser: false,
            },
            {
              rank: 5,
              userId: "demo-5",
              name: "Chidi E.",
              referrals: 9,
              earned: 9 * REFERRAL_BONUS_KOBO,
              isCurrentUser: false,
            },
          ];

    const userRank = leaderboard.find((e) => e.userId === user.id)?.rank ?? null;

    await audit({
      userId: user.id,
      action: "REWARDS_VIEWED",
      category: "USER",
    });

    return json({
      referralCode,
      shareLink,
      bonusAmountKobo: REFERRAL_BONUS_KOBO,
      stats: {
        totalReferrals,
        thisMonthReferrals,
        pendingReferrals,
        totalEarned,
        availableToWithdraw,
        activeCampaigns: CAMPAIGNS.length,
      },
      referredUsers,
      recentRewards,
      campaigns: CAMPAIGNS,
      referralTier: {
        current: {
          key: currentTier.key,
          label: currentTier.label,
          badge: currentTier.badge,
          accent: currentTier.accent,
          perks: currentTier.perks,
          min: currentTier.min,
          max: currentTier.max === Number.MAX_SAFE_INTEGER ? null : currentTier.max,
        },
        next: next
          ? {
              key: next.key,
              label: next.label,
              badge: next.badge,
              accent: next.accent,
              perks: next.perks,
              min: next.min,
            }
          : null,
        progress: Number(tierProgress.toFixed(1)),
        referralsToNextTier,
      },
      tierProgress: Number(tierProgress.toFixed(1)),
      leaderboard: finalLeaderboard,
      userRank,
    });
  } catch (e) {
    return handleError(e);
  }
}

/* ------------------------------------------------------------------ */
/* POST — claim pending referral rewards                              */
/* ------------------------------------------------------------------ */

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { action?: string };

    if (body.action !== "claim") {
      throw new ServiceError("Action must be 'claim'", 400, "INVALID_ACTION");
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentReferralSuccesses = await db.transaction.findMany({
      where: {
        userId: user.id,
        type: TxType.REFERRAL,
        status: TxStatus.SUCCESS,
        direction: TxDirection.CREDIT,
        createdAt: { gte: sevenDaysAgo },
      },
      select: { id: true, reference: true, amountKobo: true },
    });

    if (recentReferralSuccesses.length === 0) {
      return json({
        ok: true,
        claimed: 0,
        amountKobo: 0,
        message: "No pending rewards to claim.",
      });
    }

    const claimedRefs = new Set<string>();
    const existingClaims = await db.transaction.findMany({
      where: {
        userId: user.id,
        type: TxType.REWARD,
        direction: TxDirection.CREDIT,
        provider: "referral-claim",
      },
      select: { providerRef: true },
    });
    for (const c of existingClaims) {
      if (c.providerRef) claimedRefs.add(c.providerRef);
    }

    const claimable = recentReferralSuccesses.filter((t) => !claimedRefs.has(t.reference));
    if (claimable.length === 0) {
      return json({
        ok: true,
        claimed: 0,
        amountKobo: 0,
        message: "All recent rewards have already been claimed.",
      });
    }

    const totalClaimKobo = claimable.reduce((s, t) => s + t.amountKobo, 0);

    const claimRef = generateReference("RWD");
    const { newBalance } = await creditWallet({
      userId: user.id,
      amountKobo: totalClaimKobo,
      refType: "REWARD",
      refId: claimRef,
      description: `Claimed ${claimable.length} referral reward${claimable.length === 1 ? "" : "s"}`,
    });

    await db.transaction.create({
      data: {
        userId: user.id,
        walletId: (await db.wallet.findUnique({ where: { userId: user.id } }))?.id ?? null,
        reference: claimRef,
        type: TxType.REWARD,
        direction: TxDirection.CREDIT,
        amountKobo: totalClaimKobo,
        feeKobo: 0,
        status: TxStatus.SUCCESS,
        state: "SETTLED",
        counterpartyName: "Turbopay Rewards",
        description: `Claimed ${claimable.length} referral reward${claimable.length === 1 ? "" : "s"}`,
        provider: "referral-claim",
        providerRef: claimable[0].reference,
        metadata: JSON.stringify({
          claimedReferences: claimable.map((c) => c.reference),
          count: claimable.length,
        }),
      },
    });

    await audit({
      userId: user.id,
      action: "REFERRAL_REWARD_CLAIMED",
      category: "WALLET",
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      metadata: {
        claimReference: claimRef,
        count: claimable.length,
        amountKobo: totalClaimKobo,
      },
    });

    return json({
      ok: true,
      claimed: claimable.length,
      amountKobo: totalClaimKobo,
      newBalance,
      reference: claimRef,
      message: `Claimed ${claimable.length} reward${claimable.length === 1 ? "" : "s"} successfully!`,
    });
  } catch (e) {
    return handleError(e);
  }
}
