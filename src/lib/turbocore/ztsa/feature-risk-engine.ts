// TurboCore — Feature Risk Engine (Chapter 10, Production Enhancement #2)
//
// "Assign every platform feature a risk level. Authentication requirements
//  scale with risk."
//
//   View Dashboard     → Low      → Session only
//   Update Profile     → Medium   → Session + KYC
//   Transfer Funds     → High     → Session + MFA
//   Rotate Provider Keys → Critical → Session + MFA + Step-up

import type { FeatureRiskProfile, RiskLevel, AuthRequirement } from "./types";

// ---------------------------------------------------------------------------
// Feature risk profiles (~40 features)
// ---------------------------------------------------------------------------

export const FEATURE_RISK_PROFILES: FeatureRiskProfile[] = [
  // ===== LOW RISK — Session only =====
  {
    feature: "dashboard.view",
    name: "View Dashboard",
    riskLevel: "LOW",
    requiredAuth: "SESSION",
    requiredPermissions: [],
    requiredKycTier: 0,
    maxRequestsPerMinute: 60,
    description: "View account dashboard.",
  },
  {
    feature: "wallet.balance",
    name: "View Wallet Balance",
    riskLevel: "LOW",
    requiredAuth: "SESSION",
    requiredPermissions: ["wallet.read"],
    requiredKycTier: 0,
    maxRequestsPerMinute: 60,
    description: "View wallet balance.",
  },
  {
    feature: "transactions.history",
    name: "View Transaction History",
    riskLevel: "LOW",
    requiredAuth: "SESSION",
    requiredPermissions: ["transactions.read"],
    requiredKycTier: 0,
    maxRequestsPerMinute: 30,
    description: "View transaction history.",
  },
  {
    feature: "beneficiaries.list",
    name: "List Beneficiaries",
    riskLevel: "LOW",
    requiredAuth: "SESSION",
    requiredPermissions: ["beneficiaries.read"],
    requiredKycTier: 0,
    maxRequestsPerMinute: 30,
    description: "List saved beneficiaries.",
  },
  {
    feature: "profile.view",
    name: "View Profile",
    riskLevel: "LOW",
    requiredAuth: "SESSION",
    requiredPermissions: [],
    requiredKycTier: 0,
    maxRequestsPerMinute: 30,
    description: "View own profile.",
  },

  // ===== MEDIUM RISK — Session + KYC =====
  {
    feature: "profile.update",
    name: "Update Profile",
    riskLevel: "MEDIUM",
    requiredAuth: "SESSION",
    requiredPermissions: ["profile.update"],
    requiredKycTier: 1,
    maxRequestsPerMinute: 10,
    description: "Update profile information.",
  },
  {
    feature: "wallet.fund",
    name: "Fund Wallet",
    riskLevel: "MEDIUM",
    requiredAuth: "SESSION",
    requiredPermissions: ["wallet.fund"],
    requiredKycTier: 1,
    maxRequestsPerMinute: 10,
    description: "Fund wallet from external source.",
  },
  {
    feature: "airtime.purchase",
    name: "Purchase Airtime",
    riskLevel: "MEDIUM",
    requiredAuth: "SESSION",
    requiredPermissions: ["airtime.purchase"],
    requiredKycTier: 1,
    maxRequestsPerMinute: 10,
    description: "Purchase airtime.",
  },
  {
    feature: "bills.pay",
    name: "Pay Bills",
    riskLevel: "MEDIUM",
    requiredAuth: "SESSION",
    requiredPermissions: ["bills.pay"],
    requiredKycTier: 1,
    maxRequestsPerMinute: 10,
    description: "Pay utility bills.",
  },
  {
    feature: "payment_link.create",
    name: "Create Payment Link",
    riskLevel: "MEDIUM",
    requiredAuth: "SESSION",
    requiredPermissions: ["payment_links.create"],
    requiredKycTier: 1,
    maxRequestsPerMinute: 10,
    description: "Create a payment link.",
  },
  {
    feature: "beneficiaries.add",
    name: "Add Beneficiary",
    riskLevel: "MEDIUM",
    requiredAuth: "SESSION",
    requiredPermissions: ["beneficiaries.create"],
    requiredKycTier: 1,
    maxRequestsPerMinute: 10,
    description: "Add a new beneficiary.",
  },

  // ===== HIGH RISK — Session + MFA =====
  {
    feature: "wallet.transfer",
    name: "Transfer Funds",
    riskLevel: "HIGH",
    requiredAuth: "MFA",
    requiredPermissions: ["wallet.transfer"],
    requiredKycTier: 2,
    maxRequestsPerMinute: 5,
    description: "Transfer funds to bank or wallet.",
  },
  {
    feature: "wallet.withdraw",
    name: "Withdraw Funds",
    riskLevel: "HIGH",
    requiredAuth: "MFA",
    requiredPermissions: ["wallet.withdraw"],
    requiredKycTier: 2,
    maxRequestsPerMinute: 5,
    description: "Withdraw funds to bank account.",
  },
  {
    feature: "payment.initiate",
    name: "Initiate Payment",
    riskLevel: "HIGH",
    requiredAuth: "MFA",
    requiredPermissions: ["payment.create"],
    requiredKycTier: 2,
    maxRequestsPerMinute: 5,
    description: "Initiate a payment.",
  },
  {
    feature: "card.virtual.create",
    name: "Create Virtual Card",
    riskLevel: "HIGH",
    requiredAuth: "MFA",
    requiredPermissions: ["cards.create"],
    requiredKycTier: 2,
    maxRequestsPerMinute: 3,
    description: "Create a virtual card.",
  },
  {
    feature: "savings.withdraw",
    name: "Withdraw Savings",
    riskLevel: "HIGH",
    requiredAuth: "MFA",
    requiredPermissions: ["savings.withdraw"],
    requiredKycTier: 2,
    maxRequestsPerMinute: 3,
    description: "Withdraw from savings.",
  },
  {
    feature: "intl.transfer",
    name: "International Transfer",
    riskLevel: "HIGH",
    requiredAuth: "MFA",
    requiredPermissions: ["intl.transfer"],
    requiredKycTier: 3,
    maxRequestsPerMinute: 3,
    description: "International money transfer.",
  },
  {
    feature: "pin.change",
    name: "Change PIN",
    riskLevel: "HIGH",
    requiredAuth: "MFA",
    requiredPermissions: ["pin.change"],
    requiredKycTier: 1,
    maxRequestsPerMinute: 3,
    description: "Change transaction PIN.",
  },
  {
    feature: "password.change",
    name: "Change Password",
    riskLevel: "HIGH",
    requiredAuth: "MFA",
    requiredPermissions: [],
    requiredKycTier: 0,
    maxRequestsPerMinute: 3,
    description: "Change account password.",
  },

  // ===== CRITICAL RISK — Session + MFA + Step-up =====
  {
    feature: "provider.keys.rotate",
    name: "Rotate Provider Keys",
    riskLevel: "CRITICAL",
    requiredAuth: "STEP_UP",
    requiredPermissions: ["providers.manage"],
    requiredKycTier: 0,
    maxRequestsPerMinute: 1,
    description: "Rotate provider API credentials.",
  },
  {
    feature: "provider.config.update",
    name: "Update Provider Config",
    riskLevel: "CRITICAL",
    requiredAuth: "STEP_UP",
    requiredPermissions: ["providers.manage"],
    requiredKycTier: 0,
    maxRequestsPerMinute: 2,
    description: "Update provider configuration.",
  },
  {
    feature: "merchant.approve",
    name: "Approve Merchant",
    riskLevel: "CRITICAL",
    requiredAuth: "STEP_UP",
    requiredPermissions: ["merchants.approve"],
    requiredKycTier: 0,
    maxRequestsPerMinute: 5,
    description: "Approve merchant onboarding.",
  },
  {
    feature: "feature_flag.toggle",
    name: "Toggle Feature Flag",
    riskLevel: "CRITICAL",
    requiredAuth: "STEP_UP",
    requiredPermissions: ["config.manage"],
    requiredKycTier: 0,
    maxRequestsPerMinute: 5,
    description: "Toggle a platform feature flag.",
  },
  {
    feature: "routing_rule.update",
    name: "Update Routing Rule",
    riskLevel: "CRITICAL",
    requiredAuth: "STEP_UP",
    requiredPermissions: ["routing.manage"],
    requiredKycTier: 0,
    maxRequestsPerMinute: 2,
    description: "Update payment routing rules.",
  },
  {
    feature: "capability.disable",
    name: "Disable Capability",
    riskLevel: "CRITICAL",
    requiredAuth: "STEP_UP",
    requiredPermissions: ["capabilities.manage"],
    requiredKycTier: 0,
    maxRequestsPerMinute: 2,
    description: "Disable a capability in a country.",
  },
  {
    feature: "ledger.export",
    name: "Export Ledger",
    riskLevel: "CRITICAL",
    requiredAuth: "STEP_UP",
    requiredPermissions: ["ledger.export"],
    requiredKycTier: 0,
    maxRequestsPerMinute: 1,
    description: "Export ledger entries.",
  },
  {
    feature: "audit.export",
    name: "Export Audit Logs",
    riskLevel: "CRITICAL",
    requiredAuth: "STEP_UP",
    requiredPermissions: ["audit.export"],
    requiredKycTier: 0,
    maxRequestsPerMinute: 1,
    description: "Export audit logs.",
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function getFeatureRisk(feature: string): FeatureRiskProfile | undefined {
  return FEATURE_RISK_PROFILES.find((f) => f.feature === feature);
}

export function getFeaturesByRiskLevel(level: RiskLevel): FeatureRiskProfile[] {
  return FEATURE_RISK_PROFILES.filter((f) => f.riskLevel === level);
}

export function getRequiredAuthForFeature(feature: string): AuthRequirement {
  const profile = getFeatureRisk(feature);
  return profile?.requiredAuth ?? "SESSION";
}

export function getRiskStats() {
  const byLevel: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  const byAuth: Record<AuthRequirement, number> = {
    NONE: 0,
    SESSION: 0,
    MFA: 0,
    STEP_UP: 0,
    HARDWARE_KEY: 0,
  };
  for (const f of FEATURE_RISK_PROFILES) {
    byLevel[f.riskLevel]++;
    byAuth[f.requiredAuth]++;
  }
  return {
    totalFeatures: FEATURE_RISK_PROFILES.length,
    byLevel,
    byAuth,
  };
}
