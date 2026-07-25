// TurboCore — routing engine. Picks the best provider for a request using a
// multi-factor score: success rate (health), charge (cost), speed (settle + latency),
// and capability match. Circuit-breaker state acts as a hard filter.
//
// Weights are tunable and clearly labelled so admins can reason about why a
// provider was chosen. The full score breakdown is persisted to
// PaymentRoutingDecision for every routing call (audit + post-mortem).

import { db } from "@/lib/db";
import { registry, getBreakerStates } from "./registry";
import type { ContractName } from "./result";

export interface RouteRequest {
  contract: ContractName;
  country: string;
  currency: string;
  amountMinor: number;
  direction: "INBOUND" | "OUTBOUND";
  service?: string;
  preferredProvider?: string;
  userId?: string;
}

export interface ProviderScore {
  providerCode: string;
  score: number; // weighted total 0-100
  successRate: number; // 0-100 (recent success % from health samples)
  charge: number; // 0-100 (lower fee = higher score)
  speed: number; // 0-100 (lower settle hours = higher score)
  avgLatencyMs: number; // recent avg latency
  health: number; // EMA health from registry (circuit-aware)
  circuit: "CLOSED" | "OPEN" | "HALF_OPEN";
}

export interface RoutingDecision {
  providerCode: string;
  contract: ContractName;
  reason: "scored" | "fallback" | "preferred" | "only_viable" | "none";
  scores: ProviderScore[];
  alternatives: string[];
}

// Tunable weights — sum to 1.0. Admins can override via ProviderConfig.weightsJSON in future.
// successRate (health) is the dominant factor, then charge, then speed, then capability match.
const DEFAULT_WEIGHTS = {
  successRate: 0.4, // success rate from recent health samples (circuit-aware)
  charge: 0.3, // cost to the customer (feeBps + feeFixedMinor)
  speed: 0.2, // settlement speed (settleHours) + latency
  capability: 0.1, // base capability match (always 100 if viable)
};

let cache: { ts: number; rows: any[] } | null = null;
const CACHE_TTL = 60_000;

// Health sample cache — recent ProviderHealthCheck rows per provider (5-min window).
let healthCache: { ts: number; byProvider: Map<string, { successRate: number; avgLatencyMs: number; count: number }> } | null = null;
const HEALTH_CACHE_TTL = 30_000;

async function loadCapabilities(): Promise<any[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.rows;
  const rows = await db.providerCapability.findMany({ where: { enabled: true } });
  cache = { ts: Date.now(), rows };
  return rows;
}

async function loadHealthStats(): Promise<Map<string, { successRate: number; avgLatencyMs: number; count: number }>> {
  if (healthCache && Date.now() - healthCache.ts < HEALTH_CACHE_TTL) return healthCache.byProvider;
  const since = new Date(Date.now() - 5 * 60_000);
  const rows = await db.providerHealthCheck.findMany({ where: { sampledAt: { gte: since } } });
  const byProvider = new Map<string, { ok: number; total: number; latencySum: number }>();
  for (const r of rows) {
    const cur = byProvider.get(r.providerCode) ?? { ok: 0, total: 0, latencySum: 0 };
    cur.total++;
    if (r.ok) cur.ok++;
    cur.latencySum += r.latencyMs;
    byProvider.set(r.providerCode, cur);
  }
  const out = new Map<string, { successRate: number; avgLatencyMs: number; count: number }>();
  for (const [code, s] of byProvider.entries()) {
    out.set(code, {
      successRate: s.total > 0 ? Math.round((s.ok / s.total) * 100) : 100,
      avgLatencyMs: s.total > 0 ? Math.round(s.latencySum / s.total) : 0,
      count: s.total,
    });
  }
  healthCache = { ts: Date.now(), byProvider: out };
  return out;
}

export function invalidateCapabilityCache(): void {
  cache = null;
}

export function invalidateHealthCache(): void {
  healthCache = null;
}

