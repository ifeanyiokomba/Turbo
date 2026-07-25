import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { json, handleError, requireUser } from "@/lib/api";
import { naira } from "@/lib/money";

export async function GET() {
  try {
    const user = await requireUser();
    const wallet = await db.wallet.findUnique({ where: { userId: user.id } });
    const virtualAccount = await db.virtualAccount.findUnique({ where: { userId: user.id } });

    // last 14 days transactions
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const recent = await db.transaction.findMany({
      where: { userId: user.id, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    // 14-day cashflow buckets
    const buckets: { date: string; inflow: number; outflow: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      buckets.push({ date: d.toISOString().slice(0, 10), inflow: 0, outflow: 0 });
    }
    const bucketMap = new Map(buckets.map((b) => [b.date, b]));
    let moneyIn = 0, moneyOut = 0, txCount = 0;
    for (const t of recent) {
      if (t.status !== "SUCCESS") continue;
      txCount++;
      const day = new Date(t.createdAt);
      day.setHours(0, 0, 0, 0);
      const key = day.toISOString().slice(0, 10);
      const b = bucketMap.get(key);
      if (b) {
        if (t.direction === "CREDIT") { b.inflow += t.amountKobo; moneyIn += t.amountKobo; }
        else { b.outflow += t.amountKobo; moneyOut += t.amountKobo; }
      }
    }

    // spending by category
    const byCat: Record<string, number> = {};
    for (const t of recent) {
      if (t.status !== "SUCCESS" || t.direction !== "DEBIT") continue;
      byCat[t.type] = (byCat[t.type] ?? 0) + t.amountKobo;
    }
    const spending = Object.entries(byCat)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const latest = await db.transaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 6,
    });

    return json({
      wallet: wallet ? { balanceKobo: wallet.balanceKobo, currency: wallet.currency, status: wallet.status } : null,
      virtualAccount: virtualAccount
        ? { accountNumber: virtualAccount.accountNumber, accountName: virtualAccount.accountName, bankName: virtualAccount.bankName }
        : null,
      recent: latest,
      cashflow: buckets,
      stats: {
        moneyIn,
        moneyOut,
        netFlow: moneyIn - moneyOut,
        txCount,
      },
      spending,
    });
  } catch (e) {
    return handleError(e);
  }
}
