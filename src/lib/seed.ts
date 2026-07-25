// Turbopay seed — create admin + savings/investment products + tier limits + turbocore platform

import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { seedTurboCore } from "@/lib/turbocore/seed";

export async function ensureSeed() {
  // KYC tier limits
  for (const [tier, cfg] of Object.entries({
    1: { label: "Starter", singleTxLimitKobo: 5_000_000, dailyLimitKobo: 15_000_000, maxBalanceKobo: 30_000_000 },
    2: { label: "Verified", singleTxLimitKobo: 50_000_000, dailyLimitKobo: 200_000_000, maxBalanceKobo: 500_000_000 },
    3: { label: "Premium", singleTxLimitKobo: 500_000_000, dailyLimitKobo: 2_000_000_000, maxBalanceKobo: 1_000_000_000 },
  })) {
    await db.kycTierLimit.upsert({
      where: { tier: Number(tier) },
      create: { id: Number(tier), tier: Number(tier), ...cfg },
      update: { ...cfg },
    });
  }

  // Admin account (demo)
  const adminEmail = "admin@turbopay.ng";
  const existingAdmin = await db.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const admin = await db.user.create({
      data: {
        fullName: "Turbopay Admin",
        username: "admin",
        email: adminEmail,
        phone: "08000000000",
        passwordHash: hashPassword("Admin@1234"),
        role: "ADMIN",
        kycTier: 3,
        kycStatus: "VERIFIED",
        emailVerified: true,
        phoneVerified: true,
      },
    });
    await db.wallet.create({ data: { userId: admin.id, balanceKobo: 0 } });
  }

  // Savings products
  const savingsCount = await db.savingsProduct.count();
  if (savingsCount === 0) {
    await db.savingsProduct.createMany({
      data: [
        { name: "Flex Vault", type: "FLEXIBLE", interestBps: 200, minAmountKobo: 1_000, lockDays: 0, description: "Withdraw anytime. Earn 2% p.a." },
        { name: "90-Day Lock", type: "LOCKED", interestBps: 800, minAmountKobo: 5_000, lockDays: 90, description: "Lock for 90 days. Earn 8% p.a." },
        { name: "180-Day Lock", type: "LOCKED", interestBps: 1200, minAmountKobo: 10_000, lockDays: 180, description: "Lock for 180 days. Earn 12% p.a." },
        { name: "Goal Saver", type: "TARGET", interestBps: 500, minAmountKobo: 1_000, lockDays: 0, description: "Set a target. Earn 5% p.a." },
        { name: "Turbo Max", type: "LOCKED", interestBps: 1800, minAmountKobo: 50_000, lockDays: 365, description: "Max returns. 18% p.a. for 1 year." },
      ],
    });
  }

  // Investment products
  const investCount = await db.investmentProduct.count();
  if (investCount === 0) {
    await db.investmentProduct.createMany({
      data: [
        { name: "T-Bill 91-Day", type: "TBILL", riskLevel: "LOW", minAmountKobo: 50_000, maxAmountKobo: 5_000_000, expectedReturnBps: 1500, durationLabel: "91 days", provider: "CBN" },
        { name: "Fixed Income 6M", type: "FIXED_INCOME", riskLevel: "LOW", minAmountKobo: 100_000, maxAmountKobo: 10_000_000, expectedReturnBps: 1300, durationLabel: "6 months", provider: "Turbopay" },
        { name: "Agri Fund", type: "MUTUAL_FUND", riskLevel: "MEDIUM", minAmountKobo: 25_000, maxAmountKobo: 2_000_000, expectedReturnBps: 2200, durationLabel: "6 months", provider: "Turbopay Capital" },
        { name: "Tech Equity Pool", type: "MUTUAL_FUND", riskLevel: "HIGH", minAmountKobo: 100_000, maxAmountKobo: 5_000_000, expectedReturnBps: 3500, durationLabel: "1 year", provider: "Turbopay Ventures" },
        { name: "FGN Bond 2027", type: "BOND", riskLevel: "LOW", minAmountKobo: 200_000, maxAmountKobo: 20_000_000, expectedReturnBps: 1700, durationLabel: "1 year", provider: "DMO" },
      ],
    });
  }

  // TurboCore provider platform (providers, capabilities, country configs, FX config)
  await seedTurboCore().catch((e) => console.error("[seed] turbocore failed", e));
}
