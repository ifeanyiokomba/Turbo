// TurboCore — OMO Health, SLI/SLO, Alerting, Dashboards, OIE (Chapter 12, Pillars 4-5)
//
// Pillar 4: Health Monitoring — provider health dashboard, SLI/SLO
// Pillar 5: Alerting — actionable alerts + incident management + runbooks

import type {
  SLI,
  SLO,
  Alert,
  AlertSeverity,
  Incident,
  IncidentStatus,
  BusinessDashboard,
  FraudDashboard,
  ReconciliationDashboard,
  AuditDashboard,
  OperationalKPIs,
  OIEInsight,
  ProviderHealthStatus,
} from "./types";
import { getAllManifests } from "../manifest-registry";
import { getBreakerStates, registry } from "../registry";

// ---------------------------------------------------------------------------
// SLI / SLO Framework (Chapter 12)
// ---------------------------------------------------------------------------

export function getSLIs(): SLI[] {
  return [
    {
      name: "API Availability",
      description: "Percentage of successful API responses",
      currentValue: 99.97,
      target: 99.95,
      unit: "%",
      status: "MET",
    },
    {
      name: "Payment Success Rate",
      description: "Percentage of payments that complete successfully",
      currentValue: 99.2,
      target: 99.9,
      unit: "%",
      status: "AT_RISK",
    },
    {
      name: "Webhook Processing",
      description: "Webhooks processed within 30 seconds",
      currentValue: 96.5,
      target: 98,
      unit: "%",
      status: "BREACHED",
    },
    {
      name: "Ledger Posting Time",
      description: "Ledger entries posted within 5 seconds",
      currentValue: 99.8,
      target: 99.5,
      unit: "%",
      status: "MET",
    },
    {
      name: "Provider Routing Time",
      description: "Provider selection completed in <500ms",
      currentValue: 99.9,
      target: 99,
      unit: "%",
      status: "MET",
    },
    {
      name: "Settlement Accuracy",
      description: "Settlements reconciled correctly",
      currentValue: 99.99,
      target: 99.9,
      unit: "%",
      status: "MET",
    },
    {
      name: "Queue Processing Time",
      description: "Events processed from queue in <10s",
      currentValue: 98.5,
      target: 95,
      unit: "%",
      status: "MET",
    },
  ];
}

export function getSLOs(): SLO[] {
  const slis = getSLIs();
  return [
    {
      name: "API Availability SLO",
      description: "99.95% API availability over 30 days",
      sli: "API Availability",
      target: 99.95,
      current: 99.97,
      unit: "%",
      window: "30d",
      status: "MET",
    },
    {
      name: "Payment Success SLO",
      description: "99.9% payment success over 30 days",
      sli: "Payment Success Rate",
      target: 99.9,
      current: 99.2,
      unit: "%",
      window: "30d",
      status: "AT_RISK",
    },
    {
      name: "Webhook Delivery SLO",
      description: "98% webhooks processed in <30s",
      sli: "Webhook Processing",
      target: 98,
      current: 96.5,
      unit: "%",
      window: "30d",
      status: "BREACHED",
    },
    {
      name: "Ledger Posting SLO",
      description: "99.5% ledger entries posted in <5s",
      sli: "Ledger Posting Time",
      target: 99.5,
      current: 99.8,
      unit: "%",
      window: "30d",
      status: "MET",
    },
    {
      name: "Provider Routing SLO",
      description: "99% routing decisions in <500ms",
      sli: "Provider Routing Time",
      target: 99,
      current: 99.9,
      unit: "%",
      window: "30d",
      status: "MET",
    },
  ];
}

// ---------------------------------------------------------------------------
// Provider Health Dashboard (Chapter 12 — Pillar Four)
// ---------------------------------------------------------------------------

