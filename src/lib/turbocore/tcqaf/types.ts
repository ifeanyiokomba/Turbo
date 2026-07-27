// TurboCore — TCQAF Types (Chapter 14: Testing, Certification & Quality Assurance Framework)
//
// "Every feature must be verified, repeatable, observable, auditable, certified."

// ---------------------------------------------------------------------------
// Testing domains (Chapter 14)
// ---------------------------------------------------------------------------

export type TestingDomain =
  | "UNIT"
  | "INTEGRATION"
  | "CONTRACT"
  | "PROVIDER_CERT"
  | "SECURITY"
  | "PERFORMANCE"
  | "CHAOS"
  | "COMPLIANCE"
  | "UAT"
  | "REGRESSION";

export interface TestSuite {
  id: string;
  domain: TestingDomain;
  name: string;
  description: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number; // seconds
  lastRun: string;
  status: "PASS" | "FAIL" | "PENDING" | "RUNNING";
}

// ---------------------------------------------------------------------------
// Certification types (Chapter 14)
// ---------------------------------------------------------------------------

export type CertificationType =
  "PROVIDER" | "CAPABILITY" | "COUNTRY" | "LEDGER" | "PAYMENT_LIFECYCLE";

export interface CertificationRecord {
  id: string;
  type: CertificationType;
  target: string; // provider code, capability id, country code, etc.
  name: string;
  status: "CERTIFIED" | "PENDING" | "FAILED" | "EXPIRED";
  score: number; // 0-100
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  lastVerifiedAt: string;
  expiresAt: string;
  certifiedBy: string;
  checks: CertificationCheck[];
}

export interface CertificationCheck {
  name: string;
  category: string;
  status: "PASS" | "FAIL" | "SKIP";
  message?: string;
  durationMs?: number;
}

// ---------------------------------------------------------------------------
// Provider sandbox management (Chapter 14)
// ---------------------------------------------------------------------------

export interface ProviderSandbox {
  providerCode: string;
  displayName: string;
  sandboxAvailable: boolean;
  certificationStatus: "CERTIFIED" | "PENDING" | "EXPIRED" | "NOT_STARTED";
  lastVerified: string;
  sandboxUrl: string;
  credentialsConfigured: boolean;
  testTransactionsRun: number;
}

// ---------------------------------------------------------------------------
// Quality metrics (Chapter 14)
// ---------------------------------------------------------------------------

export interface QualityMetrics {
  codeCoverage: number; // %
  branchCoverage: number; // %
  escapedDefects: number;
  regressionRate: number; // %
  deploymentSuccessRate: number; // %
  meanRecoveryTime: number; // minutes
  providerCertificationScore: number; // avg 0-100
  securityFindings: number;
  testPassRate: number; // %
  totalTests: number;
  totalPassing: number;
  totalFailing: number;
}

// ---------------------------------------------------------------------------
// Release gates (Chapter 14)
// ---------------------------------------------------------------------------

export interface ReleaseGate {
  id: string;
  name: string;
  description: string;
  category: "TEST" | "SECURITY" | "CERTIFICATION" | "MIGRATION" | "PERFORMANCE" | "OPERATIONAL";
  status: "PASSED" | "FAILED" | "PENDING" | "BLOCKED";
  blocking: boolean; // if true, deployment cannot proceed
  evidence?: string;
  lastChecked: string;
}

// ---------------------------------------------------------------------------
// Provider Simulation Framework (Chapter 14 — Production Enhancement)
// ---------------------------------------------------------------------------

export type SimulationScenario =
  | "SUCCESS"
  | "TIMEOUT"
  | "DUPLICATE_WEBHOOK"
  | "SETTLEMENT_DELAY"
  | "RATE_LIMITED"
  | "AUTH_FAILURE"
  | "INVALID_SIGNATURE"
  | "PARTIAL_FAILURE";

export interface ProviderSimulation {
  providerCode: string;
  displayName: string;
  scenario: SimulationScenario;
  description: string;
  configuredResponse: {
    status: number;
    delay: number; // ms
    body?: unknown;
  };
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Release certification process (Chapter 14)
// ---------------------------------------------------------------------------

export interface ReleaseStage {
  name: string;
  type: string;
  status: "PASSED" | "FAILED" | "PENDING" | "RUNNING" | "SKIPPED";
  startedAt: string | null;
  completedAt: string | null;
  duration: number | null; // seconds
  artifacts?: string[];
}

export interface ReleaseCertification {
  id: string;
  version: string;
  stages: ReleaseStage[];
  status: "APPROVED" | "IN_PROGRESS" | "BLOCKED" | "REJECTED";
  startedAt: string;
  completedAt: string | null;
  approvedBy: string | null;
}

// ---------------------------------------------------------------------------
// Load testing (Chapter 14)
// ---------------------------------------------------------------------------

export interface LoadTestResult {
  id: string;
  target: string; // "100 TPS" | "500 TPS" | etc.
  tps: number;
  duration: string;
  avgResponseMs: number;
  p95ResponseMs: number;
  p99ResponseMs: number;
  errorRate: number; // %
  status: "PASS" | "FAIL" | "PENDING";
  runAt: string;
}

// ---------------------------------------------------------------------------
// Chaos engineering (Chapter 14)
// ---------------------------------------------------------------------------

export interface ChaosExperiment {
  id: string;
  name: string;
  description: string;
  failureInjected: string;
  expectedBehavior: string;
  actualBehavior: string;
  status: "PASS" | "FAIL" | "PENDING";
  runAt: string;
}
