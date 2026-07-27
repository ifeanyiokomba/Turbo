// TurboCore GCR — Capability Resolution Engine
//
// The engine asks, in order:
//   1. Which providers implement this capability?
//   2. Which are active (not PARKED)?
//   3. Which support the requested currency?
//   4. Which are healthy (circuit-breaker closed)?
//   5. Which satisfy compliance (KYC tier + country matrix)?
//
// Only then does it return candidates to the Provider Intelligence Engine.
//
// Dependencies are validated before any candidate is returned — if a hard
// dependency is unsatisfied, resolution fails with an explanatory reason.

import { getCapability } from "./capability-tree";
import { areHardDependenciesSatisfied, getPrerequisiteTree } from "./knowledge-graph";
import { getCountryCapabilitySupport, getCountryProfile } from "./country-matrix";
import { getProvidersForCapabilityInCountry } from "./provider-matrix";
import { evaluateCapabilityFlags } from "./flags";
import { getBreakerStates, registry } from "../registry";
import type {
  Capability,
  CapabilityDirection,
  ResolutionCandidate,
  ResolutionRequest,
  ResolutionResult,
} from "./types";

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export async function resolveCapability(request: ResolutionRequest): Promise<ResolutionResult> {
  const start = Date.now();
  const cap = getCapability(request.capabilityId);

  if (!cap) {
    return {
      request,
      resolved: false,
      candidates: [],
      failoverChain: [],
      reason: `Unknown capability: ${request.capabilityId}`,
      capability: {} as Capability,
      dependenciesChecked: [],
      durationMs: Date.now() - start,
    };
  }

  // 0. Validate dependencies first — short-circuit if any REQUIRES is unsatisfied
  const deps = cap.dependencies;
  const dependenciesChecked = deps.map((d) => {
    const depCap = getCapability(d.capabilityId);
    const satisfied = depCap
      ? depCap.status !== "PLANNED" && depCap.status !== "DEPRECATED"
      : false;
    return {
      capabilityId: d.capabilityId,
      satisfied,
      reason: satisfied
        ? `${d.capabilityId} is ${depCap?.status ?? "MISSING"}`
        : `${d.capabilityId} is ${depCap?.status ?? "MISSING"} — blocks resolution`,
    };
  });

  const hasUnsatisfiedHardDep = dependenciesChecked.some(
    (d) =>
      !d.satisfied && deps.find((dep) => dep.capabilityId === d.capabilityId)?.kind === "REQUIRES"
  );
  if (hasUnsatisfiedHardDep) {
    const blocker = dependenciesChecked.find((d) => !d.satisfied);
    return {
      request,
      resolved: false,
      candidates: [],
      failoverChain: [],
      reason: `Blocked by unsatisfied dependency: ${blocker?.capabilityId}`,
      capability: cap,
      dependenciesChecked,
      durationMs: Date.now() - start,
    };
  }

  // 1. Country matrix — is this capability available in this country?
  const countrySupport = getCountryCapabilitySupport(request.country, request.capabilityId);
  if (countrySupport === "DISABLED") {
    return {
      request,
      resolved: false,
      candidates: [],
      failoverChain: [],
      reason: `Capability ${request.capabilityId} is DISABLED in ${request.country}`,
      capability: cap,
      dependenciesChecked,
      durationMs: Date.now() - start,
    };
  }

  // 2. KYC tier check
  if (request.kycTier !== undefined && request.kycTier < cap.requiredKycTier) {
    return {
      request,
      resolved: false,
      candidates: [],
      failoverChain: [],
      reason: `Customer KYC tier ${request.kycTier} below required ${cap.requiredKycTier}`,
      capability: cap,
      dependenciesChecked,
      durationMs: Date.now() - start,
    };
  }

  // 3. Direction check
  if (request.direction) {
    const directionOk =
      cap.direction === "NEUTRAL" ||
      cap.direction === "BOTH" ||
      cap.direction === request.direction;
    if (!directionOk) {
      return {
        request,
        resolved: false,
        candidates: [],
        failoverChain: [],
        reason: `Capability direction ${cap.direction} does not match request ${request.direction}`,
        capability: cap,
        dependenciesChecked,
        durationMs: Date.now() - start,
      };
    }
  }

  // 4. Currency check (if capability declares specific currencies)
  if (
    request.currency &&
    !cap.currencies.includes("ALL") &&
    !cap.currencies.includes(request.currency)
  ) {
    return {
      request,
      resolved: false,
      candidates: [],
      failoverChain: [],
      reason: `Capability does not support currency ${request.currency} (supports: ${cap.currencies.join(", ")})`,
      capability: cap,
      dependenciesChecked,
      durationMs: Date.now() - start,
    };
  }

  // 5. Feature flags — is the capability enabled for this context?
  const flagResult = await evaluateCapabilityFlags({
    capabilityId: request.capabilityId,
    country: request.country,
    merchantId: request.merchantId,
    userTier: request.kycTier,
    environment: request.environment,
  });
  if (!flagResult.enabled) {
    return {
      request,
      resolved: false,
      candidates: [],
      failoverChain: [],
      reason: `Capability disabled by flag: ${flagResult.reason}`,
      capability: cap,
      dependenciesChecked,
      durationMs: Date.now() - start,
    };
  }

  // 6. Provider matrix — which providers implement this capability in this country?
  const providerEntries = getProvidersForCapabilityInCountry(request.capabilityId, request.country);
  if (providerEntries.length === 0) {
    return {
      request,
      resolved: false,
      candidates: [],
      failoverChain: [],
      reason: `No provider implements ${request.capabilityId} in ${request.country}`,
      capability: cap,
      dependenciesChecked,
      durationMs: Date.now() - start,
    };
  }

  // 7. Filter out PARKED providers + maturity check
  const active = providerEntries.filter((e) => e.maturity !== "PARKED" && e.maturity !== "ROADMAP");
  if (active.length === 0) {
    return {
      request,
      resolved: false,
      candidates: [],
      failoverChain: [],
      reason: `All providers for ${request.capabilityId} in ${request.country} are PARKED or ROADMAP`,
      capability: cap,
      dependenciesChecked,
      durationMs: Date.now() - start,
    };
  }

  // 8. Health check — circuit breaker must be closed
  const breakerStates = getBreakerStates();
  const candidates: ResolutionCandidate[] = [];
  for (const entry of active) {
    let healthOk = true;
    let healthReason = "";
    const breaker = breakerStates[entry.providerCode];
    if (breaker && breaker.state === "OPEN") {
      healthOk = false;
      healthReason = `circuit OPEN (health ${Math.round(breaker.score)}%, ${breaker.failures} failures)`;
    }

    // Score: maturity + health + country support level
    const maturityScore =
      entry.maturity === "NATIVE"
        ? 40
        : entry.maturity === "SUPPORTED"
          ? 30
          : entry.maturity === "BETA"
            ? 15
            : entry.maturity === "LIMITED"
              ? 10
              : 0;

    const countryScore =
      countrySupport === "FULL"
        ? 30
        : countrySupport === "BETA"
          ? 15
          : countrySupport === "LIMITED"
            ? 10
            : 5;
    const healthScore = healthOk ? 30 : 0;
    const score = maturityScore + countryScore + healthScore;

    const reasons: string[] = [`maturity=${entry.maturity}`, `country-support=${countrySupport}`];
    if (healthOk) {
      const health = registry.getHealth(entry.providerCode);
      reasons.push(`circuit=CLOSED (health ${Math.round(health.score)}%)`);
    } else {
      reasons.push(`circuit=OPEN (${healthReason})`);
    }

    candidates.push({
      providerCode: entry.providerCode,
      maturity: entry.maturity,
      score,
      reasons,
      features: entry.features,
      version: entry.version,
    });
  }

  // Sort by score desc; healthy providers rank above unhealthy ones even if scores tie
  candidates.sort((a, b) => {
    const aOpen = a.reasons.some((r) => r.startsWith("circuit=OPEN"));
    const bOpen = b.reasons.some((r) => r.startsWith("circuit=OPEN"));
    if (aOpen && !bOpen) return 1;
    if (!aOpen && bOpen) return -1;
    return b.score - a.score;
  });

  // Failover chain: ordered list of healthy providers (best first)
  const failoverChain = candidates
    .filter((c) => !c.reasons.some((r) => r.startsWith("circuit=OPEN")))
    .map((c) => c.providerCode);

  const resolved = failoverChain.length > 0;

  return {
    request,
    resolved,
    candidates,
    failoverChain,
    reason: resolved ? undefined : "All candidates have open circuit breakers",
    capability: cap,
    dependenciesChecked,
    durationMs: Date.now() - start,
  };
}

