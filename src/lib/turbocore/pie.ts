// TurboCore Provider Intelligence Engine (PIE) — Chapter 4
//
// The brain of TurboPay. Every payment request is a routing problem.
//
// This module enhances the existing routing-engine.ts with:
//   1. Cross-border detection (Country Resolution)
//   2. Merchant routing policies (Cost Engine)
//   3. Risk-aware routing (Risk Engine)
//   4. Compliance-aware routing (Compliance Engine)
//   5. Failure-aware retry matrix (Failover Engine)
//   6. Learning/trend tracking (Learning Engine)
//   7. Simulation mode (dry-run routing)
//   8. Provider heat map
//
// The existing routing-engine.ts handles the base scoring.
// PIE wraps it with intelligence layers.

import { db } from "@/lib/db";
import { route, type RouteRequest, type RoutingDecision } from "./routing-engine";
import { getCountryKycConfig } from "./kyc-engine";
import { screenEntity, runAmlRules } from "./compliance/screen";
import { isFeatureEnabled, FeatureFlags } from "./feature-flags";
import { registry, getBreakerStates } from "./registry";
import { getAllManifests, getProvidersForCapability } from "./manifest-registry";
import {
  storeExplanation,
  createRoutingExplanation,
  type CandidateEvaluation,
} from "./routing-explainability";
import type { ProviderResult, ProviderErrorCode } from "./result";

// ===== Merchant Routing Policies =====
//
// Every merchant can define priorities:
//   LOWEST_COST — optimize for cheapest provider
//   FASTEST_SETTLEMENT — optimize for speed
//   HIGHEST_SUCCESS_RATE — optimize for reliability
//   PREFERRED_PROVIDER — force a specific provider

export type MerchantRoutingPolicy =
  "LOWEST_COST" | "FASTEST_SETTLEMENT" | "HIGHEST_SUCCESS_RATE" | "PREFERRED_PROVIDER" | "BALANCED"; // default — use standard weights

export interface MerchantPolicyConfig {
  policy: MerchantRoutingPolicy;
  preferredProvider?: string;
  maxFeeBps?: number; // reject providers above this fee
  maxLatencyMs?: number; // reject providers above this latency
  minSuccessRate?: number; // reject providers below this success rate
}

// ===== Cross-Border Detection =====

export interface CountryResolution {
  origin: string;
  destination: string;
  crossBorder: boolean;
  corridor: string; // "NG-KE" format
}

export function resolveCountries(
  senderCountry: string,
  recipientCountry?: string
): CountryResolution {
  const dest = recipientCountry ?? senderCountry;
  const crossBorder = senderCountry !== dest;
  return {
    origin: senderCountry,
    destination: dest,
    crossBorder,
    corridor: `${senderCountry}-${dest}`,
  };
}

// ===== Failure Categories & Retry Matrix =====
//
// Classify every failure and determine the recovery strategy.
// The doc specifies a Retry Matrix:
//
// | Failure           | Retry? | Action                                 |
// | Timeout           |   Yes  | Retry same provider with backoff       |
// | Rate Limit        |   No   | Route to another provider              |
// | Provider Down     |   No   | Immediate failover                     |
// | Invalid Request   |   No   | Return validation error                |
// | Authentication    |   No   | Alert operations                       |
// | Duplicate Request |   No   | Return original transaction            |

export type FailureCategory =
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "PROVIDER_DOWN"
  | "INVALID_REQUEST"
  | "AUTHENTICATION"
  | "DUPLICATE_REQUEST"
  | "COMPLIANCE_BLOCK"
  | "CURRENCY_UNSUPPORTED"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

export interface RetryDecision {
  shouldRetry: boolean;
  shouldFailover: boolean;
  retrySameProvider: boolean;
  backoffMs: number;
  action: string;
}

export function classifyFailure(errorCode: ProviderErrorCode): FailureCategory {
  const map: Record<ProviderErrorCode, FailureCategory> = {
    PROVIDER_TIMEOUT: "TIMEOUT",
    RATE_LIMITED: "RATE_LIMIT",
    PROVIDER_DOWN: "PROVIDER_DOWN",
    INVALID_REQUEST: "INVALID_REQUEST",
    AUTH_FAILED: "AUTHENTICATION",
    DUPLICATE_REF: "DUPLICATE_REQUEST",
    COMPLIANCE_REJECT: "COMPLIANCE_BLOCK",
    NOT_SUPPORTED: "CURRENCY_UNSUPPORTED",
    UPSTREAM_ERROR: "INTERNAL_ERROR",
    BENEFICIARY_INVALID: "VALIDATION_ERROR",
    INSUFFICIENT_FUNDS: "VALIDATION_ERROR",
    UNKNOWN: "INTERNAL_ERROR",
  };
  return map[errorCode] ?? "INTERNAL_ERROR";
}

