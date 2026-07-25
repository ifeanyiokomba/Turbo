import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { json, handleError, requireUser } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();

    // Last 30 days for trends
    const thirtyAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ninetyAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const recent = await db.transaction.findMany({
      where: { userId: user.id, createdAt: { gte: ninetyAgo }, status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
    });

    // 30-day daily buckets for income vs expense trend
    const days: { date: string; income: number; expense: number; net: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push({ date: d.toISOString().slice(0, 10), income: 0, expense: 0, net: 0 });
    }
    const dayMap = new Map(days.map((d) => [d.date, d]));

    let totalIncome30 = 0;
    let totalExpense30 = 0;
    let txCount30 = 0;
    const byCategory: Record<string, { count: number; total: number; income: number; expense: number }> = {};
    const byDayOfWeek: Record<string, { income: number; expense: number }> = {};
    const byHour: number[] = new Array(24).fill(0);
    const days30 = new Set(days.map((d) => d.date));

    for (const t of recent) {
      const day = new Date(t.createdAt);
      day.setHours(0, 0, 0, 0);
      const key = day.toISOString().slice(0, 10);
      const b = dayMap.get(key);
      if (b && days30.has(key)) {
        if (t.direction === "CREDIT") {
          b.income += t.amountKobo;
          totalIncome30 += t.amountKobo;
        } else {
          b.expense += t.amountKobo;
          totalExpense30 += t.amountKobo;
        }
        b.net = b.income - b.expense;
        txCount30++;
      }

      // category aggregation (90-day)
      const cat = t.type;
      if (!byCategory[cat]) byCategory[cat] = { count: 0, total: 0, income: 0, expense: 0 };
      byCategory[cat].count++;
      byCategory[cat].total += t.amountKobo;
      if (t.direction === "CREDIT") byCategory[cat].income += t.amountKobo;
      else byCategory[cat].expense += t.amountKobo;

      // day of week
      const dow = day.toLocaleDateString("en", { weekday: "short" });
      if (!byDayOfWeek[dow]) byDayOfWeek[dow] = { income: 0, expense: 0 };
      if (t.direction === "CREDIT") byDayOfWeek[dow].income += t.amountKobo;
      else byDayOfWeek[dow].expense += t.amountKobo;

      // hour of day (spending activity)
      byHour[day.getHours()]++;
    }

    // Top counterparties (by volume)
    const byCounterparty: Record<string, { name: string; count: number; total: number }> = {};
    for (const t of recent) {
      const name = t.counterpartyName || t.description || t.type;
      if (!name) continue;
      if (!byCounterparty[name]) byCounterparty[name] = { name, count: 0, total: 0 };
      byCounterparty[name].count++;
      byCounterparty[name].total += t.amountKobo;
    }
    const topCounterparties = Object.values(byCounterparty)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    // Weekly comparison (this week vs last week)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    let thisWeekExpense = 0;
    let lastWeekExpense = 0;
    let thisWeekIncome = 0;
    let lastWeekIncome = 0;
    for (const t of recent) {
      const tDate = new Date(t.createdAt);
      if (tDate >= weekAgo) {
        if (t.direction === "CREDIT") thisWeekIncome += t.amountKobo;
        else thisWeekExpense += t.amountKobo;
      } else if (tDate >= twoWeeksAgo) {
        if (t.direction === "CREDIT") lastWeekIncome += t.amountKobo;
        else lastWeekExpense += t.amountKobo;
      }
    }

    // Average transaction size
    const allTx30 = recent.filter((t) => new Date(t.createdAt) >= thirtyAgo);
    const avgTxSize = allTx30.length > 0 ? Math.round(allTx30.reduce((s, t) => s + t.amountKobo, 0) / allTx30.length) : 0;

    // Largest transaction (30d)
    const largest = allTx30.length > 0 ? allTx30.reduce((max, t) => (t.amountKobo > max.amountKobo ? t : max)) : null;

    // Category breakdown for pie chart
    const spendingByCategory = Object.entries(byCategory)
      .filter(([, v]) => v.expense > 0)
      .map(([name, v]) => ({ name, value: v.expense, count: v.count }))
      .sort((a, b) => b.value - a.value);

    const incomeByCategory = Object.entries(byCategory)
      .filter(([, v]) => v.income > 0)
      .map(([name, v]) => ({ name, value: v.income, count: v.count }))
      .sort((a, b) => b.value - a.value);

    // Day-of-week spending pattern
    const dowOrder = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dowData = dowOrder.map((d) => ({
      day: d,
      income: byDayOfWeek[d]?.income ?? 0,
      expense: byDayOfWeek[d]?.expense ?? 0,
    }));

    // Hour-of-day activity (for a heat strip)
    const hourData = byHour.map((count, hour) => ({ hour, count }));

    return json({
      trends: days,
      stats: {
        totalIncome30,
        totalExpense30,
        netFlow30: totalIncome30 - totalExpense30,
        txCount30,
        avgTxSize,
        thisWeekExpense,
        lastWeekExpense,
        weekChange: lastWeekExpense > 0 ? Math.round(((thisWeekExpense - lastWeekExpense) / lastWeekExpense) * 100) : 0,
        thisWeekIncome,
        lastWeekIncome,
        incomeWeekChange: lastWeekIncome > 0 ? Math.round(((thisWeekIncome - lastWeekIncome) / lastWeekIncome) * 100) : 0,
      },
      spendingByCategory,
      incomeByCategory,
      topCounterparties,
      dowData,
      hourData,
      largest: largest
        ? { type: largest.type, amountKobo: largest.amountKobo, counterpartyName: largest.counterpartyName, description: largest.description, createdAt: largest.createdAt, direction: largest.direction }
        : null,
    });
  } catch (e) {
    return handleError(e);
  }
}
