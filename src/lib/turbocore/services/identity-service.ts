// TurboCore Bounded Service — Identity Service
//
// Thin facade over the KYC engine + compliance screen. TurboPay (and future
// apps) call this service instead of reaching into kyc-engine / compliance
// modules directly. Enforces Rule 1: provider calls only happen through the
// Provider SDK — never directly from business logic.
//
// Responsibilities:
//   - Identity verification (Tier 2 / Tier 3) via country-aware KYC routing
//   - KYC status lookups (current tier, available upgrades, history)
//   - Supported-country discovery (drives onboarding flows)
//   - Sanctions screening of arbitrary entities (recipient names, businesses)
//   - AML rule execution (velocity, large amount, structuring, rapid transfer)

import {
  verifyIdentity,
  getUserKycStatus,
  listSupportedCountries,
  type KycVerificationResult,
} from "@/lib/turbocore/kyc-engine";
import { screenEntity, runAmlRules } from "@/lib/turbocore/compliance/screen";

export interface IdentityVerificationInput {
  userId: string;
  country: string;
  tier: 2 | 3;
  idType: string;
  idValue: string;
  additionalFields?: Record<string, string>;
}

export interface AmlAssessmentInput {
  userId: string;
  amountMinor: number;
  direction: string; // "CREDIT" | "DEBIT"
  kycTier: number;
}

export const identityService = {
  /**
   * Verify a user's identity by routing to the best available KYC provider
   * for the country + ID type. Updates the user's KYC tier on success and
   * persists a KycVerification record.
   */
  async verifyIdentity(input: IdentityVerificationInput): Promise<KycVerificationResult> {
    return verifyIdentity({
      userId: input.userId,
      country: input.country,
      tier: input.tier,
      idType: input.idType,
      idValue: input.idValue,
      additionalFields: input.additionalFields,
    });
  },

  /**
   * Get the user's current KYC status — tier, kycStatus, available upgrades,
   * country config and verification history.
   */
  async getStatus(userId: string) {
    return getUserKycStatus(userId);
  },

  /**
   * List all countries TurboPay can onboard users in, with their per-tier
   * KYC requirements (ID types, formats, limits, preferred providers).
   */
  async getCountries() {
    return listSupportedCountries();
  },

  /**
   * Screen an arbitrary entity (recipient name, business, beneficiary)
   * against the sanctions list using Jaro-Winkler fuzzy matching.
   * Records a ScreeningResult row for every check.
   */
  async screenEntity(
    name: string,
    opts?: { entityType?: string; userId?: string; transactionId?: string }
  ) {
    return screenEntity({
      name,
      entityType: opts?.entityType ?? "TRANSACTION",
      userId: opts?.userId,
      transactionId: opts?.transactionId,
    });
  },

  /**
   * Run AML rules against a prospective transaction. Checks velocity,
   * large-amount thresholds (tier-aware), rapid-transfer-after-funding,
   * and structuring patterns. High-severity flags freeze the wallet +
   * open a compliance case automatically.
   */
  async runAmlRules(input: AmlAssessmentInput) {
    return runAmlRules({
      userId: input.userId,
      amountMinor: input.amountMinor,
      direction: input.direction,
      kycTier: input.kycTier,
    });
  },
};