export function getRetryDecision(category: FailureCategory, attemptCount: number): RetryDecision {
  switch (category) {
    case "TIMEOUT":
      // Retry same provider with exponential backoff
      return {
        shouldRetry: attemptCount < 2,
        shouldFailover: attemptCount >= 2,
        retrySameProvider: attemptCount < 2,
        backoffMs: Math.pow(2, attemptCount) * 1000, // 1s, 2s
        action: "Retry same provider with backoff",
      };

    case "RATE_LIMIT":
      // Don't retry same — failover to another provider
      return {
        shouldRetry: false,
        shouldFailover: true,
        retrySameProvider: false,
        backoffMs: 0,
        action: "Route to another provider",
      };

    case "PROVIDER_DOWN":
      // Immediate failover
      return {
        shouldRetry: false,
        shouldFailover: true,
        retrySameProvider: false,
        backoffMs: 0,
        action: "Immediate failover",
      };

    case "AUTHENTICATION":
      // Don't retry — alert operations
      return {
        shouldRetry: false,
        shouldFailover: false,
        retrySameProvider: false,
        backoffMs: 0,
        action: "Alert operations — auth failure",
      };

    case "DUPLICATE_REQUEST":
      // Return original transaction
      return {
        shouldRetry: false,
        shouldFailover: false,
        retrySameProvider: false,
        backoffMs: 0,
        action: "Return original transaction",
      };

    case "INVALID_REQUEST":
    case "VALIDATION_ERROR":
    case "COMPLIANCE_BLOCK":
    case "CURRENCY_UNSUPPORTED":
      // Don't retry — these are permanent failures
      return {
        shouldRetry: false,
        shouldFailover: false,
        retrySameProvider: false,
        backoffMs: 0,
        action: "Return error — permanent failure",
      };

    case "INTERNAL_ERROR":
      // Retry once, then failover
      return {
        shouldRetry: attemptCount < 1,
        shouldFailover: attemptCount >= 1,
        retrySameProvider: attemptCount < 1,
        backoffMs: 2000,
        action: "Retry once, then failover",
      };

    default:
      return {
        shouldRetry: false,
        shouldFailover: true,
        retrySameProvider: false,
        backoffMs: 0,
        action: "Failover to another provider",
      };
  }
}

// ===== Weight Configuration =====
//
// The doc specifies these weights:
//   Country Support: 20, Currency: 15, Capability: 20, Health: 15,
//   Cost: 10, Latency: 10, Compliance: 10
//
// The existing routing-engine uses different weights.
// PIE allows configurable weights per merchant policy.

export interface RoutingWeights {
  country: number;
  currency: number;
  capability: number;
  health: number;
  cost: number;
  latency: number;
  compliance: number;
}

export const DEFAULT_PIE_WEIGHTS: RoutingWeights = {
  country: 20,
  currency: 15,
  capability: 20,
  health: 15,
  cost: 10,
  latency: 10,
  compliance: 10,
};

export const LOWEST_COST_WEIGHTS: RoutingWeights = {
  country: 15,
  currency: 10,
  capability: 15,
  health: 10,
  cost: 35, // cost dominates
  latency: 10,
  compliance: 5,
};

export const FASTEST_SETTLEMENT_WEIGHTS: RoutingWeights = {
  country: 15,
  currency: 10,
  capability: 15,
  health: 10,
  cost: 5,
  latency: 35, // speed dominates
  compliance: 10,
};

export const HIGHEST_SUCCESS_WEIGHTS: RoutingWeights = {
  country: 15,
  currency: 10,
  capability: 15,
  health: 35, // health dominates
  cost: 10,
  latency: 5,
  compliance: 10,
};

export function getWeightsForPolicy(policy: MerchantRoutingPolicy): RoutingWeights {
  switch (policy) {
    case "LOWEST_COST":
      return LOWEST_COST_WEIGHTS;
    case "FASTEST_SETTLEMENT":
      return FASTEST_SETTLEMENT_WEIGHTS;
    case "HIGHEST_SUCCESS_RATE":
      return HIGHEST_SUCCESS_WEIGHTS;
    default:
      return DEFAULT_PIE_WEIGHTS;
  }
}

