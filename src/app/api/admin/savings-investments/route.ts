// Turbopay admin — aggregate savings + investments stats
//
// Returns:
//   - totalSavingsDeposits: sum of SavingsTransaction.amountKobo where type=DEPOSIT
//   - totalSavingsInterest: sum of SavingsTransaction.amountKobo where type=INTEREST
//   - activeSavers: distinct users with at least one DEPOSIT
//   - totalActiveInvestments: sum of UserInvestment.currentValueKobo where status=ACTIVE
//   - activeInvestors: distinct users holding an ACTIVE investment
//   - topSavingsProducts: top 5 by deposit volume
//   - topInvestmentProducts: top 5 by distinct ACTIVE holders

import { db } from "@/lib/db";
import { json, handleError, requireAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();

    const [
      depositsAgg,
      interestAgg,
      withdrawalsAgg,
      activeSaversAgg,
      activeInvestmentsAgg,
      activeInvestorsAgg,
      savingsProducts,
      investmentProducts,
      depositByProduct,
      activeInvestmentsByProduct,
    ] = await Promise.all([
      db.savingsTransaction.aggregate({
        _sum: { amountKobo: true },
        where: { type: "DEPOSIT" },
      }),
      db.savingsTransaction.aggregate({
        _sum: { amountKobo: true },
        where: { type: "INTEREST" },
      }),
      db.savingsTransaction.aggregate({
        _sum: { amountKobo: true },
        where: { type: "WITHDRAW" },
      }),
      db.savingsTransaction.groupBy({
        by: ["userId"],
        where: { type: "DEPOSIT" },
        _count: { _all: true },
      }),
      db.userInvestment.aggregate({
        _sum: { currentValueKobo: true, principalKobo: true },
        where: { status: "ACTIVE" },
      }),
      db.userInvestment.groupBy({
        by: ["userId"],
        where: { status: "ACTIVE" },
      }),
      db.savingsProduct.findMany(),
      db.investmentProduct.findMany(),
      db.savingsTransaction.groupBy({
        by: ["productId"],
        where: { type: "DEPOSIT" },
        _sum: { amountKobo: true },
        _count: { _all: true },
      }),
      db.userInvestment.groupBy({
        by: ["productId"],
        where: { status: "ACTIVE" },
        _count: { userId: true },
        _sum: { currentValueKobo: true, principalKobo: true },
      }),
    ]);

    // Build product lookups
    const savingsProductMap = new Map(
      savingsProducts.map((p) => [p.id, p]),
    );
    const investmentProductMap = new Map(
      investmentProducts.map((p) => [p.id, p]),
    );

    const topSavingsProducts = depositByProduct
      .map((row) => {
        const product = savingsProductMap.get(row.productId);
        if (!product) return null;
        return {
          id: product.id,
          name: product.name,
          type: product.type,
          interestBps: product.interestBps,
          lockDays: product.lockDays,
          depositCount: row._count._all,
          totalDepositsKobo: row._sum.amountKobo ?? 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.totalDepositsKobo - a.totalDepositsKobo)
      .slice(0, 5);

    const topInvestmentProducts = activeInvestmentsByProduct
      .map((row) => {
        const product = investmentProductMap.get(row.productId);
        if (!product) return null;
        return {
          id: product.id,
          name: product.name,
          type: product.type,
          riskLevel: product.riskLevel,
          provider: product.provider,
          expectedReturnBps: product.expectedReturnBps,
          holderCount: row._count.userId,
          totalValueKobo: row._sum.currentValueKobo ?? 0,
          totalPrincipalKobo: row._sum.principalKobo ?? 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.holderCount - a.holderCount)
      .slice(0, 5);

    return json({
      savings: {
        totalDepositsKobo: depositsAgg._sum.amountKobo ?? 0,
        totalInterestAccruedKobo: interestAgg._sum.amountKobo ?? 0,
        totalWithdrawalsKobo: withdrawalsAgg._sum.amountKobo ?? 0,
        activeSavers: activeSaversAgg.length,
      },
      investments: {
        totalValueKobo: activeInvestmentsAgg._sum.currentValueKobo ?? 0,
        totalPrincipalKobo: activeInvestmentsAgg._sum.principalKobo ?? 0,
        activeInvestors: activeInvestorsAgg.length,
      },
      topSavingsProducts,
      topInvestmentProducts,
    });
  } catch (e) {
    return handleError(e);
  }
}
