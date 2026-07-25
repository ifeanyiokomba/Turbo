import { db } from "@/lib/db";
import { json, handleError, requireUser } from "@/lib/api";

/**
 * GET /api/analytics/heatmap
 * Returns 365 days of daily spending totals (DEBIT + SUCCESS) for the
 * GitHub-style contribution heatmap on the Analytics page.
 *
 * Response shape:
 *   { days: [{ date: "YYYY-MM-DD", totalKobo: number }], totalKobo, maxDayKobo, activeDays }
 */
export async function GET() {
  try {
    const user = await requireUser();
    const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    const rows = await db.transaction.findMany({
      where: {
        userId: user.id,
        direction: "DEBIT",
        status: "SUCCESS",
        createdAt: { gte: since },
      },
      select: { amountKobo: true, createdAt: true },
    });

    // Build a 365-day bucket map (date string → total kobo) starting today
    // and walking back 364 days. SQLite has no native date_trunc so we do it
    // in JS — 365 rows is trivial.
    const dayMap = new Map<string, number>();
    for (const t of rows) {
      const d = new Date(t.createdAt);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, (dayMap.get(key) ?? 0) + t.amountKobo);
    }

    const days: { date: string; totalKobo: number }[] = [];
    let totalKobo = 0;
    let maxDayKobo = 0;
    let activeDays = 0;
    for (let i = 364; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const total = dayMap.get(key) ?? 0;
      days.push({ date: key, totalKobo: total });
      totalKobo += total;
      if (total > maxDayKobo) maxDayKobo = total;
      if (total > 0) activeDays++;
    }

    return json({ days, totalKobo, maxDayKobo, activeDays });
  } catch (e) {
    return handleError(e);
  }
}
