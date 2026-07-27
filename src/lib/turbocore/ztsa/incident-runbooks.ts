// TurboCore — Incident Response Runbooks (Chapter 10)
//
// "Every major event has a documented runbook."

import type { IncidentRunbook } from "./types";

export const INCIDENT_RUNBOOKS: IncidentRunbook[] = [
  {
    id: "credential-leak",
    trigger: "Credential leak detected (e.g., GitHub secret scan, security report)",
    name: "Credential Leak Response",
    severity: "CRITICAL",
    steps: [
      {
        action: "Disable compromised credentials immediately",
        automated: true,
        owner: "Security System",
      },
      {
        action: "Rotate all secrets associated with the leaked credential",
        automated: true,
        owner: "DevOps",
      },
      {
        action: "Alert security team via Slack + email",
        automated: true,
        owner: "Security System",
      },
      {
        action: "Notify affected customers if their data was exposed",
        automated: false,
        owner: "Compliance",
      },
      {
        action: "Audit all actions taken with the compromised credential",
        automated: false,
        owner: "Security Analyst",
      },
      { action: "Document incident in post-mortem", automated: false, owner: "Security Lead" },
    ],
  },
  {
    id: "provider-outage",
    trigger: "Provider circuit breaker opens (5 consecutive failures)",
    name: "Provider Outage Response",
    severity: "HIGH",
    steps: [
      {
        action: "Circuit breaker auto-opens, traffic reroutes to failover providers",
        automated: true,
        owner: "Routing Engine",
      },
      { action: "Alert operations team", automated: true, owner: "Monitoring" },
      { action: "Check provider status page", automated: false, owner: "Ops Engineer" },
      { action: "Monitor failover provider health", automated: true, owner: "Monitoring" },
      {
        action: "When provider recovers, circuit breaker auto-closes after 30s",
        automated: true,
        owner: "Health Engine",
      },
      {
        action: "Post-incident review of failover effectiveness",
        automated: false,
        owner: "Ops Lead",
      },
    ],
  },
  {
    id: "fraud-spike",
    trigger: "Fraud alert rate exceeds threshold (> 10/hour)",
    name: "Fraud Spike Response",
    severity: "CRITICAL",
    steps: [
      { action: "Auto-increase risk scoring sensitivity", automated: true, owner: "Risk Engine" },
      { action: "Alert fraud team", automated: true, owner: "Monitoring" },
      { action: "Review flagged transactions", automated: false, owner: "Fraud Analyst" },
      {
        action: "Temporarily lower velocity limits if needed",
        automated: false,
        owner: "Fraud Lead",
      },
      {
        action: "Block affected accounts if confirmed fraud",
        automated: false,
        owner: "Fraud Analyst",
      },
      {
        action: "File SAR (Suspicious Activity Report) if required",
        automated: false,
        owner: "Compliance",
      },
    ],
  },
  {
    id: "webhook-bombing",
    trigger: "Webhook delivery failures exceed threshold (> 100/hour)",
    name: "Webhook Bombing Response",
    severity: "MEDIUM",
    steps: [
      {
        action: "Auto-disable failing webhook endpoints after 5 consecutive failures",
        automated: true,
        owner: "Webhook Service",
      },
      {
        action: "Alert merchant of webhook failures",
        automated: true,
        owner: "Notification Service",
      },
      {
        action: "Queue events for retry when endpoint recovers",
        automated: true,
        owner: "Outbox Publisher",
      },
      { action: "Review webhook endpoint logs", automated: false, owner: "Ops Engineer" },
    ],
  },
  {
    id: "ddos-attack",
    trigger: "API request rate exceeds 10x normal baseline",
    name: "DDoS Attack Response",
    severity: "CRITICAL",
    steps: [
      { action: "Auto-enable aggressive rate limiting", automated: true, owner: "API Gateway" },
      { action: "Block offending IP ranges at edge", automated: true, owner: "Edge Protection" },
      { action: "Alert security + ops teams", automated: true, owner: "Monitoring" },
      {
        action: "Scale up infrastructure if legitimate traffic spike",
        automated: false,
        owner: "DevOps",
      },
      {
        action: "Document attack pattern for future prevention",
        automated: false,
        owner: "Security Lead",
      },
    ],
  },
  {
    id: "unauthorized-access",
    trigger: "Multiple failed login attempts followed by success",
    name: "Unauthorized Access Response",
    severity: "HIGH",
    steps: [
      { action: "Force MFA challenge on next request", automated: true, owner: "Auth Service" },
      { action: "Alert user of suspicious login", automated: true, owner: "Notification Service" },
      { action: "Alert security team if pattern repeats", automated: true, owner: "Monitoring" },
      {
        action: "Review session for suspicious activity",
        automated: false,
        owner: "Security Analyst",
      },
      {
        action: "Revoke session if confirmed unauthorized",
        automated: false,
        owner: "Security Analyst",
      },
    ],
  },
];

export function getRunbook(id: string): IncidentRunbook | undefined {
  return INCIDENT_RUNBOOKS.find((r) => r.id === id);
}

export function getRunbooksBySeverity(severity: string): IncidentRunbook[] {
  return INCIDENT_RUNBOOKS.filter((r) => r.severity === severity);
}
