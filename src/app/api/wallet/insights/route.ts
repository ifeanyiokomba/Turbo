import { db } from "@/lib/db";
import { json, handleError, requireUser } from "@/lib/api";

// Recurring expense counterparty group
interface RecurringExpense {
  counterpartyName: string;
  averageAmountKobo: number;
  totalAmountKobo: number;
  count: number;
  frequency: "WEEKLY" | "MONTHLY" | "IRREGULAR";
  lastOccurrence: string; // ISO date
  firstOccurrence: string; // ISO date
}

interface IncomeSource {
  type: string; // FUNDING | REFERRAL | REWARD
  label: string;
  amountKobo: number;
  count: number;
}

interface InsightsResponse {
  currentBalance: number;
  avgMonthlyIncome: number;
  avgMonthlyExpense: number;
  projectedMonthEndBalance: number;
  burnRateDays: number | null; // null = infinite (income >= expense)
  savingsRatePct: number | null; // null when no income
  recurringExpenses: RecurringExpense[];
  spendingTrendPct: number | null; // this month vs last month
  incomeSources: IncomeSource[];
}

const INCOME_TYPES = new Set(["FUNDING", "REFERRAL", "REWARD"]);
const INCOME_LABELS: Record<string, string> = {
  FUNDING: "Funding",
  REFERRAL: "Referral bonus",
  REWARD: "Rewards",
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function monthsBetween(a: Date, b: Date): number {
  // Fractional months from a → b (positive = b is later)
  const ms = b.getTime() - a.getTime();
  return ms / (MS_PER_DAY * 30);
}

export async function GET() {
  try {
    const user = await requireUser();

    const wallet = await db.wallet.findUnique({ where: { userId: user.id } });
    const currentBalance = wallet?.balanceKobo ?? 0;

    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const lastMonthStart = new Date(thisMonthStart);
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);

    // Look back 3 calendar months for averages
    const threeMonthsAgo = new Date(thisMonthStart);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    // 90-day window for recurring-expense detection
    const ninetyDaysAgo = new Date(now.getTime() - 90 * MS_PER_DAY);

    const [
      last3MonthsTxns,
      thisMonthTxns,
      lastMonthTxns,
      last90DaysDebitTxns,
      incomeBreakdownTxns,
    ] = await Promise.all([
      db.transaction.findMany({
        where: {
          userId: user.id,
          status: "SUCCESS",
          createdAt: { gte: threeMonthsAgo },
        },
        select: {
          type: true,
          direction: true,
          amountKobo: true,
          createdAt: true,
        },
      }),
      db.transaction.findMany({
        where: {
          userId: user.id,
          status: "SUCCESS",
          direction: "DEBIT",
          createdAt: { gte: thisMonthStart },
        },
        select: { amountKobo: true },
      }),
      db.transaction.findMany({
        where: {
          userId: user.id,
          status: "SUCCESS",
          direction: "DEBIT",
          createdAt: { gte: lastMonthStart, lt: thisMonthStart },
        },
        select: { amountKobo: true },
      }),
      db.transaction.findMany({
        where: {
          userId: user.id,
          status: "SUCCESS",
          direction: "DEBIT",
          createdAt: { gte: ninetyDaysAgo },
        },
        select: {
          id: true,
          amountKobo: true,
          counterpartyName: true,
          type: true,
          createdAt: true,
        },
      }),
      db.transaction.findMany({
        where: {
          userId: user.id,
          status: "SUCCESS",
          direction: "CREDIT",
          type: { in: ["FUNDING", "REFERRAL", "REWARD"] },
          createdAt: { gte: threeMonthsAgo },
        },
        select: { type: true, amountKobo: true },
      }),
    ]);

    // --- Averages over the last 3 months ---
    let income3mo = 0;
    let expense3mo = 0;
    for (const t of last3MonthsTxns) {
      if (t.direction === "CREDIT" && INCOME_TYPES.has(t.type)) {
        income3mo += t.amountKobo;
      } else if (t.direction === "DEBIT") {
        expense3mo += t.amountKobo;
      }
    }
    const avgMonthlyIncome = Math.round(income3mo / 3);
    const avgMonthlyExpense = Math.round(expense3mo / 3);

    // --- Projected month-end balance ---
    // currentBalance + prorated remaining income − prorated remaining expense
    const daysInMonth = new Date(
      thisMonthStart.getFullYear(),
      thisMonthStart.getMonth() + 1,
      0,
    ).getDate();
    const dayOfMonth = now.getDate();
    const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
    const dailyIncome = avgMonthlyIncome / daysInMonth;
    const dailyExpense = avgMonthlyExpense / daysInMonth;
    const projectedMonthEndBalance = Math.round(
      currentBalance + dailyIncome * daysLeft - dailyExpense * daysLeft,
    );

    // --- Burn rate: days until wallet hits 0 ---
    const netDaily = dailyIncome - dailyExpense;
    let burnRateDays: number | null;
    if (netDaily >= 0) {
      burnRateDays = null; // wallet is growing or stable
    } else if (currentBalance <= 0) {
      burnRateDays = 0;
    } else {
      burnRateDays = Math.floor(currentBalance / -netDaily);
    }

    // --- Savings rate ---
    let savingsRatePct: number | null;
    if (avgMonthlyIncome > 0) {
      savingsRatePct = Math.round(
        ((avgMonthlyIncome - avgMonthlyExpense) / avgMonthlyIncome) * 100,
      );
    } else {
      savingsRatePct = null;
    }

    // --- Recurring expenses ---
    // Group by counterparty name + similar amount (within 5% of median).
    const groups = new Map<string, { amount: number; date: Date; id: string }[]>();
    for (const t of last90DaysDebitTxns) {
      const key = (t.counterpartyName ?? "").trim() || `__type:${t.type}`;
      if (!key) continue;
      const arr = groups.get(key) ?? [];
      arr.push({ amount: t.amountKobo, date: t.createdAt, id: t.id });
      groups.set(key, arr);
    }

    const recurringExpenses: RecurringExpense[] = [];
    for (const [name, entries] of groups.entries()) {
      if (entries.length < 2) continue;
      const amounts = entries.map((e) => e.amount).sort((a, b) => a - b);
      const median = amounts[Math.floor(amounts.length / 2)];
      // Within 5% of median counts as "same/similar amount"
      const similar = entries.filter(
        (e) => Math.abs(e.amount - median) <= median * 0.05,
      );
      if (similar.length < 2) continue;

      const totalAmountKobo = similar.reduce((s, e) => s + e.amount, 0);
      const averageAmountKobo = Math.round(totalAmountKobo / similar.length);
      const sortedByDate = [...similar].sort(
        (a, b) => a.date.getTime() - b.date.getTime(),
      );
      const first = sortedByDate[0].date;
      const last = sortedByDate[sortedByDate.length - 1].date;

      // Frequency: average gap between occurrences
      let frequency: RecurringExpense["frequency"] = "IRREGULAR";
      if (similar.length >= 2) {
        const spanDays = (last.getTime() - first.getTime()) / MS_PER_DAY;
        const gapDays = spanDays / (similar.length - 1);
        if (gapDays >= 6 && gapDays <= 8) frequency = "WEEKLY";
        else if (gapDays >= 27 && gapDays <= 33) frequency = "MONTHLY";
      }

      recurringExpenses.push({
        counterpartyName: name.startsWith("__type:") ? "Uncategorised" : name,
        averageAmountKobo,
        totalAmountKobo,
        count: similar.length,
        frequency,
        lastOccurrence: last.toISOString(),
        firstOccurrence: first.toISOString(),
      });
    }
    recurringExpenses.sort((a, b) => b.totalAmountKobo - a.totalAmountKobo);
    recurringExpenses.splice(3); // top 3

    // --- Spending trend: this month vs last month ---
    const thisMonthSpend = thisMonthTxns.reduce((s, t) => s + t.amountKobo, 0);
    const lastMonthSpend = lastMonthTxns.reduce((s, t) => s + t.amountKobo, 0);
    let spendingTrendPct: number | null;
    if (lastMonthSpend === 0) {
      spendingTrendPct = thisMonthSpend > 0 ? 100 : 0;
    } else {
      spendingTrendPct = Math.round(
        ((thisMonthSpend - lastMonthSpend) / lastMonthSpend) * 100,
      );
    }

    // --- Income sources breakdown (last 3 months) ---
    const sourceMap = new Map<string, { amountKobo: number; count: number }>();
    for (const t of incomeBreakdownTxns) {
      const entry = sourceMap.get(t.type) ?? { amountKobo: 0, count: 0 };
      entry.amountKobo += t.amountKobo;
      entry.count += 1;
      sourceMap.set(t.type, entry);
    }
    const incomeSources: IncomeSource[] = [];
    for (const type of ["FUNDING", "REFERRAL", "REWARD"]) {
      const entry = sourceMap.get(type);
      incomeSources.push({
        type,
        label: INCOME_LABELS[type] ?? type,
        amountKobo: entry?.amountKobo ?? 0,
        count: entry?.count ?? 0,
      });
    }

    const response: InsightsResponse = {
      currentBalance,
      avgMonthlyIncome,
      avgMonthlyExpense,
      projectedMonthEndBalance,
      burnRateDays,
      savingsRatePct,
      recurringExpenses,
      spendingTrendPct,
      incomeSources,
    };

    return json(response);
  } catch (e) {
    return handleError(e);
  }
}
