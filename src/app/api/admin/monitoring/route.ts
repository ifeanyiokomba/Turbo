// Turbopay admin — real-time platform monitoring dashboard
//
// GET (admin-only):
//   Returns an at-a-glance view of platform health:
//     - System KPIs (tx today, success rate, avg processing time, active users 24h)
//     - Provider health summary (per-provider success rate, latency, circuit state)
//     - Volume metrics (today's NGN volume, fees collected, largest transaction)
//     - Error breakdown (top 10 errors in last 24h with counts)
//     - Queue health (pending outbox events, stuck tx, pending cron jobs)
//     - Alert count (unresolved AML flags, open compliance cases, failed webhooks)

import { db } from "@/lib/db";
import { json, handleError, requireAdmin } from "@/lib/api";
import { getBreakerStates, registry } from "@/lib/turbocore/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    // ---- Parallel fetches for the heavy aggregates ----
    const [
      txTodayCount,
      txTodaySuccessCount,
      txTodayFailedCount,
      txTodayAgg,
      feesTodayAgg,
      largestToday,
      activeUsers24h,
      pendingOutbox,
      failedOutbox,
      stuckTx,
      pendingCronTasks,
      unresolvedAml,
      openComplianceCases,
      failedWebhookEndpoints,
      recentTxns,
      txFailedRecent,
    ] = await Promise.all([
      // Today's transactions (any status)
      db.transaction.count({ where: { createdAt: { gte: startOfToday } } }),
      // Today's successes
      db.transaction.count({
        where: { createdAt: { gte: startOfToday }, status: "SUCCESS" },
      }),
      // Today's failures
      db.transaction.count({
        where: { createdAt: { gte: startOfToday }, status: "FAILED" },
      }),
      // Today's volume + average processing proxy
      db.transaction.aggregate({
        where: { createdAt: { gte: startOfToday }, status: "SUCCESS" },
        _sum: { amountKobo: true },
        _avg: { amountKobo: true },
      }),
      // Today's fees collected
      db.transaction.aggregate({
        where: { createdAt: { gte: startOfToday }, status: "SUCCESS" },
        _sum: { feeKobo: true },
      }),
      // Largest transaction today
      db.transaction.findFirst({
        where: { createdAt: { gte: startOfToday } },
        orderBy: { amountKobo: "desc" },
        include: { user: { select: { fullName: true, username: true } } },
      }),
      // Active users (24h) — distinct users with a transaction in last 24h
      db.transaction.groupBy({
        by: ["userId"],
        where: { createdAt: { gte: oneDayAgo } },
        _count: { _all: true },
      }),
      // Outbox pending
      db.outboxEvent.count({ where: { status: "PENDING" } }),
      // Outbox failed
      db.outboxEvent.count({ where: { status: "FAILED" } }),
      // Stuck transactions (PENDING > 1 hour)
      db.transaction.count({
        where: {
          status: "PENDING",
          createdAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) },
        },
      }),
      // Pending cron / async tasks
      db.asyncTask.count({
        where: {
          status: "PENDING",
          nextRetryAt: { lte: now },
        },
      }),
      // Unresolved AML flags
      db.amlFlag.count({ where: { resolved: false } }),
      // Open compliance cases
      db.complianceCase.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] } } }),
      // Failed webhook endpoints (consecutiveFailures > 0)
      db.webhookEndpoint.count({ where: { consecutiveFailures: { gt: 0 } } }),
      // Last 10 transactions for the live feed
      db.transaction.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { user: { select: { fullName: true, username: true } } },
      }),
      // Recent failed transactions for error breakdown (last 24h)
      db.transaction.findMany({
        where: {
          status: "FAILED",
          createdAt: { gte: oneDayAgo },
        },
        select: { type: true, description: true, counterpartyName: true, createdAt: true },
      }),
    ]);

    // ---- Provider health summary ----
    const providerConfigs = await db.providerConfig.findMany({ orderBy: { code: "asc" } });
    const breakers = getBreakerStates();
    const providerHealth = await Promise.all(
      providerConfigs.map(async (p) => {
        const samples = await db.providerHealthCheck.findMany({
          where: { providerCode: p.code },
          orderBy: { sampledAt: "desc" },
          take: 10,
        });
        const health = registry.getHealth(p.code);
        const breaker = breakers[p.code] ?? { state: "CLOSED", failures: 0, score: 100 };
        const okCount = samples.filter((s) => s.ok).length;
        const successRate = samples.length > 0 ? (okCount / samples.length) * 100 : 100;
        const avgLatency =
          samples.length > 0
            ? Math.round(samples.reduce((acc, s) => acc + s.latencyMs, 0) / samples.length)
            : 0;
        return {
          code: p.code,
          displayName: p.displayName,
          enabled: p.enabled,
          healthScore: health.score,
          circuitState: breaker.state,
          successRate: Math.round(successRate * 10) / 10,
          avgLatencyMs: avgLatency,
          sampleCount: samples.length,
        };
      }),
    );

    // ---- Error breakdown (top 10) ----
    // Bucket failures by type + description.
    const errorBuckets: Record<string, { label: string; count: number }> = {};
    for (const t of txFailedRecent) {
      const label = `${t.type}: ${t.description ?? t.counterpartyName ?? "Unknown error"}`.slice(0, 120);
      if (!errorBuckets[label]) errorBuckets[label] = { label, count: 0 };
      errorBuckets[label].count++;
    }
    const errorBreakdown = Object.values(errorBuckets)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ---- Derived metrics ----
    const successRatePct = txTodayCount > 0
      ? Math.round((txTodaySuccessCount / txTodayCount) * 1000) / 10
      : 100;
    const openAlerts = unresolvedAml + openComplianceCases + failedWebhookEndpoints;

    // Avg processing time: derive from latest ProviderHealthCheck avgLatency
    const avgProcessingMs = providerHealth.length > 0
      ? Math.round(providerHealth.reduce((s, p) => s + p.avgLatencyMs, 0) / providerHealth.length)
      : 0;

    return json({
      generatedAt: now.toISOString(),
      system: {
        txTodayCount,
        txTodaySuccessCount,
        txTodayFailedCount,
        successRatePct,
        avgProcessingMs,
        activeUsers24h: activeUsers24h.length,
      },
      volume: {
        totalTodayKobo: txTodayAgg._sum.amountKobo ?? 0,
        feesTodayKobo: feesTodayAgg._sum.feeKobo ?? 0,
        largestTodayKobo: largestToday?.amountKobo ?? 0,
        largestTodayRef: largestToday?.reference ?? null,
        largestTodayUser: largestToday?.user?.fullName ?? null,
      },
      providerHealth,
      errorBreakdown,
      queues: {
        pendingOutbox,
        failedOutbox,
        stuckTransactions: stuckTx,
        pendingCronTasks,
      },
      alerts: {
        unresolvedAml,
        openComplianceCases,
        failedWebhooks: failedWebhookEndpoints,
        openAlerts,
      },
      liveFeed: recentTxns.map((t) => ({
        id: t.id,
        reference: t.reference,
        type: t.type,
        direction: t.direction,
        amountKobo: t.amountKobo,
        status: t.status,
        createdAt: t.createdAt,
        userName: t.user?.fullName ?? null,
        userUsername: t.user?.username ?? null,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
