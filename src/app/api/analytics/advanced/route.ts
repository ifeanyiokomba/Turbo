// Turbopay analytics — advanced financial analytics
//
// GET ?period=30d|90d|1y
//   Returns a comprehensive analytics payload for the requested window:
//     - Cash flow statement (income / expense / net / by category)
//     - Spending velocity (avg daily spend, WoW, MoM)
//     - Financial health score (0-100) with 4 contributing factors
//     - Predictions (projected month-end balance, savings, burn rate days)
//     - Top 5 merchants by volume
//     - Category trends (which categories are up/down MoM)
//     - Day-of-month spending pattern (1-31)
//     - Peer comparison vs mock Turbopay benchmarks

import { db } from "@/lib/db";
import { json, handleError, requireUser } from "@/lib/api";

export const dynamic = "force-dynamic";

type Period = "30d" | "90d" | "1y";

function periodDays(p: Period): number {
  if (p === "1y") return 365;
  if (p === "90d") return 90;
  return 30;
}

// Curated peer benchmarks — what the average Turbopay user spends.
// Numbers are monthly averages in kobo of NGN.
const PEER_BENCHMARKS = {
  default: {
    avgMonthlySpend: 185_000_00, // ₦185,000
    avgAirtime: 12_500_00,
    avgBills: 38_000_00,
    avgTransfer: 64_000_00,
    avgSavingsRatePct: 11,
  },
} as const;

