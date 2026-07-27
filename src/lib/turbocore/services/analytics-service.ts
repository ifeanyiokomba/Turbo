// TurboCore Bounded Service — Analytics Service
//
// Aggregates from Transaction + ProviderHealthCheck + PaymentFlowLog into
// the metrics that power dashboards: 30-day user stats, daily cashflow
// buckets, spending by category, provider performance, and platform
// revenue (feeKobo sums). All queries are read-only.

import { db } from "@/lib/db";

export interface DashboardStats {
  userId: string;
  periodDays: number;
  inboundCount: number;
  outboundCount: number;
  inboundAmountKobo: number;
  outboundAmountKobo: number;
  feesPaidKobo: number;
  successCount: number;
  failedCount: number;
  pendingCount: number;
  netChangeKobo: number;
}

export interface CashflowBucket {
  date: string; // YYYY-MM-DD
  inboundKobo: number;
  outboundKobo: number;
  netKobo: number;
}

export interface SpendingByCategory {
  type: string;
  count: number;
  totalAmountKobo: number;
  feesKobo: number;
}

export interface ProviderPerformanceEntry {
  providerCode: string;
  totalChecks: number;
  okChecks: number;
  successRate: number; // 0-100
  avgLatencyMs: number;
  avgHealthScore: number;
  lastCheckedAt: Date | null;
}

export interface RevenueStats {
  periodDays: number;
  totalTransactions: number;
  successfulTransactions: number;
  totalFeesKobo: number;
  totalVolumeKobo: number;
  byProvider: { providerCode: string; feesKobo: number; volumeKobo: number; count: number }[];
}

