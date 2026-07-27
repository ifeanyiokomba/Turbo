// TurboCore Routing Explainability
//
// Every routing decision should be explainable and logged.
//
// When TurboCore selects a provider, it produces a RoutingExplanation
// that documents WHY this provider was chosen:
//   - What country was requested
//   - What currency
//   - What capability
//   - Which providers were candidates
//   - How each scored on health, cost, latency, compliance
//   - Why the winner was selected
//   - What the failover chain is
//
// This is stored for audit, compliance, and debugging.

export interface RoutingExplanation {
  requestId: string;
  timestamp: string;

  // Request context
  request: {
    contract: string;
    country: string;
    currency: string;
    amountMinor: number;
    direction: string;
    service?: string;
    preferredProvider?: string;
  };

  // Candidate evaluation
  candidates: CandidateEvaluation[];

  // Winner
  selectedProvider: string;
  selectionReason: string;

  // Failover chain
  failoverChain: string[];

  // Scores breakdown for the winner
  winnerScores: {
    health: number;
    cost: number;
    speed: number;
    capability: number;
    total: number;
  };

  // Compliance checks
  complianceChecks: {
    amlPassed: boolean;
    sanctionsPassed: boolean;
    kycTierSufficient: boolean;
    featureFlagEnabled: boolean;
  };

  // Decision metadata
  decisionDurationMs: number;
}

export interface CandidateEvaluation {
  provider: string;
  eligible: boolean;
  disqualificationReason?: string;
  scores: {
    health: number;
    cost: number;
    speed: number;
    capability: number;
    total: number;
  };
  circuitState: string;
  preferred: boolean;
}

// ===== Explainable Routing =====

export function createRoutingExplanation(
  request: {
    contract: string;
    country: string;
    currency: string;
    amountMinor: number;
    direction: string;
    service?: string;
    preferredProvider?: string;
  },
  candidates: CandidateEvaluation[],
  selectedProvider: string,
  selectionReason: string,
  failoverChain: string[],
  winnerScores: { health: number; cost: number; speed: number; capability: number; total: number },
  complianceChecks: {
    amlPassed: boolean;
    sanctionsPassed: boolean;
    kycTierSufficient: boolean;
    featureFlagEnabled: boolean;
  },
  decisionDurationMs: number
): RoutingExplanation {
  return {
    requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    request,
    candidates,
    selectedProvider,
    selectionReason,
    failoverChain,
    winnerScores,
    complianceChecks,
    decisionDurationMs,
  };
}

// ===== Human-Readable Explanation =====

export function explainRouting(explanation: RoutingExplanation): string {
  const lines: string[] = [];

  lines.push(`ROUTING DECISION — ${explanation.requestId}`);
  lines.push(`Time: ${explanation.timestamp}`);
  lines.push(`Duration: ${explanation.decisionDurationMs}ms`);
  lines.push("");
  lines.push("Request:");
  lines.push(`  Contract: ${explanation.request.contract}`);
  lines.push(`  Country: ${explanation.request.country}`);
  lines.push(`  Currency: ${explanation.request.currency}`);
  lines.push(`  Amount: ${explanation.request.amountMinor} (minor units)`);
  lines.push(`  Direction: ${explanation.request.direction}`);
  if (explanation.request.service) lines.push(`  Service: ${explanation.request.service}`);
  if (explanation.request.preferredProvider)
    lines.push(`  Preferred: ${explanation.request.preferredProvider}`);
  lines.push("");
  lines.push("Candidates evaluated:");
  for (const c of explanation.candidates) {
    const status = c.eligible ? "✅ ELIGIBLE" : `❌ DISQUALIFIED (${c.disqualificationReason})`;
    const pref = c.preferred ? " [PREFERRED]" : "";
    lines.push(`  ${c.provider}${pref}: ${status}`);
    if (c.eligible) {
      lines.push(
        `    Health: ${c.scores.health} | Cost: ${c.scores.cost} | Speed: ${c.scores.speed} | Capability: ${c.scores.capability} | Total: ${c.scores.total}`
      );
      lines.push(`    Circuit: ${c.circuitState}`);
    }
  }
  lines.push("");
  lines.push(`SELECTED: ${explanation.selectedProvider}`);
  lines.push(`Reason: ${explanation.selectionReason}`);
  lines.push(`Failover chain: ${explanation.failoverChain.join(" → ")}`);
  lines.push("");
  lines.push("Compliance checks:");
  lines.push(`  AML: ${explanation.complianceChecks.amlPassed ? "✅ PASS" : "❌ FAIL"}`);
  lines.push(
    `  Sanctions: ${explanation.complianceChecks.sanctionsPassed ? "✅ PASS" : "❌ FAIL"}`
  );
  lines.push(
    `  KYC Tier: ${explanation.complianceChecks.kycTierSufficient ? "✅ SUFFICIENT" : "❌ INSUFFICIENT"}`
  );
  lines.push(
    `  Feature Flag: ${explanation.complianceChecks.featureFlagEnabled ? "✅ ENABLED" : "❌ DISABLED"}`
  );

  return lines.join("\n");
}

// ===== Store explanations for audit =====

const explanationStore = new Map<string, RoutingExplanation>();

export function storeExplanation(explanation: RoutingExplanation): void {
  explanationStore.set(explanation.requestId, explanation);

  // Also persist to DB for audit (lazy import to avoid circular deps)
  try {
    import("@/lib/db").then(({ db }) => {
      db.paymentRoutingDecision.create({
        data: {
          contract: explanation.request.contract,
          providerCode: explanation.selectedProvider,
          chosenProvider: explanation.selectedProvider,
          reason: explanation.selectionReason,
          scoresJSON: JSON.stringify(explanation.candidates),
          alternativesJSON: JSON.stringify(explanation.failoverChain),
          requestId: explanation.requestId,
        },
      });
    });
  } catch {
    // Non-fatal — in-memory store is sufficient for real-time use
  }
}

export function getExplanation(requestId: string): RoutingExplanation | null {
  return explanationStore.get(requestId) ?? null;
}

export function getRecentExplanations(limit = 20): RoutingExplanation[] {
  const all = Array.from(explanationStore.values());
  return all.slice(-limit).reverse();
}