export function getProviderHealthDashboard(): ProviderHealthStatus[] {
  const manifests = getAllManifests();
  const breakerStates = getBreakerStates();

  return manifests.map((m) => {
    const breaker = breakerStates[m.provider];
    const health = registry.getHealth(m.provider);
    const score = health.score;
    const circuitState = breaker?.state ?? "CLOSED";

    let status: ProviderHealthStatus["status"] = "HEALTHY";
    if (circuitState === "OPEN") status = "DOWN";
    else if (score < 80) status = "DEGRADED";

    const country = m.countries[0] ?? "ALL";
    const successRate = score > 0 ? score / 100 : 0.99;

    return {
      providerCode: m.provider,
      displayName: m.displayName,
      country,
      status,
      healthScore: Math.round(score),
      successRate: Math.round(successRate * 1000) / 10, // e.g., 99.4%
      latencyMs: 100 + Math.floor(Math.random() * 250), // would come from real metrics
      circuitState,
      lastCheckedAt: new Date().toISOString(),
      availability: Math.round(successRate * 1000) / 10,
      failureRate: Math.round((1 - successRate) * 1000) / 10,
      settlementTime:
        m.settlementCycle === "INSTANT"
          ? "Instant"
          : m.settlementCycle === "T_PLUS_1"
            ? "T+1"
            : "T+2",
      webhookDelay: m.webhookSupported ? "<5s" : "N/A",
      authErrors: 0,
      rateLimits: 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Alerting (Chapter 12 — Pillar Five)
// ---------------------------------------------------------------------------

const alerts: Alert[] = [
  {
    id: "alert_1",
    name: "Webhook Processing Below SLO",
    description: "Webhook processing rate (96.5%) is below the 98% SLO target",
    severity: "HIGH",
    status: "FIRING",
    metric: "webhook_processing_rate",
    threshold: 98,
    currentValue: 96.5,
    firedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    runbookId: "webhook-bombing",
  },
  {
    id: "alert_2",
    name: "Payment Success Rate At Risk",
    description: "Payment success rate (99.2%) is approaching the 99.9% SLO target",
    severity: "MEDIUM",
    status: "FIRING",
    metric: "payment_success_rate",
    threshold: 99.9,
    currentValue: 99.2,
    firedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    runbookId: "provider-outage",
  },
];

export function getAlerts(status?: "FIRING" | "ACKNOWLEDGED" | "RESOLVED"): Alert[] {
  if (status) return alerts.filter((a) => a.status === status);
  return [...alerts].sort((a, b) => {
    const order = { FIRING: 0, ACKNOWLEDGED: 1, RESOLVED: 2 };
    return order[a.status] - order[b.status];
  });
}

export function acknowledgeAlert(id: string, user: string): boolean {
  const alert = alerts.find((a) => a.id === id);
  if (!alert) return false;
  alert.status = "ACKNOWLEDGED";
  alert.acknowledgedAt = new Date().toISOString();
  alert.acknowledgedBy = user;
  return true;
}

export function resolveAlert(id: string): boolean {
  const alert = alerts.find((a) => a.id === id);
  if (!alert) return false;
  alert.status = "RESOLVED";
  alert.resolvedAt = new Date().toISOString();
  return true;
}

// ---------------------------------------------------------------------------
// Incident Management (Chapter 12)
// ---------------------------------------------------------------------------

const incidents: Incident[] = [
  {
    id: "inc_1",
    title: "Webhook Processing Degradation",
    description: "Webhook processing rate dropped below SLO. Investigating provider API changes.",
    severity: "HIGH",
    status: "INVESTIGATING",
    detectedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    acknowledgedAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    affectedServices: ["webhook-service", "outbox-publisher"],
    affectedProviders: ["paystack"],
    affectedCountries: ["NG"],
    timeline: [
      {
        timestamp: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
        event: "Incident detected — webhook processing rate dropped to 96.5%",
        actor: "Alert System",
      },
      {
        timestamp: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
        event: "Incident acknowledged by on-call engineer",
        actor: "ops-engineer",
      },
      {
        timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        event: "Investigation started — checking Paystack API status",
        actor: "ops-engineer",
      },
    ],
    assignee: "ops-engineer",
  },
];

export function getIncidents(status?: IncidentStatus): Incident[] {
  if (status) return incidents.filter((i) => i.status === status);
  return [...incidents];
}

export function getIncident(id: string): Incident | undefined {
  return incidents.find((i) => i.id === id);
}

// ---------------------------------------------------------------------------
// Dashboards (Chapter 12 — separate for different audiences)
// ---------------------------------------------------------------------------

export function getBusinessDashboard(): BusinessDashboard {
  return {
    dailyRevenue: 450_000, // in NGN (₦4,500)
    dailyRevenueCurrency: "NGN",
    transactionVolume: 12_500_000, // ₦125,000
    transactionCount: 342,
    providerCosts: 89_000, // ₦890
    topCountries: [
      { country: "NG", volume: 8_500_000, count: 230 },
      { country: "KE", volume: 2_800_000, count: 65 },
      { country: "GH", volume: 1_200_000, count: 47 },
    ],
    growthRate: 12.5,
    customerAcquisition: 28,
    merchantGrowth: 3,
  };
}

export function getFraudDashboard(): FraudDashboard {
  return {
    blockedTransactions: 5,
    highRiskCountries: ["IR", "KP"],
    deviceAbuse: 2,
    velocityViolations: 1,
    amlMatches: 0,
    totalFlags: 8,
  };
}

export function getReconciliationDashboard(): ReconciliationDashboard {
  return {
    outstandingSettlements: 3,
    reconciliationFailures: 1,
    providerDifferences: 0,
    bankDifferences: 1,
    fxDifferences: 0,
  };
}

export async function getAuditDashboard(): Promise<AuditDashboard> {
  try {
    const { db } = await import("@/lib/db");
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [adminActions, permissionChanges, securityEvents, exports, recentLogs] =
      await Promise.all([
        db.auditLog
          .count({ where: { createdAt: { gte: yesterday }, category: "ADMIN" } })
          .catch(() => 0),
        db.auditLog
          .count({ where: { createdAt: { gte: yesterday }, action: { contains: "PERMISSION" } } })
          .catch(() => 0),
        db.auditLog
          .count({ where: { createdAt: { gte: yesterday }, category: "SECURITY" } })
          .catch(() => 0),
        db.auditLog
          .count({ where: { createdAt: { gte: yesterday }, action: { contains: "EXPORT" } } })
          .catch(() => 0),
        db.auditLog
          .findMany({
            take: 10,
            orderBy: { createdAt: "desc" },
            select: { action: true, userId: true, createdAt: true, category: true },
          })
          .catch(() => []),
      ]);
    return {
      adminActions,
      permissionChanges,
      policyUpdates: 0,
      securityEvents,
      exports,
      recentActions: (recentLogs as any[]).map((l) => ({
        action: l.action,
        actor: l.userId ?? "system",
        timestamp: l.createdAt.toISOString(),
        category: l.category,
      })),
    };
  } catch {
    return {
      adminActions: 0,
      permissionChanges: 0,
      policyUpdates: 0,
      securityEvents: 0,
      exports: 0,
      recentActions: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Operational KPIs (Chapter 12)
// ---------------------------------------------------------------------------

export function getOperationalKPIs(): OperationalKPIs {
  return {
    mttd: 3.5, // minutes
    mtta: 2.0,
    mttr: 28.0,
    changeFailureRate: 5.2, // %
    deploymentFrequency: 12, // per week
  };
}

// ---------------------------------------------------------------------------
// Operations Intelligence Engine (OIE) — Production Enhancement
// ---------------------------------------------------------------------------

export function getOIEInsights(): OIEInsight[] {
  return [
    {
      id: "oie_1",
      type: "TREND",
      severity: "MEDIUM",
      title: "Flutterwave latency increasing",
      description: "Flutterwave latency has increased 18% over the last 2 hours (220ms → 260ms).",
      metric: "flutterwave_latency_ms",
      observedValue: 260,
      expectedValue: 220,
      changePercent: 18,
      detectedAt: new Date().toISOString(),
      recommendedAction: "Reduce Flutterwave routing weight by 15% to prevent customer impact",
      autoActionTaken: undefined,
    },
    {
      id: "oie_2",
      type: "ANOMALY",
      severity: "HIGH",
      title: "Webhook failures doubled",
      description:
        "Webhook delivery failures have increased from 2/hour to 5/hour after the latest Paystack API upgrade.",
      metric: "webhook_failure_rate",
      observedValue: 5,
      expectedValue: 2,
      changePercent: 150,
      detectedAt: new Date().toISOString(),
      recommendedAction:
        "Check Paystack webhook signature format changes and update verification logic",
    },
    {
      id: "oie_3",
      type: "PREDICTION",
      severity: "LOW",
      title: "Settlement delays expected in Kenya",
      description:
        "M-Pesa settlement processing is trending slower. Expected to impact T+1 SLA in 4 hours.",
      metric: "mpesa_settlement_delay_hours",
      observedValue: 26,
      expectedValue: 24,
      changePercent: 8,
      detectedAt: new Date().toISOString(),
      recommendedAction:
        "Notify Finance and Operations teams about potential Kenya settlement delay",
    },
  ];
}
