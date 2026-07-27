// TurboCore — ZTSA Types (Chapter 10: Zero Trust Security & Trust Architecture)
//
// "Never Trust. Always Verify."
//
// Security is not a module. Security is the architecture.

// ---------------------------------------------------------------------------
// Identity types (Chapter 10 — four identity layers)
// ---------------------------------------------------------------------------

export type IdentityType = "HUMAN" | "MERCHANT" | "PROVIDER" | "SERVICE";

// ---------------------------------------------------------------------------
// Risk levels (Chapter 10 — Feature Risk Engine)
// ---------------------------------------------------------------------------

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type AuthRequirement = "NONE" | "SESSION" | "MFA" | "STEP_UP" | "HARDWARE_KEY";

// ---------------------------------------------------------------------------
// Feature Risk Engine (Chapter 10 — Production Enhancement #2)
// ---------------------------------------------------------------------------

export interface FeatureRiskProfile {
  feature: string;
  name: string;
  riskLevel: RiskLevel;
  requiredAuth: AuthRequirement;
  requiredPermissions: string[];
  requiredKycTier: number;
  maxRequestsPerMinute: number;
  description: string;
}

// ---------------------------------------------------------------------------
// ABAC — Attribute-Based Access Control (Chapter 10)
// ---------------------------------------------------------------------------

export interface AbacContext {
  // Subject attributes
  userId: string;
  role: string;
  kycTier: number;
  country: string | null;
  department?: string;
  riskScore?: number;
  deviceTrusted?: boolean;
  // Resource attributes
  resourceType?: string;
  resourceId?: string;
  resourceOwnerId?: string;
  // Environment attributes
  timestamp?: string;
  ipAddress?: string;
  timeOfDay?: number; // hour 0-23
  isBusinessHours?: boolean;
  // Action
  action?: string;
}

export interface AbacPolicy {
  id: string;
  name: string;
  description: string;
  effect: "ALLOW" | "DENY";
  // Conditions — all must be true for the policy to apply
  conditions: AbacCondition[];
  priority: number; // higher = evaluated first
  enabled: boolean;
}

export interface AbacCondition {
  field: string; // e.g. "country", "role", "kycTier", "timeOfDay", "riskScore"
  operator: "EQ" | "NE" | "GT" | "LT" | "GTE" | "LTE" | "IN" | "NOT_IN" | "BETWEEN";
  value: unknown;
}

export type AbacDecision = "ALLOW" | "DENY" | "NOT_APPLICABLE";

// ---------------------------------------------------------------------------
// Policy Engine (Chapter 10 — Production Enhancement #1)
// ---------------------------------------------------------------------------

export interface PolicyEvaluationResult {
  decision: "ALLOW" | "DENY";
  matchedPolicies: string[];
  evaluatedPolicies: number;
  reason: string;
  context: AbacContext;
}

// ---------------------------------------------------------------------------
// Zero Trust verification (Chapter 10)
// ---------------------------------------------------------------------------

export interface ZeroTrustCheck {
  check: string;
  passed: boolean;
  reason: string;
}

export interface ZeroTrustResult {
  verified: boolean;
  checks: ZeroTrustCheck[];
  riskLevel: RiskLevel;
  requiredAuth: AuthRequirement;
  deniedReason?: string;
}

// ---------------------------------------------------------------------------
// Compliance targets (Chapter 10)
// ---------------------------------------------------------------------------

export interface ComplianceTarget {
  standard: string;
  name: string;
  status: "COMPLIANT" | "PARTIAL" | "IN_PROGRESS" | "NOT_STARTED";
  controls: number;
  implemented: number;
  gaps: string[];
}

// ---------------------------------------------------------------------------
// Incident response (Chapter 10)
// ---------------------------------------------------------------------------

export interface IncidentRunbook {
  id: string;
  trigger: string;
  name: string;
  severity: RiskLevel;
  steps: Array<{
    action: string;
    automated: boolean;
    owner: string;
  }>;
}

// ---------------------------------------------------------------------------
// Security monitoring metrics (Chapter 10)
// ---------------------------------------------------------------------------

export interface SecurityMonitoringMetrics {
  failedLogins24h: number;
  permissionChanges24h: number;
  providerAuthFailures24h: number;
  webhookFailures24h: number;
  suspiciousTransfers24h: number;
  highRiskCountryAccess24h: number;
  apiAbuseBlocked24h: number;
  tokenRevocations24h: number;
  activeSessions: number;
  mfaEnrollments: number;
  passkeyEnrollments: number;
}
