// TurboCore Bounded Service — Risk Service
//
// Aggregates compliance signals (AML rules + sanctions screening + fraud
// heuristics) into a single risk-assessment surface. Risk-Service is the
// only place that should create AmlFlag rows directly; everywhere else
// goes through identityService.runAmlRules (which calls into the same
// compliance module but also auto-freezes on HIGH severity).

import { db } from "@/lib/db";
import { runAmlRules, screenEntity } from "@/lib/turbocore/compliance/screen";

export interface RiskAssessment {
  userId: string;
  amountMinor: number;
  direction: string;
  sanctionsHit: boolean;
  sanctionsScore: number;
  amlFlagged: boolean;
  amlRule?: string;
  amlSeverity?: string;
  amlDescription?: string;
  recommendation: "ALLOW" | "REVIEW" | "BLOCK";
  reason: string;
}

export interface RiskScoreResult {
  userId: string;
  score: number; // 0-100, higher = riskier
  factors: {
    kycTier: number;
    kycRisk: number;
    amlFlagsUnresolved: number;
    recentDevices: number;
    recentFailedTx: number;
  };
}

export interface ScreenTransactionInput {
  userId: string;
  amountMinor: number;
  recipient?: { name?: string; accountNumber?: string; bankName?: string };
}

export interface ScreenTransactionResult extends RiskAssessment {
  recipientScreened: boolean;
}

export interface FlagInput {
  userId: string;
  rule: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  description: string;
  metadata?: Record<string, unknown>;
}

export const riskService = {
  /**
   * Run a combined risk assessment: sanctions screen + AML rules + KYC
   * tier check. Returns an overall recommendation (ALLOW/REVIEW/BLOCK)
   * suitable for the orchestrator's pre-flight check.
   */
  async assessRisk(
    userId: string,
    amountMinor: number,
    direction: "INBOUND" | "OUTBOUND"
  ): Promise<RiskAssessment> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { kycTier: true, status: true, fullName: true },
    });

    // Sanctions screen — screen the user's own name on inbound (funding source
    // check) or the recipient name on outbound (already done by TurboPay.pay,
    // but we re-run here for callers that bypass the orchestrator).
    const screen = await screenEntity({
      name: user?.fullName ?? userId,
      entityType: "USER",
      userId,
    });

    const amlDirection = direction === "OUTBOUND" ? "DEBIT" : "CREDIT";
    const aml = await runAmlRules({
      userId,
      amountMinor,
      direction: amlDirection,
      kycTier: user?.kycTier ?? 1,
    });

    let recommendation: RiskAssessment["recommendation"] = "ALLOW";
    let reason = "No risk indicators";
    if (screen.hit) {
      recommendation = "BLOCK";
      reason = `Sanctions hit (score ${screen.score.toFixed(2)})`;
    } else if (aml.flagged && aml.severity === "HIGH") {
      recommendation = "BLOCK";
      reason = `AML HIGH: ${aml.description ?? aml.rule}`;
    } else if (aml.flagged) {
      recommendation = "REVIEW";
      reason = `AML ${aml.severity}: ${aml.description ?? aml.rule}`;
    }

    return {
      userId,
      amountMinor,
      direction,
      sanctionsHit: screen.hit,
      sanctionsScore: screen.score,
      amlFlagged: aml.flagged,
      amlRule: aml.rule,
      amlSeverity: aml.severity,
      amlDescription: aml.description,
      recommendation,
      reason,
    };
  },

  /**
   * Compute a 0-100 risk score for a user based on:
   *   - KYC tier (1→40, 2→20, 3→10)
   *   - Unresolved AML flags (each +15, capped at 40)
   *   - Distinct recent devices (each +5, capped at 20)
   *   - Recent failed transactions (each +2, capped at 20)
   */
  async getRiskScore(userId: string): Promise<RiskScoreResult> {
    const [user, amlFlags, devices, recentFailed] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: { kycTier: true },
      }),
      db.amlFlag.count({
        where: { userId, resolved: false },
      }),
      db.device.count({
        where: { userId, lastSeenAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60_000) } },
      }),
      db.transaction.count({
        where: {
          userId,
          status: "FAILED",
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60_000) },
        },
      }),
    ]);

    const kycTier = user?.kycTier ?? 1;
    const kycRisk = kycTier >= 3 ? 10 : kycTier === 2 ? 20 : 40;
    const amlRisk = Math.min(40, amlFlags * 15);
    const deviceRisk = Math.min(20, devices * 5);
    const failedRisk = Math.min(20, recentFailed * 2);
    const score = Math.min(100, kycRisk + amlRisk + deviceRisk + failedRisk);

    return {
      userId,
      score,
      factors: {
        kycTier,
        kycRisk,
        amlFlagsUnresolved: amlFlags,
        recentDevices: devices,
        recentFailedTx: recentFailed,
      },
    };
  },

  /** Create an AmlFlag row directly (admin/analyst action or custom rule). */
  async flagUser(input: FlagInput) {
    return db.amlFlag.create({
      data: {
        userId: input.userId,
        rule: input.rule,
        severity: input.severity,
        description: input.description,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        resolved: false,
      },
    });
  },

  /** List AML flags, optionally filtered by user. Newest first. */
  async listFlags(userId?: string, limit = 50) {
    return db.amlFlag.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
  },

  /**
   * Pre-transaction screen: sanctions screen the recipient (if named) +
   * run AML rules on the user + amount + direction. Returns the combined
   * assessment with a recommendation.
   */
  async screenTransaction(
    userId: string,
    amountMinor: number,
    recipient?: ScreenTransactionInput["recipient"]
  ): Promise<ScreenTransactionResult> {
    let recipientScreened = false;
    if (recipient?.name) {
      await screenEntity({
        name: recipient.name,
        entityType: "TRANSACTION",
        userId,
      });
      recipientScreened = true;
    }

    const assessment = await riskService.assessRisk(userId, amountMinor, "OUTBOUND");
    return { ...assessment, recipientScreened };
  },
};