const TX_TYPE_LABELS: Record<string, string> = {
  FUNDING: "Funding",
  TRANSFER: "Transfer",
  AIRTIME: "Airtime",
  DATA: "Data",
  BILL: "Bills",
  CARD_FUND: "Card topup",
  CARD_WITHDRAW: "Card withdraw",
  REWARD: "Reward",
  REFERRAL: "Referral",
  SAVINGS_DEPOSIT: "Savings",
  SAVINGS_WITHDRAW: "Savings",
  INVESTMENT: "Investment",
};

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const periodParam = String(url.searchParams.get("period") ?? "30d");
    const period: Period =
      periodParam === "1y" || periodParam === "90d" ? (periodParam as Period) : "30d";
    const days = periodDays(period);

    const now = new Date();
    const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    periodStart.setHours(0, 0, 0, 0);

    // ---- Fetch wallet + transactions for the period ----
    const [wallet, txns] = await Promise.all([
      db.wallet.findUnique({ where: { userId: user.id } }),
      db.transaction.findMany({
        where: { userId: user.id, createdAt: { gte: periodStart }, status: "SUCCESS" },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const currentBalanceKobo = wallet?.balanceKobo ?? 0;

    // ---- Cash flow statement ----
    let totalIncome = 0;
    let totalExpense = 0;
    const incomeByCat: Record<string, number> = {};
    const expenseByCat: Record<string, number> = {};
    const byCounterparty: Record<string, { name: string; count: number; total: number }> = {};
    const dayOfMonthSpend: number[] = new Array(31).fill(0);
    const dailySpend: Map<string, number> = new Map();

    for (const t of txns) {
      const isCredit = t.direction === "CREDIT";
      if (isCredit) {
        totalIncome += t.amountKobo;
        incomeByCat[t.type] = (incomeByCat[t.type] ?? 0) + t.amountKobo;
      } else {
        totalExpense += t.amountKobo;
        expenseByCat[t.type] = (expenseByCat[t.type] ?? 0) + t.amountKobo;
        const dom = new Date(t.createdAt).getDate() - 1; // 0-30
        dayOfMonthSpend[dom] += t.amountKobo;
        const dayKey = new Date(t.createdAt).toISOString().slice(0, 10);
        dailySpend.set(dayKey, (dailySpend.get(dayKey) ?? 0) + t.amountKobo);
      }
      const cpName = t.counterpartyName || t.description || TX_TYPE_LABELS[t.type] || t.type;
      if (cpName) {
        if (!byCounterparty[cpName]) byCounterparty[cpName] = { name: cpName, count: 0, total: 0 };
        byCounterparty[cpName].count++;
        byCounterparty[cpName].total += t.amountKobo;
      }
    }

    // ---- Top 5 merchants ----
    const topMerchants = Object.values(byCounterparty)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map((m) => ({ name: m.name, count: m.count, total: m.total }));

    // ---- Spending velocity ----
    const periodDaysActual = Math.max(1, days);
    const avgDailySpend = Math.round(totalExpense / periodDaysActual);

    // This week vs last week
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    let thisWeekSpend = 0;
    let lastWeekSpend = 0;
    for (const t of txns) {
      if (t.direction === "DEBIT") {
        const d = new Date(t.createdAt);
        if (d >= weekAgo) thisWeekSpend += t.amountKobo;
        else if (d >= twoWeeksAgo) lastWeekSpend += t.amountKobo;
      }
    }
    const weekChangePct =
      lastWeekSpend > 0
        ? Math.round(((thisWeekSpend - lastWeekSpend) / lastWeekSpend) * 100)
        : thisWeekSpend > 0
          ? 100
          : 0;

    // This month vs last month (calendar months)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    let thisMonthSpend = 0;
    let lastMonthSpend = 0;
    for (const t of txns) {
      if (t.direction !== "DEBIT") continue;
      const d = new Date(t.createdAt);
      if (d >= monthStart) thisMonthSpend += t.amountKobo;
      else if (d >= lastMonthStart && d <= lastMonthEnd) lastMonthSpend += t.amountKobo;
    }
    const monthChangePct =
      lastMonthSpend > 0
        ? Math.round(((thisMonthSpend - lastMonthSpend) / lastMonthSpend) * 100)
        : thisMonthSpend > 0
          ? 100
          : 0;

    // ---- Category trends (MoM) ----
    const thisMonthCats: Record<string, number> = {};
    const lastMonthCats: Record<string, number> = {};
    for (const t of txns) {
      if (t.direction !== "DEBIT") continue;
      const d = new Date(t.createdAt);
      if (d >= monthStart) thisMonthCats[t.type] = (thisMonthCats[t.type] ?? 0) + t.amountKobo;
      else if (d >= lastMonthStart && d <= lastMonthEnd)
        lastMonthCats[t.type] = (lastMonthCats[t.type] ?? 0) + t.amountKobo;
    }
    const allCats = new Set([...Object.keys(thisMonthCats), ...Object.keys(lastMonthCats)]);
    const categoryTrends = Array.from(allCats)
      .map((cat) => {
        const thisM = thisMonthCats[cat] ?? 0;
        const lastM = lastMonthCats[cat] ?? 0;
        const changePct =
          lastM > 0 ? Math.round(((thisM - lastM) / lastM) * 100) : thisM > 0 ? 100 : 0;
        return {
          category: cat,
          label: TX_TYPE_LABELS[cat] ?? cat,
          thisMonthKobo: thisM,
          lastMonthKobo: lastM,
          changePct,
          direction: changePct > 0 ? "up" : changePct < 0 ? "down" : "flat",
        } as const;
      })
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

    // ---- Savings balance (across all time) from SavingsTransaction for accuracy ----
    let savingsBalanceKobo = 0;
    try {
      const allSavingsTxns = await db.savingsTransaction.findMany({
        where: { userId: user.id },
        select: { type: true, amountKobo: true },
      });
      let dep = 0;
      let wit = 0;
      for (const s of allSavingsTxns) {
        if (s.type === "DEPOSIT") dep += s.amountKobo;
        else if (s.type === "WITHDRAW") wit += s.amountKobo;
      }
      savingsBalanceKobo = Math.max(0, dep - wit);
    } catch {
      /* non-fatal */
    }

    // ---- Predictions ----
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
    void daysLeft;

    // Use this-month-so-far to estimate remaining spend/income.
    const daysSoFar = Math.max(1, dayOfMonth);
    const projectedMonthIncome = Math.round((totalIncome / periodDaysActual) * daysInMonth);
    const projectedMonthExpense = Math.round((thisMonthSpend / daysSoFar) * daysInMonth);
    const projectedMonthEndBalance =
      currentBalanceKobo +
      (projectedMonthIncome - totalIncome) -
      (projectedMonthExpense - totalExpense);
    const projectedMonthlySavings = Math.max(0, projectedMonthIncome - projectedMonthExpense);

    // Burn rate: how many days until wallet hits 0 at current net daily outflow.
    const netDailyFlow = (totalIncome - totalExpense) / periodDaysActual;
    let burnRateDays: number | null = null;
    if (netDailyFlow < 0) {
      burnRateDays = Math.floor(currentBalanceKobo / Math.abs(netDailyFlow));
    }

    // ---- Financial Health Score (0-100) ----
    // Four factors, weighted:
    //   1) Savings rate      — (income − expense) / income  → 0-30 pts
    //   2) Spending stability — inverse of coefficient of variation of daily spend → 0-25 pts
    //   3) Emergency fund    — savings balance / monthly expense (3 months = 100%) → 0-25 pts
    //   4) Bill consistency  — recurring bill payments are steady (low variance) → 0-20 pts
    const savingsRatePct = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;
    const savingsRatePts = Math.max(0, Math.min(30, (savingsRatePct / 20) * 30)); // 20% savings = full 30 pts

    const dailyValues = Array.from(dailySpend.values());
    const meanDaily =
      dailyValues.length > 0 ? dailyValues.reduce((a, b) => a + b, 0) / dailyValues.length : 0;
    const variance =
      dailyValues.length > 0
        ? dailyValues.reduce((sum, v) => sum + Math.pow(v - meanDaily, 2), 0) / dailyValues.length
        : 0;
    const stdDev = Math.sqrt(variance);
    const cv = meanDaily > 0 ? stdDev / meanDaily : 1; // 0 = perfectly stable, 1+ = erratic
    const stabilityPts = Math.max(0, Math.min(25, (1 - Math.min(1, cv)) * 25));

    const monthlyExpense = totalExpense / (days / 30);
    const emergencyFundRatio = monthlyExpense > 0 ? savingsBalanceKobo / (monthlyExpense * 3) : 0;
    const emergencyFundPts = Math.max(0, Math.min(25, emergencyFundRatio * 25));

    // Bill consistency — variance of monthly bill totals (proxy: count of distinct bill payment days)
    const billTxns = txns.filter((t) => t.type === "BILL" && t.direction === "DEBIT");
    const billDays = new Set(billTxns.map((t) => new Date(t.createdAt).toISOString().slice(0, 10)));
    const billConsistencyPts =
      billTxns.length === 0
        ? 10 // neutral when no bill history
        : Math.min(20, Math.round((billDays.size / Math.max(1, billTxns.length)) * 20));

    const healthScore = Math.round(
      savingsRatePts + stabilityPts + emergencyFundPts + billConsistencyPts
    );
    const letterGrade =
      healthScore >= 85
        ? "A"
        : healthScore >= 70
          ? "B"
          : healthScore >= 55
            ? "C"
            : healthScore >= 40
              ? "D"
              : "E";

    // ---- Peer comparison ----
    const peer = PEER_BENCHMARKS.default;
    const peerMonthlySpend = monthlyExpense;
    const spendVsPeerPct =
      peer.avgMonthlySpend > 0
        ? Math.round(((peerMonthlySpend - peer.avgMonthlySpend) / peer.avgMonthlySpend) * 100)
        : 0;
    const airtimeVsPeerPct =
      peer.avgAirtime > 0
        ? Math.round(
            (((expenseByCat["AIRTIME"] ?? 0) / (days / 30) - peer.avgAirtime) / peer.avgAirtime) *
              100
          )
        : 0;
    const billsVsPeerPct =
      peer.avgBills > 0
        ? Math.round(
            (((expenseByCat["BILL"] ?? 0) / (days / 30) - peer.avgBills) / peer.avgBills) * 100
          )
        : 0;
    const savingsVsPeerPct = savingsRatePct - peer.avgSavingsRatePct;

    const peerComparison = {
      monthlySpend: {
        you: Math.round(monthlyExpense),
        peer: peer.avgMonthlySpend,
        diffPct: spendVsPeerPct,
        label: "Monthly spend",
        better: spendVsPeerPct < 0,
      },
      airtime: {
        you: Math.round((expenseByCat["AIRTIME"] ?? 0) / (days / 30)),
        peer: peer.avgAirtime,
        diffPct: airtimeVsPeerPct,
        label: "Airtime",
        better: airtimeVsPeerPct < 0,
      },
      bills: {
        you: Math.round((expenseByCat["BILL"] ?? 0) / (days / 30)),
        peer: peer.avgBills,
        diffPct: billsVsPeerPct,
        label: "Bills",
        better: billsVsPeerPct < 0,
      },
      savingsRate: {
        you: Math.round(savingsRatePct),
        peer: peer.avgSavingsRatePct,
        diffPct: Math.round(savingsVsPeerPct),
        label: "Savings rate",
        better: savingsVsPeerPct > 0,
      },
    };

    // ---- Cash flow by category ----
    const cashFlowByCategory = Array.from(
      new Set([...Object.keys(incomeByCat), ...Object.keys(expenseByCat)])
    )
      .map((cat) => ({
        category: cat,
        label: TX_TYPE_LABELS[cat] ?? cat,
        income: incomeByCat[cat] ?? 0,
        expense: expenseByCat[cat] ?? 0,
        net: (incomeByCat[cat] ?? 0) - (expenseByCat[cat] ?? 0),
      }))
      .sort((a, b) => b.income + b.expense - (a.income + a.expense));

    return json({
      period,
      generatedAt: now.toISOString(),
      cashFlow: {
        totalIncome,
        totalExpense,
        netFlow: totalIncome - totalExpense,
        byCategory: cashFlowByCategory,
      },
      spendingVelocity: {
        avgDailySpend,
        thisWeekSpend,
        lastWeekSpend,
        weekChangePct,
        thisMonthSpend,
        lastMonthSpend,
        monthChangePct,
      },
      financialHealth: {
        score: healthScore,
        letterGrade,
        factors: [
          {
            key: "savings_rate",
            label: "Savings rate",
            points: Math.round(savingsRatePts),
            maxPoints: 30,
            detail: `${Math.max(0, Math.round(savingsRatePct))}% of income saved`,
          },
          {
            key: "spending_stability",
            label: "Spending stability",
            points: Math.round(stabilityPts),
            maxPoints: 25,
            detail:
              cv < 0.5 ? "Steady spending pattern" : "Spending varies significantly day-to-day",
          },
          {
            key: "emergency_fund",
            label: "Emergency fund",
            points: Math.round(emergencyFundPts),
            maxPoints: 25,
            detail: `${(emergencyFundRatio * 3).toFixed(1)} months of expenses covered`,
          },
          {
            key: "bill_consistency",
            label: "Bill consistency",
            points: Math.round(billConsistencyPts),
            maxPoints: 20,
            detail: `${billDays.size} bill payment days`,
          },
        ],
      },
      predictions: {
        projectedMonthEndBalance,
        projectedMonthlySavings,
        projectedMonthIncome,
        projectedMonthExpense,
        burnRateDays,
        netDailyFlow: Math.round(netDailyFlow),
      },
      topMerchants,
      categoryTrends,
      dayOfMonthSpend: dayOfMonthSpend.map((total, idx) => ({ day: idx + 1, total })),
      peerComparison,
      currentBalanceKobo,
      savingsBalanceKobo,
      txCount: txns.length,
    });
  } catch (e) {
    return handleError(e);
  }
}
