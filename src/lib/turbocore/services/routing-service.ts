// TurboCore Bounded Service — Routing Service
//
// Thin facade over the routing engine + manifest registry + provider registry.
// Exposes provider selection, capability lookup, live health, and failover
// stats — the read-side of the routing subsystem.
//
// Routing weights (success rate 0.4, charge 0.3, speed 0.2, capability 0.1)
// are tuned inside the routing engine; this service just delegates.

import { db } from "@/lib/db";
import { route, type RouteRequest, type RoutingDecision } from "@/lib/turbocore/routing-engine";
import { getProvidersForCapability } from "@/lib/turbocore/manifest-registry";
import { registry } from "@/lib/turbocore/registry";

export const routingService = {
  /** Route a request to the best provider (multi-factor score + circuit breaker). */
  async route(request: RouteRequest): Promise<RoutingDecision> {
    return route(request);
  },

  /** List providers that satisfy a given capability in a given country (from manifests). */
  async getProviders(country: string, capability: string, direction?: string) {
    return getProvidersForCapability(country, capability, direction);
  },

  /** Get the EMA health score for a provider (0-100, circuit-aware). */
  async getHealth(providerCode: string) {
    return registry.getHealth(providerCode);
  },

  /**
   * Aggregate failover stats from PaymentFlowLog. Returns total failovers,
   * distinct transactions affected, and a per-provider breakdown of failover
   * targets. Used by the admin routing dashboard.
   */
  async getFailoverStats(days = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60_000);
    const rows = await db.paymentFlowLog.findMany({
      where: { step: "FAILOVER", at: { gte: since } },
      select: {
        providerCode: true,
        transactionId: true,
        payloadJSON: true,
        at: true,
      },
    });

    const byTarget = new Map<string, number>();
    const txIds = new Set<string>();
    for (const r of rows) {
      txIds.add(r.transactionId ?? "");
      if (r.providerCode) byTarget.set(r.providerCode, (byTarget.get(r.providerCode) ?? 0) + 1);
    }
    txIds.delete("");

    return {
      totalFailovers: rows.length,
      distinctTransactions: txIds.size,
      byTarget: Array.from(byTarget.entries()).map(([providerCode, count]) => ({
        providerCode,
        count,
      })),
      since,
    };
  },
};