// ===== Simulation Mode =====
//
// Support simulation mode to compare routing decisions without moving money.
// The doc requires: "Support simulation mode to compare routing decisions without moving money."

export interface SimulationResult {
  decision: RoutingDecision;
  candidates: CandidateEvaluation[];
  explanation: string;
  wouldExecute: boolean;
  simulatedAt: string;
}

export async function simulateRouting(
  request: RouteRequest,
  merchantPolicy?: MerchantPolicyConfig
): Promise<SimulationResult> {
  // Run the routing engine in dry-run mode
  const decision = await route(request);

  // Build candidate evaluations
  const candidates: CandidateEvaluation[] = decision.scores.map((s) => ({
    provider: s.providerCode,
    eligible: s.circuit !== "OPEN" && s.successRate >= 30,
    disqualificationReason:
      s.circuit === "OPEN"
        ? "Circuit OPEN"
        : s.successRate < 30
          ? "Success rate too low"
          : undefined,
    scores: {
      health: s.health,
      cost: s.charge,
      speed: s.speed,
      capability: 100,
      total: s.score,
    },
    circuitState: s.circuit,
    preferred: s.preferred,
  }));

  // Create explanation
  const explanation = createRoutingExplanation(
    {
      contract: request.contract,
      country: request.country,
      currency: request.currency,
      amountMinor: request.amountMinor,
      direction: request.direction,
      service: request.service,
      preferredProvider: merchantPolicy?.preferredProvider ?? request.preferredProvider,
    },
    candidates,
    decision.providerCode,
    decision.reason,
    decision.alternatives,
    candidates.find((c) => c.provider === decision.providerCode)?.scores ?? {
      health: 0,
      cost: 0,
      speed: 0,
      capability: 0,
      total: 0,
    },
    { amlPassed: true, sanctionsPassed: true, kycTierSufficient: true, featureFlagEnabled: true },
    0
  );

  return {
    decision,
    candidates,
    explanation: `Provider ${decision.providerCode} selected via ${decision.reason}. Alternatives: ${decision.alternatives.join(", ") || "none"}`,
    wouldExecute: decision.providerCode !== "",
    simulatedAt: new Date().toISOString(),
  };
}

// ===== Provider Heat Map =====
//
// Real-time provider health across countries.
// Operations Dashboard visualization.

export interface HeatMapEntry {
  provider: string;
  country: string;
  healthScore: number;
  successRate: number;
  avgLatencyMs: number;
  circuitState: string;
  transactionVolume: number;
  status: "HEALTHY" | "DEGRADED" | "DOWN";
}

export async function getProviderHeatMap(): Promise<HeatMapEntry[]> {
  const manifests = getAllManifests();
  const breakers = getBreakerStates();
  const entries: HeatMapEntry[] = [];

  for (const manifest of manifests) {
    const health = registry.getHealth(manifest.provider);
    const breaker = breakers[manifest.provider];

    for (const country of manifest.countries) {
      const score = health.score;
      const status: HeatMapEntry["status"] =
        breaker?.state === "OPEN" ? "DOWN" : score < 50 ? "DEGRADED" : "HEALTHY";

      entries.push({
        provider: manifest.provider,
        country,
        healthScore: score,
        successRate: score, // simplified — in prod would be from ProviderHealthCheck
        avgLatencyMs: 0, // would be from health samples
        circuitState: breaker?.state ?? "CLOSED",
        transactionVolume: 0, // would be from transaction aggregate
        status,
      });
    }
  }

  return entries;
}

// ===== Learning Engine =====
//
// Every transaction updates statistics.
// TurboCore tracks trends (improving/declining) per provider.

export interface ProviderTrend {
  provider: string;
  yesterdaySuccessRate: number;
  todaySuccessRate: number;
  trend: "IMPROVING" | "DECLINING" | "STABLE";
  trendPercentage: number;
  recommendations: string[];
}