/**
 * Returns a human-readable explanation of *why* a capability is (or isn't)
 * available for the given context. Powers the admin "explain" surface.
 */
export async function explainResolution(request: ResolutionRequest): Promise<{
  resolution: ResolutionResult;
  prerequisiteTree: ReturnType<typeof getPrerequisiteTree>;
  countryProfile: ReturnType<typeof getCountryProfile>;
  explanation: string;
}> {
  const resolution = await resolveCapability(request);
  const prerequisiteTree = getPrerequisiteTree(request.capabilityId);
  const countryProfile = getCountryProfile(request.country);

  let explanation: string;
  if (resolution.resolved) {
    explanation =
      `${request.capabilityId} is available in ${request.country}. ` +
      `Primary provider: ${resolution.failoverChain[0]}. ` +
      `Failover chain: ${resolution.failoverChain.join(" → ")}.`;
  } else {
    explanation =
      `${request.capabilityId} is NOT available in ${request.country}. ` +
      `Reason: ${resolution.reason}.`;
    if (prerequisiteTree.hasUnsatisfied) {
      explanation += " Some prerequisites are not satisfied.";
    }
  }

  return { resolution, prerequisiteTree, countryProfile, explanation };
}

/**
 * Batch resolve multiple capabilities at once (e.g. "what can this customer do
 * in country NG?"). Used by the dashboard "capability passport".
 */
export async function resolveAllForCountry(
  country: string,
  options?: { kycTier?: number; currency?: string }
): Promise<Array<{ capabilityId: string; resolved: boolean; providers: string[] }>> {
  // Import here to avoid circular dependency at module load
  const { CAPABILITIES } = await import("./capability-tree");
  const results = await Promise.all(
    CAPABILITIES.map(async (cap) => {
      const r = await resolveCapability({
        country,
        capabilityId: cap.id,
        currency: options?.currency,
        kycTier: options?.kycTier as any,
      });
      return {
        capabilityId: cap.id,
        resolved: r.resolved,
        providers: r.failoverChain,
      };
    })
  );
  return results;
}

// Re-export direction type for callers
export type { CapabilityDirection };
