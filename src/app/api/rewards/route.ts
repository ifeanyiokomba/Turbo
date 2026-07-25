import { db } from "@/lib/db";
import { json, handleError, requireUser, audit } from "@/lib/api";
import { generateReferralCode } from "@/lib/auth";
import { TxType, TxDirection, TxStatus } from "@/lib/constants";

const CAMPAIGNS = [
  {
    id: "welcome-2024",
    title: "Welcome bonus",
    description: "Earn ₦500 when you fund your wallet for the first time.",
    rewardKobo: 50_000,
    endsIn: "Ongoing",
  },
  {
    id: "referral-boost",
    title: "Refer & earn",
    description: "Get ₦1,000 for every friend who verifies their KYC.",
    rewardKobo: 100_000,
    endsIn: "Ongoing",
  },
  {
    id: "summer-savings",
    title: "Summer savings challenge",
    description: "Save ₦100,000 in a locked goal and earn 12% p.a.",
    rewardKobo: 0,
    endsIn: "31 days",
  },
];

// Referral bonus earned when a referred friend verifies KYC (in kobo)
const REFERRAL_BONUS_KOBO = 50_000;

export async function GET() {
  try {
    const user = await requireUser();

    // Deterministic referral code for this user (fullName + id seed)
    const referralCode = generateReferralCode(`${user.fullName}-${user.id}`);
    const shareLink = `https://turbopay.app/r/${referralCode.toLowerCase()}`;

    // Recent rewards — last 10 REWARD or REFERRAL transactions
    const recentRewards = await db.transaction.findMany({
      where: {
        userId: user.id,
        type: { in: [TxType.REWARD, TxType.REFERRAL] },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // All REFERRAL transactions (the user is the referrer receiving the bonus).
    // The counterpartyName holds the referred user's display name (set when the
    // bonus was credited). A SUCCESS status means KYC verified; PENDING means
    // the referred user has registered but not yet verified.
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
      // Try to extract a username from the description or counterparty
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

    // Total earned from REFERRAL+REWARD (successful credits only)
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

    // This month's referrals
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const thisMonthReferrals = referralTxns.filter(
      (t) => new Date(t.createdAt) >= monthStart,
    ).length;

    // Pending referrals — registered but not yet verified (PENDING transactions)
    const pendingReferrals = referralTxns.filter(
      (t) => t.status !== TxStatus.SUCCESS,
    ).length;

    // Available to withdraw — current wallet balance (rewards are credited to wallet)
    const wallet = await db.wallet.findUnique({
      where: { userId: user.id },
      select: { balanceKobo: true },
    });
    const availableToWithdraw = wallet?.balanceKobo ?? 0;

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
    });
  } catch (e) {
    return handleError(e);
  }
}