export async function route(req: RouteRequest): Promise<RoutingDecision> {
  const capabilities = await loadCapabilities();
  const healthStats = await loadHealthStats();
  const breakers = getBreakerStates();

  // 1. Capability filter — provider must support contract/country/currency/amount/direction.
  const viable = capabilities.filter(
    (c) =>
      c.contract === req.contract &&
      (c.country === req.country || c.country === "ALL") &&
      (c.currency === req.currency || c.currency === "ALL") &&
      (!c.service || !req.service || c.service === req.service) &&
      c.direction === req.direction &&
      req.amountMinor >= c.minAmountMinor &&
      (c.maxAmountMinor === 0 || req.amountMinor <= c.maxAmountMinor),
  );

  if (viable.length === 0) {
    return { providerCode: "", contract: req.contract, reason: "none", scores: [], alternatives: [] };
  }

  // 2. Score each viable provider on success-rate, charge, speed, capability.
  const scored: ProviderScore[] = viable.map((c) => {
    const health = registry.getHealth(c.providerCode).score;
    const breaker = breakers[c.providerCode] ?? { state: "CLOSED", failures: 0, score: health };
    const stats = healthStats.get(c.providerCode);
    const successRate = stats?.successRate ?? health; // prefer sampled success rate; fall back to EMA
    const avgLatencyMs = stats?.avgLatencyMs ?? 0;

    // CHARGE: lower fee = higher score. feeBps is basis points (e.g. 180 = 1.8%), feeFixedMinor is flat.
    const totalFeeBps = c.feeBps + c.feeFixedMinor / 1000; // normalize flat fee into bps-ish
    const charge = Math.max(0, 100 - Math.min(100, totalFeeBps));

    // SPEED: lower settle hours + lower latency = higher score.
    const settlePenalty = Math.min(60, c.settleHours * 5); // each settle hour costs 5 pts (cap 60)
    const latencyPenalty = Math.min(30, avgLatencyMs / 200); // each 200ms costs 1 pt (cap 30)
    const speed = Math.max(0, 100 - settlePenalty - latencyPenalty);

    const w = DEFAULT_WEIGHTS;
    const score =
      w.successRate * successRate +
      w.charge * charge +
      w.speed * speed +
      w.capability * 100 +
      (req.preferredProvider === c.providerCode ? 100 : 0);

    return {
      providerCode: c.providerCode,
      score: Math.round(score),
      successRate,
      charge: Math.round(charge),
      speed: Math.round(speed),
      avgLatencyMs,
      health,
      circuit: breaker.state as "CLOSED" | "OPEN" | "HALF_OPEN",
    };
  });

  // 3. Hard filter — drop providers with circuit OPEN or successRate < 30.
  const healthy = scored.filter((s) => s.circuit !== "OPEN" && s.successRate >= 30);

  const pool = healthy.length > 0 ? healthy : scored;

  // 4. All unhealthy — fall back to the highest-scoring viable anyway (best-effort).
  if (healthy.length === 0 && scored.length > 0) {
    scored.sort((a, b) => b.score - a.score);
    const fb = scored[0];
    return {
      providerCode: fb.providerCode,
      contract: req.contract,
      reason: "fallback",
      scores: scored,
      alternatives: [],
    };
  }

  pool.sort((a, b) => b.score - a.score);

  // 5. Preferred override — if the requested provider is viable + healthy, use it.
  if (req.preferredProvider && pool.some((s) => s.providerCode === req.preferredProvider)) {
    return {
      providerCode: req.preferredProvider!,
      contract: req.contract,
      reason: "preferred",
      scores: pool,
      alternatives: pool.filter((s) => s.providerCode !== req.preferredProvider).slice(0, 3).map((s) => s.providerCode),
    };
  }

  if (pool.length === 1) {
    return {
      providerCode: pool[0].providerCode,
      contract: req.contract,
      reason: "only_viable",
      scores: pool,
      alternatives: [],
    };
  }

  // 6. Top-1 deterministic by weighted score. (Canary/weighted-random can be layered on later.)
  const chosen = pool[0];
  return {
    providerCode: chosen.providerCode,
    contract: req.contract,
    reason: "scored",
    scores: pool,
    alternatives: pool.slice(1, 4).map((s) => s.providerCode),
  };
}

export async function persistDecision(decision: RoutingDecision, requestId: string, transactionId?: string): Promise<void> {
  try {
    await db.paymentRoutingDecision.create({
      data: {
        transactionId: transactionId ?? null,
        contract: decision.contract,
        providerCode: decision.providerCode,
        chosenProvider: decision.providerCode,
        reason: decision.reason,
        scoresJSON: JSON.stringify(decision.scores),
        alternativesJSON: JSON.stringify(decision.alternatives),
        requestId,
      },
    });
  } catch (e) {
    console.error("[routing] persistDecision failed", e);
  }
}
