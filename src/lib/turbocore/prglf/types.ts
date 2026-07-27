// TurboCore — PRGLF Types (Chapter 15: Production Readiness, Governance & Launch Framework)
//
// "Software reaches production. Platforms stay in production."

// ---------------------------------------------------------------------------
// Platform ownership (Chapter 15)
// ---------------------------------------------------------------------------

export interface DomainOwnership {
  domain: string;
  owner: string;
  lead: string;
  status: "ESTABLISHED" | "PLANNED" | "VACANT";
  responsibilities: string[];
}

// ---------------------------------------------------------------------------
// Architecture Decision Records (Chapter 15)
// ---------------------------------------------------------------------------

export interface ADR {
  id: string;
  title: string;
  status: "PROPOSED" | "ACCEPTED" | "DEPRECATED" | "SUPERSEDED";
  date: string;
  decision: string;
  reason: string;
  alternatives: string[];
  approvedBy: string;
  tags: string[];
}

// ---------------------------------------------------------------------------
// Change management (Chapter 15)
// ---------------------------------------------------------------------------

export type ChangeType = "FEATURE" | "BUGFIX" | "CONFIG" | "MIGRATION" | "HOTFIX" | "ROLLBACK";
export type ChangeStatus =
  | "REQUESTED"
  | "REVIEWED"
  | "APPROVED"
  | "TESTING"
  | "DEPLOYED"
  | "VERIFIED"
  | "CLOSED"
  | "REJECTED";

export interface ChangeRecord {
  id: string;
  type: ChangeType;
  title: string;
  description: string;
  status: ChangeStatus;
  requestedBy: string;
  reviewedBy: string | null;
  approvedBy: string | null;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  rollbackPlan: string;
  createdAt: string;
  deployedAt: string | null;
  verifiedAt: string | null;
}

// ---------------------------------------------------------------------------
// Release governance (Chapter 15)
// ---------------------------------------------------------------------------

export interface ReleaseRecord {
  id: string;
  version: string;
  releaseManager: string;
  releaseNotes: string;
  rollbackPlan: string;
  riskAssessment: "LOW" | "MEDIUM" | "HIGH";
  status: "PLANNED" | "IN_PROGRESS" | "DEPLOYED" | "ROLLED_BACK" | "CANCELLED";
  deploymentChecklist: Array<{ item: string; done: boolean }>;
  monitoringWindow: string;
  createdAt: string;
  deployedAt: string | null;
}

// ---------------------------------------------------------------------------
// Incident governance (Chapter 15)
// ---------------------------------------------------------------------------

export interface IncidentRecord {
  id: string;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  status: "DETECTED" | "ACKNOWLEDGED" | "INVESTIGATING" | "MITIGATED" | "RESOLVED" | "POSTMORTEM";
  timeline: Array<{ timestamp: string; event: string; actor: string }>;
  impact: string;
  rootCause: string | null;
  resolution: string | null;
  customerImpact: string;
  lessonsLearned: string[];
  actionItems: Array<{ item: string; owner: string; dueDate: string; status: string }>;
}

// ---------------------------------------------------------------------------
// Launch checklist (Chapter 15)
// ---------------------------------------------------------------------------

export interface LaunchChecklistItem {
  id: string;
  category: "TECHNICAL" | "SECURITY" | "OPERATIONS" | "BUSINESS" | "COMPLIANCE";
  check: string;
  status: "DONE" | "IN_PROGRESS" | "NOT_STARTED" | "BLOCKED";
  evidence?: string;
  owner: string;
}

// ---------------------------------------------------------------------------
// Post-launch strategy (Chapter 15)
// ---------------------------------------------------------------------------

export interface PostLaunchPhase {
  phase: string;
  days: string;
  priorities: string[];
  status: "CURRENT" | "UPCOMING" | "COMPLETED";
}

// ---------------------------------------------------------------------------
// Operational metrics (Chapter 15)
// ---------------------------------------------------------------------------

export interface OperationalMetric {
  name: string;
  value: number;
  unit: string;
  target: number;
  trend: "UP" | "DOWN" | "STABLE";
  status: "GOOD" | "WARNING" | "CRITICAL";
}

// ---------------------------------------------------------------------------
// Executive dashboard (Chapter 15)
// ---------------------------------------------------------------------------

export interface ExecutiveDashboard {
  grossPaymentVolume: number;
  grossPaymentVolumeCurrency: string;
  netRevenue: number;
  netRevenueCurrency: string;
  activeCustomers: number;
  activeMerchants: number;
  providerDistribution: Array<{ provider: string; percentage: number; volume: number }>;
  geographicGrowth: Array<{ country: string; growth: number }>;
  settlementPerformance: number; // %
  platformAvailability: number; // %
}

// ---------------------------------------------------------------------------
// Platform evolution roadmap (Chapter 15)
// ---------------------------------------------------------------------------

export interface EvolutionStage {
  stage: string;
  description: string;
  status: "CURRENT" | "NEXT" | "FUTURE" | "COMPLETED";
  timeline: string;
  capabilities: string[];
}

// ---------------------------------------------------------------------------
// Provider governance (Chapter 15)
// ---------------------------------------------------------------------------

export interface ProviderGovernance {
  providerCode: string;
  displayName: string;
  operationalStatus: "ACTIVE" | "DEGRADED" | "MAINTENANCE" | "INACTIVE";
  certificationStatus: string;
  businessOwner: string;
  technicalOwner: string;
  lastReview: string;
  renewalDate: string;
  supportContacts: string[];
}

// ---------------------------------------------------------------------------
// Regulatory governance (Chapter 15)
// ---------------------------------------------------------------------------

export interface RegulatoryRegister {
  country: string;
  licensing: string;
  reporting: string;
  retention: string;
  kyc: string;
  aml: string;
  consumerProtection: string;
  status: "ESTABLISHED" | "IN_PROGRESS" | "PLANNED";
}

// ---------------------------------------------------------------------------
// AI governance (Chapter 15)
// ---------------------------------------------------------------------------

export interface AIGovernanceRule {
  rule: string;
  description: string;
  enforced: boolean;
}
