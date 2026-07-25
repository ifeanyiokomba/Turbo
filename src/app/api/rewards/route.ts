import { db } from "@/lib/db";
import { json, handleError, requireUser } from "@/lib/api";
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

export async function GET() {
  try {
    const user = await requireUser();

    // Deterministic referral code for this user (fullName + id seed)
    const referralCode = generateReferralCode(`${user.fullName}-${user.id}`);
    const shareLink = `https://turbopay.app/r/${referralCode.toLowerCase()}`;

    // Rewards history — last 20 REWARD or REFERRAL transactions
    const rewards = await db.transaction.findMany({
      where: {
        userId: user.id,
        type: { in: [TxType.REWARD, TxType.REFERRAL] },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Total earned from REFERRAL+REWARD (successful credits only)
    const earnedTx = await db.transaction.findMany({
      where: {
        userId: user.id,
        type: { in: [TxType.REWARD, TxType.REFERRAL] },
        direction: TxDirection.CREDIT,
        status: TxStatus.SUCCESS,
      },
      select: { amountKobo: true, type: true },
    });
    const totalEarned = earnedTx.reduce((sum, t) => sum + t.amountKobo, 0);
    const totalReferrals = earnedTx.filter((t) => t.type === TxType.REFERRAL).length;

    return json({
      referralCode,
      shareLink,
      stats: {
        totalReferrals,
        totalEarned,
        activeCampaigns: CAMPAIGNS.length,
      },
      campaigns: CAMPAIGNS,
      rewards,
    });
  } catch (e) {
    return handleError(e);
  }
}
