// TurboCore — routing engine. Picks the best provider for a request using capability + health + cost + settle scoring.

import { db } from "@/lib/db";
import { registry } from "./registry";
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

export interface RoutingDecision {
  providerCode: string;
  contract: ContractName;
  reason: "scored" | "fallback" | "preferred" | "only_viable" | "none";
  scores: { providerCode: string; score: number; health: number; cost: number; settle: number }[];
  alternatives: string[];
}

const DEFAULT_WEIGHTS = { capability: 0.4, health: 0.3, cost: 0.2, settle: 0.1 };

let cache: { ts: number; rows: any[] } | null = null;
const CACHE_TTL = 60_000;

async function loadCapabilities(): Promise<any[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.rows;
  const rows = await db.providerCapability.findMany({ where: { enabled: true } });
  cache = { ts: Date.now(), rows };
  return rows;
}

export function invalidateCapabilityCache(): void {
  cache = null;
}

export async function route(req: RouteRequest): Promise<RoutingDecision> {
  const capabilities = await loadCapabilities();

  // 1. Capability filter
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

  // 2. Health filter — drop providers with circuit OPEN or score < 30
  const scored = viable
    .map((c) => {
      const health = registry.getHealth(c.providerCode).score;
      const cost = 100 - Math.min(100, (c.feeBps + c.feeFixedMinor / 100)); // lower fee = higher score
      const settle = 100 - Math.min(100, c.settleHours * 10);
      const w = DEFAULT_WEIGHTS;
      const score =
        w.capability * 100 + w.health * health + w.cost * cost + w.settle * settle + (req.preferredProvider === c.providerCode ? 100 : 0);
      return { providerCode: c.providerCode, score, health, cost, settle, capabilityRow: c };
    })
    .filter((s) => s.health >= 30);

  if (scored.length === 0) {
    // All unhealthy — fall back to first viable anyway
    const fb = viable[0];
    return {
      providerCode: fb.providerCode,
      contract: req.contract,
      reason: "fallback",
      scores: [],
      alternatives: [],
    };
  }

  scored.sort((a, b) => b.score - a.score);

  // 3. Preferred override
  if (req.preferredProvider && scored.some((s) => s.providerCode === req.preferredProvider)) {
    return {
      providerCode: req.preferredProvider!,
      contract: req.contract,
      reason: "preferred",
      scores: scored.map((s) => ({ providerCode: s.providerCode, score: s.score, health: s.health, cost: s.cost, settle: s.settle })),
      alternatives: scored.filter((s) => s.providerCode !== req.preferredProvider).slice(0, 3).map((s) => s.providerCode),
    };
  }

  if (scored.length === 1) {
    return {
      providerCode: scored[0].providerCode,
      contract: req.contract,
      reason: "only_viable",
      scores: scored.map((s) => ({ providerCode: s.providerCode, score: s.score, health: s.health, cost: s.cost, settle: s.settle })),
      alternatives: [],
    };
  }

  // 4. Top-1 deterministic (canary/weighted-random can be added later)
  const chosen = scored[0];
  return {
    providerCode: chosen.providerCode,
    contract: req.contract,
    reason: "scored",
    scores: scored.map((s) => ({ providerCode: s.providerCode, score: s.score, health: s.health, cost: s.cost, settle: s.settle })),
    alternatives: scored.slice(1, 4).map((s) => s.providerCode),
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