export async function getProviderTrends(): Promise<ProviderTrend[]> {
  const manifests = getAllManifests();
  const trends: ProviderTrend[] = [];

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  for (const manifest of manifests) {
    // Query today's success rate
    const todayTx = await db.transaction.findMany({
      where: {
        provider: manifest.provider,
        createdAt: { gte: todayStart },
        status: { in: ["SUCCESS", "FAILED"] },
      },
      select: { status: true },
    });
    const todaySuccess = todayTx.filter((t) => t.status === "SUCCESS").length;
    const todayRate = todayTx.length > 0 ? (todaySuccess / todayTx.length) * 100 : 100;

    // Query yesterday's success rate
    const yesterdayTx = await db.transaction.findMany({
      where: {
        provider: manifest.provider,
        createdAt: { gte: yesterdayStart, lt: todayStart },
        status: { in: ["SUCCESS", "FAILED"] },
      },
      select: { status: true },
    });
    const yesterdaySuccess = yesterdayTx.filter((t) => t.status === "SUCCESS").length;
    const yesterdayRate =
      yesterdayTx.length > 0 ? (yesterdaySuccess / yesterdayTx.length) * 100 : 100;

    // Compute trend
    const diff = todayRate - yesterdayRate;
    const trend: ProviderTrend["trend"] =
      diff > 2 ? "IMPROVING" : diff < -2 ? "DECLINING" : "STABLE";

    const recommendations: string[] = [];
    if (trend === "DECLINING") {
      recommendations.push(`Consider reducing routing weight for ${manifest.provider}`);
      recommendations.push("Investigate recent failures");
    }
    if (trend === "IMPROVING") {
      recommendations.push(`Consider increasing routing weight for ${manifest.provider}`);
    }

    trends.push({
      provider: manifest.provider,
      yesterdaySuccessRate: Math.round(yesterdayRate),
      todaySuccessRate: Math.round(todayRate),
      trend,
      trendPercentage: Math.round(Math.abs(diff) * 10) / 10,
      recommendations,
    });
  }

  return trends;
}

// ===== Compliance-Aware Routing =====
//
// Check if a provider can legally process a transaction.
// Technical capability does not imply regulatory permission.

export async function checkCompliance(
  provider: string,
  origin: string,
  destination: string,
  amount: number
): Promise<{ passed: boolean; reason?: string }> {
  // Check feature flags for parked providers
  if (provider === "stripe") {
    const enabled = await isFeatureEnabled(FeatureFlags.STRIPE_ENABLED);
    if (!enabled) return { passed: false, reason: "Stripe is parked (feature flag disabled)" };
  }
  if (provider === "wise") {
    const enabled = await isFeatureEnabled(FeatureFlags.WISE_ENABLED);
    if (!enabled) return { passed: false, reason: "Wise is parked (feature flag disabled)" };
  }

  // Cross-border compliance check
  if (origin !== destination) {
    // Check if provider supports cross-border for this corridor
    const manifest = getAllManifests().find((m) => m.provider === provider);
    if (manifest && !manifest.countries.includes("ALL")) {
      if (!manifest.countries.includes(origin) || !manifest.countries.includes(destination)) {
        return {
          passed: false,
          reason: `Provider ${provider} does not support corridor ${origin}-${destination}`,
        };
      }
    }
  }

  return { passed: true };
}

// ===== Risk-Aware Routing =====
//
// High-risk transactions use stricter routing.

export async function assessRisk(
  userId: string,
  amount: number,
  direction: string
): Promise<{
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  requiresEnhancedKYC: boolean;
  recommendations: string[];
}> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { kycTier: true, kycStatus: true },
  });

  if (!user)
    return { riskLevel: "HIGH", requiresEnhancedKYC: true, recommendations: ["User not found"] };

  // Run AML rules
  const amlResult = await runAmlRules({
    userId,
    amountMinor: amount,
    direction: direction === "OUTBOUND" ? "DEBIT" : "CREDIT",
    kycTier: user.kycTier,
  });

  let riskLevel: "LOW" | "MEDIUM" | "HIGH" = "LOW";
  const recommendations: string[] = [];

  if (amlResult.flagged) {
    riskLevel = amlResult.severity === "HIGH" ? "HIGH" : "MEDIUM";
    recommendations.push(`AML flag: ${amlResult.description}`);
  }

  // High amount = higher risk
  if (amount > 50_000_000) {
    riskLevel = riskLevel === "LOW" ? "MEDIUM" : "HIGH";
    recommendations.push("Large transaction — consider step-up authentication");
  }

  // Unverified KYC + outbound = high risk
  if (user.kycStatus !== "VERIFIED" && direction === "OUTBOUND") {
    riskLevel = "HIGH";
    recommendations.push("Unverified KYC — block outbound transfer");
  }

  return {
    riskLevel,
    requiresEnhancedKYC: riskLevel === "HIGH",
    recommendations,
  };
}
