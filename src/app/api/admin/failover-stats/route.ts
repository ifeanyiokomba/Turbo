// Admin — failover stats over the last 24h / 7d.
//
// Aggregates PaymentFlowLog rows where step="FAILOVER" to surface:
//   - totalFailovers: count of FAILOVER entries in the window
//   - byProvider: { paystack: 5, flutterwave: 2, ... } — providers that failovers
//     landed ON (the "to" field in the payloadJSON envelope).
//   - byFromProvider: providers that failovers started FROM (the "from" field).
//   - byReason: { PROVIDER_DOWN: 3, PROVIDER_TIMEOUT: 4, ... }
//   - successRateAfterFailover: of all txns that had ≥1 FAILOVER, what fraction
//     ended up SUCCESS (vs REVERSED) — the operational "did failover save us?" metric.
//   - topFailoverChains: most common {from→to→reason} triples.
//
// All money is kobo. All admin APIs require requireAdmin().

import { db } from "@/lib/db";
import { json, handleError, requireAdmin, audit, getClientIp } from "@/lib/api";

export const dynamic = "force-dynamic";

interface FailoverStats {
  windowHours: number;
  totalFailovers: number;
  uniqueTxns: number;
  byToProvider: Record<string, number>;
  byFromProvider: Record<string, number>;
  byReason: Record<string, number>;
  successRateAfterFailover: number; // 0-100
  reversedAfterFailover: number;
  topFailoverChains: { from: string; to: string; reason: string; count: number }[];
}

async function computeStats(windowHours: number): Promise<FailoverStats> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const rows = await db.paymentFlowLog.findMany({
    where: { step: "FAILOVER", at: { gte: since } },
    orderBy: { at: "desc" },
    take: 1000,
  });

  const byToProvider: Record<string, number> = {};
  const byFromProvider: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  const chainCount: Record<string, number> = {};
  const txnIds = new Set<string>();
  const successTxnIds = new Set<string>();
  const reversedTxnIds = new Set<string>();

  for (const r of rows) {
    let payload: { from?: string; to?: string; reason?: string } = {};
    try {
      payload = r.payloadJSON ? JSON.parse(r.payloadJSON) : {};
    } catch {
      payload = {};
    }
    const from = payload.from ?? r.providerCode ?? "unknown";
    const to = payload.to ?? r.providerCode ?? "unknown";
    const reason = payload.reason ?? "UNKNOWN";

    byToProvider[to] = (byToProvider[to] ?? 0) + 1;
    byFromProvider[from] = (byFromProvider[from] ?? 0) + 1;
    byReason[reason] = (byReason[reason] ?? 0) + 1;
    const chainKey = `${from}→${to}·${reason}`;
    chainCount[chainKey] = (chainCount[chainKey] ?? 0) + 1;
    if (r.transactionId) txnIds.add(r.transactionId);
  }

  // For each affected transaction, determine the terminal outcome.
  if (txnIds.size > 0) {
    const txnIdsArr = Array.from(txnIds);
    const txns = await db.transaction.findMany({
      where: { id: { in: txnIdsArr } },
      select: { id: true, status: true },
    });
    for (const t of txns) {
      if (t.status === "SUCCESS") successTxnIds.add(t.id);
      if (t.status === "REVERSED") reversedTxnIds.add(t.id);
    }
  }

  const totalTxns = txnIds.size;
  const successRateAfterFailover =
    totalTxns > 0 ? Math.round((successTxnIds.size / totalTxns) * 100) : 0;

  const topFailoverChains = Object.entries(chainCount)
    .map(([k, count]) => {
      const [fromTo, reason] = k.split("·");
      const [from, to] = fromTo.split("→");
      return { from, to, reason, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    windowHours,
    totalFailovers: rows.length,
    uniqueTxns: txnIds.size,
    byToProvider,
    byFromProvider,
    byReason,
    successRateAfterFailover,
    reversedAfterFailover: reversedTxnIds.size,
    topFailoverChains,
  };
}

export async function GET(req: Request) {
  try {
    const user = await requireAdmin();
    const url = new URL(req.url);
    const windowParam = (url.searchParams.get("window") ?? "24h").toLowerCase();
    const windowHours = windowParam === "7d" ? 24 * 7 : 24;

    const [stats] = await Promise.all([computeStats(windowHours)]);

    await audit({
      userId: user.id,
      action: "ADMIN_FAILOVER_STATS_VIEWED",
      category: "ADMIN",
      ip: getClientIp(req),
      metadata: { windowHours, totalFailovers: stats.totalFailovers },
    });

    return json(stats);
  } catch (e) {
    return handleError(e);
  }
}