export const analyticsService = {
  /** 30-day rolling transaction stats for a user (default window). */
  async getDashboardStats(userId: string, periodDays = 30): Promise<DashboardStats> {
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60_000);
    const [inbound, outbound, feesAgg, statusGroups] = await Promise.all([
      db.transaction.aggregate({
        _count: true,
        _sum: { amountKobo: true },
        where: { userId, direction: "CREDIT", createdAt: { gte: since } },
      }),
      db.transaction.aggregate({
        _count: true,
        _sum: { amountKobo: true },
        where: { userId, direction: "DEBIT", createdAt: { gte: since } },
      }),
      db.transaction.aggregate({
        _sum: { feeKobo: true },
        where: { userId, direction: "DEBIT", createdAt: { gte: since } },
      }),
      db.transaction.groupBy({
        by: ["status"],
        _count: true,
        where: { userId, createdAt: { gte: since } },
      }),
    ]);

    const statusMap = new Map<string, number>();
    for (const g of statusGroups) statusMap.set(g.status, g._count);

    const inboundAmountKobo = inbound._sum.amountKobo ?? 0;
    const outboundAmountKobo = outbound._sum.amountKobo ?? 0;

    return {
      userId,
      periodDays,
      inboundCount: inbound._count,
      outboundCount: outbound._count,
      inboundAmountKobo,
      outboundAmountKobo,
      feesPaidKobo: feesAgg._sum.feeKobo ?? 0,
      successCount: statusMap.get("SUCCESS") ?? 0,
      failedCount: statusMap.get("FAILED") ?? 0,
      pendingCount: statusMap.get("PENDING") ?? 0,
      netChangeKobo: inboundAmountKobo - outboundAmountKobo,
    };
  },

  /** Bucket transactions by day for the cashflow chart. */
  async getCashflow(userId: string, days = 30): Promise<CashflowBucket[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60_000);
    const txns = await db.transaction.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { direction: true, amountKobo: true, createdAt: true, status: true },
    });

    const buckets = new Map<string, CashflowBucket>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60_000);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, { date: key, inboundKobo: 0, outboundKobo: 0, netKobo: 0 });
    }
    for (const t of txns) {
      if (t.status !== "SUCCESS") continue;
      const key = t.createdAt.toISOString().slice(0, 10);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      if (t.direction === "CREDIT") bucket.inboundKobo += t.amountKobo;
      else bucket.outboundKobo += t.amountKobo;
    }
    for (const b of buckets.values()) b.netKobo = b.inboundKobo - b.outboundKobo;
    return Array.from(buckets.values());
  },

  /** Aggregate spending by transaction type (TRANSFER, BILL, AIRTIME, ...). */
  async getSpendingByCategory(userId: string, days = 30): Promise<SpendingByCategory[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60_000);
    const groups = await db.transaction.groupBy({
      by: ["type"],
      _count: true,
      _sum: { amountKobo: true, feeKobo: true },
      where: {
        userId,
        direction: "DEBIT",
        status: "SUCCESS",
        createdAt: { gte: since },
      },
    });
    return groups.map((g) => ({
      type: g.type,
      count: g._count,
      totalAmountKobo: g._sum.amountKobo ?? 0,
      feesKobo: g._sum.feeKobo ?? 0,
    }));
  },

  /** Aggregate provider performance from ProviderHealthCheck (recent samples). */
  async getProviderPerformance(provider?: string, hours = 24): Promise<ProviderPerformanceEntry[]> {
    const since = new Date(Date.now() - hours * 60 * 60_000);
    const rows = await db.providerHealthCheck.findMany({
      where: {
        sampledAt: { gte: since },
        ...(provider ? { providerCode: provider } : {}),
      },
      select: {
        providerCode: true,
        ok: true,
        latencyMs: true,
        healthScore: true,
        sampledAt: true,
      },
    });

    const byProvider = new Map<
      string,
      {
        total: number;
        ok: number;
        latencySum: number;
        healthSum: number;
        lastCheckedAt: Date | null;
      }
    >();
    for (const r of rows) {
      const cur = byProvider.get(r.providerCode) ?? {
        total: 0,
        ok: 0,
        latencySum: 0,
        healthSum: 0,
        lastCheckedAt: null,
      };
      cur.total += 1;
      if (r.ok) cur.ok += 1;
      cur.latencySum += r.latencyMs;
      cur.healthSum += r.healthScore;
      if (!cur.lastCheckedAt || r.sampledAt > cur.lastCheckedAt) {
        cur.lastCheckedAt = r.sampledAt;
      }
      byProvider.set(r.providerCode, cur);
    }

    return Array.from(byProvider.entries()).map(([providerCode, s]) => ({
      providerCode,
      totalChecks: s.total,
      okChecks: s.ok,
      successRate: s.total > 0 ? Math.round((s.ok / s.total) * 100) : 0,
      avgLatencyMs: s.total > 0 ? Math.round(s.latencySum / s.total) : 0,
      avgHealthScore: s.total > 0 ? Math.round(s.healthSum / s.total) : 0,
      lastCheckedAt: s.lastCheckedAt,
    }));
  },

  /** Platform-wide revenue (sum of feeKobo) over the last N days. */
  async getRevenueStats(days = 30): Promise<RevenueStats> {
    const since = new Date(Date.now() - days * 24 * 60 * 60_000);
    const [totals, byProviderGroups] = await Promise.all([
      db.transaction.aggregate({
        _count: true,
        _sum: { amountKobo: true, feeKobo: true },
        where: { status: "SUCCESS", createdAt: { gte: since } },
      }),
      db.transaction.groupBy({
        by: ["provider"],
        _count: true,
        _sum: { amountKobo: true, feeKobo: true },
        where: { status: "SUCCESS", createdAt: { gte: since } },
      }),
    ]);

    return {
      periodDays: days,
      totalTransactions: totals._count,
      successfulTransactions: totals._count,
      totalFeesKobo: totals._sum.feeKobo ?? 0,
      totalVolumeKobo: totals._sum.amountKobo ?? 0,
      byProvider: byProviderGroups.map((g) => ({
        providerCode: g.provider ?? "unknown",
        feesKobo: g._sum.feeKobo ?? 0,
        volumeKobo: g._sum.amountKobo ?? 0,
        count: g._count,
      })),
    };
  },
};
