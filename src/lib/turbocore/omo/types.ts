// TurboCore — OMO Types (Chapter 12: Observability, Monitoring & Operations)
//
// "Logs tell you what happened. Metrics tell you how often. Traces tell you why.
//  Events tell you when. Business dashboards tell you whether it matters."

// ---------------------------------------------------------------------------
// Log levels (Chapter 12 — Pillar One)
// ---------------------------------------------------------------------------

export type LogLevel = "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

// ---------------------------------------------------------------------------
// Structured log entry (Chapter 12)
// ---------------------------------------------------------------------------

export interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  correlationId?: string;
  traceId?: string;
  tenantId?: string;
  userId?: string;
  country?: string;
  provider?: string;
  transactionId?: string;
  requestId?: string;
  // Sensitive data is masked — never logged in plaintext
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Metric types (Chapter 12 — Pillar Two)
// ---------------------------------------------------------------------------

export type MetricType = "COUNTER" | "GAUGE" | "HISTOGRAM" | "TIMER";

export interface Metric {
  name: string;
  type: MetricType;
  value: number;
  unit: string;
  labels: Record<string, string>;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// SLI / SLO (Chapter 12)
// ---------------------------------------------------------------------------

export interface SLI {
  name: string;
  description: string;
  currentValue: number;
  target: number;
  unit: string;
  status: "MET" | "BREACHED" | "AT_RISK";
}

export interface SLO {
  name: string;
  description: string;
  sli: string;
  target: number;
  current: number;
  unit: string;
  window: string;
  status: "MET" | "BREACHED" | "AT_RISK";
}

// ---------------------------------------------------------------------------
// Provider health (Chapter 12 — Pillar Four)
// ---------------------------------------------------------------------------

export interface ProviderHealthStatus {
  providerCode: string;
  displayName: string;
  country: string;
  status: "HEALTHY" | "DEGRADED" | "DOWN" | "UNKNOWN";
  healthScore: number;
  successRate: number;
  latencyMs: number;
  circuitState: string;
  lastCheckedAt: string;
  // Detailed metrics
  availability: number;
  failureRate: number;
  settlementTime: string;
  webhookDelay: string;
  authErrors: number;
  rateLimits: number;
}

// ---------------------------------------------------------------------------
// Alert (Chapter 12 — Pillar Five)
// ---------------------------------------------------------------------------

export type AlertSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface Alert {
  id: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  status: "FIRING" | "ACKNOWLEDGED" | "RESOLVED";
  metric: string;
  threshold: number;
  currentValue: number;
  provider?: string;
  country?: string;
  firedAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  runbookId?: string;
}

// ---------------------------------------------------------------------------
// Incident management (Chapter 12)
// ---------------------------------------------------------------------------

export type IncidentStatus =
  "DETECTED" | "ACKNOWLEDGED" | "INVESTIGATING" | "MITIGATED" | "RESOLVED" | "POSTMORTEM";

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  status: IncidentStatus;
  detectedAt: string;
  acknowledgedAt?: string;
  mitigatedAt?: string;
  resolvedAt?: string;
  affectedServices: string[];
  affectedProviders?: string[];
  affectedCountries?: string[];
  timeline: IncidentTimelineEntry[];
  assignee?: string;
  rootCause?: string;
  postmortem?: string;
}

export interface IncidentTimelineEntry {
  timestamp: string;
  event: string;
  actor: string;
  details?: string;
}

// ---------------------------------------------------------------------------
// Dashboards (Chapter 12)
// ---------------------------------------------------------------------------

export interface BusinessDashboard {
  dailyRevenue: number;
  dailyRevenueCurrency: string;
  transactionVolume: number;
  transactionCount: number;
  providerCosts: number;
  topCountries: Array<{ country: string; volume: number; count: number }>;
  growthRate: number;
  customerAcquisition: number;
  merchantGrowth: number;
}

export interface FraudDashboard {
  blockedTransactions: number;
  highRiskCountries: string[];
  deviceAbuse: number;
  velocityViolations: number;
  amlMatches: number;
  totalFlags: number;
}

export interface ReconciliationDashboard {
  outstandingSettlements: number;
  reconciliationFailures: number;
  providerDifferences: number;
  bankDifferences: number;
  fxDifferences: number;
}

export interface AuditDashboard {
  adminActions: number;
  permissionChanges: number;
  policyUpdates: number;
  securityEvents: number;
  exports: number;
  recentActions: Array<{ action: string; actor: string; timestamp: string; category: string }>;
}

// ---------------------------------------------------------------------------
// Operational analytics (Chapter 12)
// ---------------------------------------------------------------------------

export interface OperationalKPIs {
  mttd: number; // Mean Time To Detect (minutes)
  mtta: number; // Mean Time To Acknowledge (minutes)
  mttr: number; // Mean Time To Resolve (minutes)
  changeFailureRate: number;
  deploymentFrequency: number;
}

// ---------------------------------------------------------------------------
// Operations Intelligence Engine (Chapter 12 — Production Enhancement)
// ---------------------------------------------------------------------------

export interface OIEInsight {
  id: string;
  type: "ANOMALY" | "TREND" | "PREDICTION" | "RECOMMENDATION";
  severity: AlertSeverity;
  title: string;
  description: string;
  metric: string;
  observedValue: number;
  expectedValue: number;
  changePercent: number;
  detectedAt: string;
  recommendedAction?: string;
  autoActionTaken?: string;
}
