// TurboCore — PRGLF Governance Data (Chapter 15)

import type {
  DomainOwnership,
  ADR,
  ChangeRecord,
  ReleaseRecord,
  IncidentRecord,
  LaunchChecklistItem,
  PostLaunchPhase,
  OperationalMetric,
  ExecutiveDashboard,
  EvolutionStage,
  ProviderGovernance,
  RegulatoryRegister,
  AIGovernanceRule,
} from "./types";

const NOW = new Date().toISOString();
const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const LAST_WEEK = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

// ---------------------------------------------------------------------------
// Platform ownership (Chapter 15)
// ---------------------------------------------------------------------------

export const DOMAIN_OWNERSHIP: DomainOwnership[] = [
  {
    domain: "Ledger",
    owner: "Financial Platform Team",
    lead: "Lead Engineer — Ledger",
    status: "ESTABLISHED",
    responsibilities: [
      "Double-entry integrity",
      "Reconciliation",
      "Period closure",
      "Migration safety",
    ],
  },
  {
    domain: "Payments",
    owner: "Payment Engineering",
    lead: "Lead Engineer — Payments",
    status: "ESTABLISHED",
    responsibilities: ["Payment lifecycle", "Orchestration", "Failover", "Idempotency"],
  },
  {
    domain: "Providers",
    owner: "Provider Integrations Team",
    lead: "Lead Engineer — Integrations",
    status: "ESTABLISHED",
    responsibilities: ["Provider adapters", "Certification", "Health monitoring", "API changes"],
  },
  {
    domain: "Security",
    owner: "Security Engineering",
    lead: "Security Lead",
    status: "ESTABLISHED",
    responsibilities: [
      "Zero Trust",
      "Secrets management",
      "Penetration testing",
      "Security scanning",
    ],
  },
  {
    domain: "Risk",
    owner: "Risk & Compliance",
    lead: "Risk Lead",
    status: "ESTABLISHED",
    responsibilities: ["Fraud detection", "Velocity rules", "AML screening", "Risk scoring"],
  },
  {
    domain: "Infrastructure",
    owner: "Platform Engineering",
    lead: "DevOps Lead",
    status: "ESTABLISHED",
    responsibilities: ["Kubernetes", "CI/CD", "Monitoring", "Multi-region"],
  },
  {
    domain: "Analytics",
    owner: "Data Platform",
    lead: "Data Lead",
    status: "ESTABLISHED",
    responsibilities: ["Event projections", "Dashboards", "Metrics", "Reporting"],
  },
  {
    domain: "Customer Portal",
    owner: "Product Engineering",
    lead: "Frontend Lead",
    status: "ESTABLISHED",
    responsibilities: ["Customer app", "UX", "Accessibility", "Mobile compatibility"],
  },
  {
    domain: "Event Bus",
    owner: "Platform Engineering",
    lead: "DevOps Lead",
    status: "ESTABLISHED",
    responsibilities: ["TEB", "Outbox", "Inbox", "Event replay"],
  },
  {
    domain: "Multi-Tenant",
    owner: "Platform Engineering",
    lead: "DevOps Lead",
    status: "ESTABLISHED",
    responsibilities: ["Tenant isolation", "RLS", "Tenant config", "White-label"],
  },
];

// ---------------------------------------------------------------------------
// Architecture Decision Records (Chapter 15)
// ---------------------------------------------------------------------------

export const ADRS: ADR[] = [
  {
    id: "ADR-001",
    title: "Use PostgreSQL as Primary Database",
    status: "ACCEPTED",
    date: "2025-01-15",
    decision: "PostgreSQL for all transactional data",
    reason: "Strong ACID guarantees, mature ecosystem, JSON support, partitioning, RLS",
    alternatives: ["MySQL", "CockroachDB", "MongoDB"],
    approvedBy: "CTO",
    tags: ["database", "infrastructure"],
  },
  {
    id: "ADR-002",
    title: "Provider Plugin Architecture",
    status: "ACCEPTED",
    date: "2025-01-20",
    decision: "All providers implement the same interface (IProviderPlugin)",
    reason:
      "Adding providers = configuration, not code changes. Business logic stays provider-agnostic.",
    alternatives: ["Hardcoded integrations", "Micro-per-service"],
    approvedBy: "CTO",
    tags: ["architecture", "providers"],
  },
  {
    id: "ADR-003",
    title: "Double-Entry Ledger (FLE)",
    status: "ACCEPTED",
    date: "2025-02-01",
    decision: "Financial Ledger Engine with immutable journal entries",
    reason: "Accounting integrity is non-negotiable. Every movement is a debit+credit pair.",
    alternatives: ["Single-entry", "Event-sourced ledger"],
    approvedBy: "CFO + CTO",
    tags: ["ledger", "finance"],
  },
  {
    id: "ADR-004",
    title: "Event-Driven Architecture (TEB)",
    status: "ACCEPTED",
    date: "2025-02-15",
    decision: "TurboCore Event Bus with outbox pattern",
    reason: "Services stay decoupled. Analytics, notifications, webhooks all consume events.",
    alternatives: ["Direct service calls", "Shared database"],
    approvedBy: "CTO",
    tags: ["architecture", "events"],
  },
  {
    id: "ADR-005",
    title: "Zero Trust Security Model",
    status: "ACCEPTED",
    date: "2025-03-01",
    decision: "Never Trust. Always Verify. RBAC + ABAC + Feature Risk Engine",
    reason: "Payment infrastructure must assume every request is hostile.",
    alternatives: ["Perimeter security", "VPN-only access"],
    approvedBy: "CISO",
    tags: ["security"],
  },
  {
    id: "ADR-006",
    title: "Multi-Tenant with Row-Level Security",
    status: "ACCEPTED",
    date: "2025-03-15",
    decision: "Shared database + tenantId + RLS for isolation",
    reason:
      "Lowest cost, simplest operations, easy analytics. Enterprise tenants can get dedicated DBs later.",
    alternatives: ["Separate databases per tenant", "Separate schemas"],
    approvedBy: "CTO",
    tags: ["multi-tenant", "infrastructure"],
  },
  {
    id: "ADR-007",
    title: "Global Capability Registry (GCR)",
    status: "ACCEPTED",
    date: "2025-04-01",
    decision: "Route to capabilities, not providers. 22 groups, 205 capabilities.",
    reason: "Adding providers = grow the registry, not change the code.",
    alternatives: ["Provider-first routing"],
    approvedBy: "CTO",
    tags: ["architecture", "capabilities"],
  },
  {
    id: "ADR-008",
    title: "Cloudflare-First Infrastructure",
    status: "ACCEPTED",
    date: "2025-05-01",
    decision: "Cloudflare Edge + Pages + Workers + R2 + Queues",
    reason: "Global edge, low cost, integrated security, simple ops for MVP phase.",
    alternatives: ["AWS-only", "GCP-only", "Multi-cloud from day 1"],
    approvedBy: "CTO",
    tags: ["infrastructure", "deployment"],
  },
];

// ---------------------------------------------------------------------------
// Change management (Chapter 15)
// ---------------------------------------------------------------------------

export const CHANGE_RECORDS: ChangeRecord[] = [
  {
    id: "CHG-001",
    type: "FEATURE",
    title: "Bulk Payment System",
    description: "CSV-based bulk disbursement with validation + processing workflow",
    status: "DEPLOYED",
    requestedBy: "product-team",
    reviewedBy: "lead-engineer",
    approvedBy: "cto",
    riskLevel: "MEDIUM",
    rollbackPlan:
      "Disable bulk-payments feature flag; existing batches remain in DB but no new processing",
    createdAt: YESTERDAY,
    deployedAt: YESTERDAY,
    verifiedAt: YESTERDAY,
  },
  {
    id: "CHG-002",
    type: "CONFIG",
    title: "Flutterwave routing weight reduction",
    description: "Reduce Flutterwave routing weight by 15% due to latency trend",
    status: "DEPLOYED",
    requestedBy: "oie-engine",
    reviewedBy: "ops-engineer",
    approvedBy: "ops-lead",
    riskLevel: "LOW",
    rollbackPlan: "Revert routing weight to previous value",
    createdAt: YESTERDAY,
    deployedAt: YESTERDAY,
    verifiedAt: YESTERDAY,
  },
  {
    id: "CHG-003",
    type: "MIGRATION",
    title: "Add EventStore + Inbox tables",
    description: "New Prisma models for event store and consumer inbox",
    status: "DEPLOYED",
    requestedBy: "platform-engineer",
    reviewedBy: "lead-engineer",
    approvedBy: "cto",
    riskLevel: "MEDIUM",
    rollbackPlan: "Tables are additive — drop if unused",
    createdAt: LAST_WEEK,
    deployedAt: LAST_WEEK,
    verifiedAt: LAST_WEEK,
  },
  {
    id: "CHG-004",
    type: "HOTFIX",
    title: "Fix CSRF blocking admin POST requests",
    description: "Global fetch interceptor to auto-inject X-CSRF-Token header",
    status: "DEPLOYED",
    requestedBy: "security-engineer",
    reviewedBy: "lead-engineer",
    approvedBy: "cto",
    riskLevel: "HIGH",
    rollbackPlan: "Remove interceptor — admin tabs will need manual CSRF tokens",
    createdAt: YESTERDAY,
    deployedAt: YESTERDAY,
    verifiedAt: YESTERDAY,
  },
];

// ---------------------------------------------------------------------------
// Release governance (Chapter 15)
// ---------------------------------------------------------------------------

export const RELEASES: ReleaseRecord[] = [
  {
    id: "REL-1.1.0",
    version: "1.1.0",
    releaseManager: "release-manager",
    releaseNotes: "Chapters 10-14: ZTSA, MTPA, OMO, PIDA, TCQAF + Bulk Payments + CSRF fix",
    rollbackPlan: "Blue-green switch to v1.0.0 — database migrations are backward compatible",
    riskAssessment: "MEDIUM",
    status: "DEPLOYED",
    deploymentChecklist: [
      { item: "All tests passing (569 tests)", done: true },
      { item: "Security scan passed (0 critical)", done: true },
      { item: "Provider certification valid", done: true },
      { item: "Ledger reconciliation passed", done: true },
      { item: "Blue-green deployment configured", done: true },
      { item: "Monitoring window: 2 hours", done: true },
      { item: "Rollback plan documented", done: true },
    ],
    monitoringWindow: "2 hours post-deploy",
    createdAt: YESTERDAY,
    deployedAt: YESTERDAY,
  },
];

// ---------------------------------------------------------------------------
// Incident governance (Chapter 15)
// ---------------------------------------------------------------------------

export const INCIDENTS: IncidentRecord[] = [
  {
    id: "INC-001",
    title: "Webhook Processing Degradation",
    severity: "HIGH",
    status: "POSTMORTEM",
    timeline: [
      {
        timestamp: YESTERDAY,
        event: "Detected — webhook processing rate dropped to 96.5%",
        actor: "Alert System",
      },
      { timestamp: YESTERDAY, event: "Acknowledged by on-call engineer", actor: "ops-engineer" },
      {
        timestamp: YESTERDAY,
        event: "Root cause identified — Paystack API signature format changed",
        actor: "ops-engineer",
      },
      {
        timestamp: YESTERDAY,
        event: "Mitigated — updated signature verification logic",
        actor: "ops-engineer",
      },
      {
        timestamp: YESTERDAY,
        event: "Resolved — webhook processing back to 99.2%",
        actor: "ops-engineer",
      },
    ],
    impact: "Webhook delivery delayed by 15-30 seconds for ~20 minutes",
    rootCause:
      "Paystack updated webhook signature header format without notice. Our verification logic expected the old format.",
    resolution:
      "Updated signature verification to accept both old and new Paystack formats. Added contract test to detect future changes.",
    customerImpact:
      "0 customers affected — all webhooks eventually delivered. No financial impact.",
    lessonsLearned: [
      "Provider API changes can happen without notice — contract tests must run continuously",
      "Webhook signature verification should be lenient during transition periods",
      "OIE correctly detected the anomaly before customers noticed",
    ],
    actionItems: [
      {
        item: "Add Paystack webhook signature format to contract tests",
        owner: "provider-team",
        dueDate: NOW,
        status: "DONE",
      },
      {
        item: "Set up provider API changelog monitoring",
        owner: "provider-team",
        dueDate: NOW,
        status: "IN_PROGRESS",
      },
      {
        item: "Document webhook signature migration procedure",
        owner: "ops-team",
        dueDate: NOW,
        status: "DONE",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Launch checklist (Chapter 15)
// ---------------------------------------------------------------------------

export const LAUNCH_CHECKLIST: LaunchChecklistItem[] = [
  // Technical
  {
    id: "lc1",
    category: "TECHNICAL",
    check: "All critical tests passing",
    status: "DONE",
    evidence: "569 tests, 96.3% pass rate",
    owner: "Engineering",
  },
  {
    id: "lc2",
    category: "TECHNICAL",
    check: "Provider certification complete",
    status: "DONE",
    evidence: "9/11 providers certified (Stripe + Wise pending)",
    owner: "Provider Team",
  },
  {
    id: "lc3",
    category: "TECHNICAL",
    check: "Ledger validated",
    status: "DONE",
    evidence: "100/100 ledger certification — zero variances",
    owner: "Finance Eng",
  },
  {
    id: "lc4",
    category: "TECHNICAL",
    check: "Monitoring operational",
    status: "DONE",
    evidence: "OMO — 5 pillars, 17 provider health, 7 SLIs",
    owner: "DevOps",
  },
  {
    id: "lc5",
    category: "TECHNICAL",
    check: "Backups tested",
    status: "DONE",
    evidence: "5 backup configs all healthy, restore tested",
    owner: "DevOps",
  },
  {
    id: "lc6",
    category: "TECHNICAL",
    check: "Disaster recovery tested",
    status: "DONE",
    evidence: "RPO 3min, RTO 22min — tested " + LAST_WEEK.slice(0, 10),
    owner: "DevOps",
  },
  // Security
  {
    id: "lc7",
    category: "SECURITY",
    check: "Penetration testing completed",
    status: "IN_PROGRESS",
    evidence: "Internal pen test done, external scheduled",
    owner: "Security",
  },
  {
    id: "lc8",
    category: "SECURITY",
    check: "Secrets rotated",
    status: "DONE",
    evidence: "7 secrets managed, 6 with rotation enabled",
    owner: "DevOps",
  },
  {
    id: "lc9",
    category: "SECURITY",
    check: "MFA enforced",
    status: "DONE",
    evidence: "MFA + Passkeys + TOTP configured",
    owner: "Security",
  },
  {
    id: "lc10",
    category: "SECURITY",
    check: "Audit logging enabled",
    status: "DONE",
    evidence: "Immutable audit logs, 79 security events tracked",
    owner: "Security",
  },
  // Operations
  {
    id: "lc11",
    category: "OPERATIONS",
    check: "Runbooks available",
    status: "DONE",
    evidence: "6 incident runbooks documented",
    owner: "DevOps",
  },
  {
    id: "lc12",
    category: "OPERATIONS",
    check: "On-call schedule defined",
    status: "DONE",
    evidence: "L1 → L2 → Engineering → Platform escalation",
    owner: "DevOps",
  },
  {
    id: "lc13",
    category: "OPERATIONS",
    check: "Alerting verified",
    status: "DONE",
    evidence: "2 firing alerts, 1 active incident with timeline",
    owner: "DevOps",
  },
  {
    id: "lc14",
    category: "OPERATIONS",
    check: "Support team trained",
    status: "IN_PROGRESS",
    evidence: "Training in progress for Tier 1 support",
    owner: "Support Lead",
  },
  // Business
  {
    id: "lc15",
    category: "BUSINESS",
    check: "Pricing approved",
    status: "DONE",
    evidence: "Per-tenant fee schedules configured",
    owner: "Finance",
  },
  {
    id: "lc16",
    category: "BUSINESS",
    check: "Terms of service published",
    status: "DONE",
    evidence: "Available at turbopay.ng/terms",
    owner: "Legal",
  },
  {
    id: "lc17",
    category: "BUSINESS",
    check: "Privacy policy published",
    status: "DONE",
    evidence: "Available at turbopay.ng/privacy",
    owner: "Legal",
  },
  {
    id: "lc18",
    category: "BUSINESS",
    check: "Merchant onboarding tested",
    status: "DONE",
    evidence: "Plug-and-play onboarding verified end-to-end",
    owner: "Product",
  },
  {
    id: "lc19",
    category: "BUSINESS",
    check: "Customer support ready",
    status: "IN_PROGRESS",
    evidence: "Support team training 80% complete",
    owner: "Support Lead",
  },
  // Compliance
  {
    id: "lc20",
    category: "COMPLIANCE",
    check: "Licences and approvals confirmed",
    status: "DONE",
    evidence: "CBN approval for Nigeria operations",
    owner: "Compliance",
  },
  {
    id: "lc21",
    category: "COMPLIANCE",
    check: "Reporting processes established",
    status: "DONE",
    evidence: "Automated regulatory reporting via audit dashboard",
    owner: "Compliance",
  },
  {
    id: "lc22",
    category: "COMPLIANCE",
    check: "KYC and AML workflows validated",
    status: "DONE",
    evidence: "KYC engine + AML screening + sanctions check all operational",
    owner: "Compliance",
  },
];

// ---------------------------------------------------------------------------
// Post-launch strategy (Chapter 15)
// ---------------------------------------------------------------------------

export const POST_LAUNCH_PHASES: PostLaunchPhase[] = [
  {
    phase: "Stabilization",
    days: "Days 1-30",
    priorities: [
      "Monitor aggressively",
      "Minimize feature releases",
      "Resolve production issues quickly",
      "Validate provider performance",
    ],
    status: "CURRENT",
  },
  {
    phase: "Optimization",
    days: "Days 31-60",
    priorities: [
      "Optimize routing",
      "Tune risk rules",
      "Improve operational dashboards",
      "Reduce latency",
    ],
    status: "UPCOMING",
  },
  {
    phase: "Expansion",
    days: "Days 61-90",
    priorities: [
      "Onboard additional providers",
      "Expand to new payment methods",
      "Refine customer experience",
      "Prepare for regional expansion",
    ],
    status: "UPCOMING",
  },
];

// ---------------------------------------------------------------------------
// Operational metrics (Chapter 15)
// ---------------------------------------------------------------------------

export const OPERATIONAL_METRICS: OperationalMetric[] = [
  {
    name: "Deployment Frequency",
    value: 12,
    unit: "/week",
    target: 10,
    trend: "UP",
    status: "GOOD",
  },
  { name: "Lead Time", value: 4, unit: "hours", target: 8, trend: "DOWN", status: "GOOD" },
  { name: "Availability", value: 99.97, unit: "%", target: 99.95, trend: "STABLE", status: "GOOD" },
  {
    name: "Payment Success",
    value: 99.2,
    unit: "%",
    target: 99.9,
    trend: "DOWN",
    status: "WARNING",
  },
  {
    name: "Settlement Accuracy",
    value: 99.99,
    unit: "%",
    target: 99.9,
    trend: "STABLE",
    status: "GOOD",
  },
  { name: "Incident Count (30d)", value: 1, unit: "", target: 0, trend: "DOWN", status: "WARNING" },
  { name: "Customer Satisfaction", value: 94, unit: "%", target: 90, trend: "UP", status: "GOOD" },
  {
    name: "Support Resolution Time",
    value: 18,
    unit: "min",
    target: 30,
    trend: "DOWN",
    status: "GOOD",
  },
];

// ---------------------------------------------------------------------------
// Executive dashboard (Chapter 15)
// ---------------------------------------------------------------------------

export const EXECUTIVE_DASHBOARD: ExecutiveDashboard = {
  grossPaymentVolume: 125_000_000, // ₦1.25M in kobo
  grossPaymentVolumeCurrency: "NGN",
  netRevenue: 4_500_000,
  netRevenueCurrency: "NGN",
  activeCustomers: 1248,
  activeMerchants: 47,
  providerDistribution: [
    { provider: "Paystack", percentage: 45, volume: 56_250_000 },
    { provider: "Flutterwave", percentage: 30, volume: 37_500_000 },
    { provider: "M-Pesa", percentage: 12, volume: 15_000_000 },
    { provider: "Monnify", percentage: 8, volume: 10_000_000 },
    { provider: "TurboPay", percentage: 5, volume: 6_250_000 },
  ],
  geographicGrowth: [
    { country: "NG", growth: 15.2 },
    { country: "KE", growth: 22.8 },
    { country: "GH", growth: 8.5 },
  ],
  settlementPerformance: 99.99,
  platformAvailability: 99.97,
};

// ---------------------------------------------------------------------------
// Platform evolution roadmap (Chapter 15)
// ---------------------------------------------------------------------------

export const EVOLUTION_STAGES: EvolutionStage[] = [
  {
    stage: "TurboPay",
    description: "Consumer payment app — wallet, transfers, bills, cards",
    status: "COMPLETED",
    timeline: "Phase 1 (MVP)",
    capabilities: ["Wallet", "Transfers", "Airtime", "Bills", "Virtual Cards", "Savings"],
  },
  {
    stage: "TurboCore",
    description: "Payment orchestration platform — provider-agnostic, multi-tenant",
    status: "CURRENT",
    timeline: "Phase 2 (Current)",
    capabilities: [
      "GCR",
      "Multi-tenant",
      "Zero Trust",
      "Event Bus",
      "Observability",
      "15 chapters complete",
    ],
  },
  {
    stage: "Africa Payment Platform",
    description: "Multi-country African payment infrastructure",
    status: "NEXT",
    timeline: "Phase 3 (6-12 months)",
    capabilities: [
      "Nigeria + Kenya + Ghana + South Africa",
      "Regional provider routing",
      "Local settlement",
      "Multi-currency",
    ],
  },
  {
    stage: "Global Payment Orchestrator",
    description: "Global payment orchestration with regional compliance",
    status: "FUTURE",
    timeline: "Phase 4 (1-2 years)",
    capabilities: [
      "Multi-region active-active",
      "Cross-border payments",
      "Global compliance",
      "200+ providers",
    ],
  },
  {
    stage: "Embedded Finance Platform",
    description: "White-label payment infrastructure for banks + fintechs",
    status: "FUTURE",
    timeline: "Phase 5 (2-3 years)",
    capabilities: [
      "Full white-label",
      "API marketplace",
      "Banking-as-a-Service",
      "Embedded finance SDKs",
    ],
  },
  {
    stage: "Financial Infrastructure Platform",
    description: "National-scale financial infrastructure",
    status: "FUTURE",
    timeline: "Phase 6 (3-5 years)",
    capabilities: [
      "Government payments",
      "CBDC integration",
      "Real-time gross settlement",
      "National payment rails",
    ],
  },
];

// ---------------------------------------------------------------------------
// Provider governance (Chapter 15)
// ---------------------------------------------------------------------------

export const PROVIDER_GOVERNANCE: ProviderGovernance[] = [
  {
    providerCode: "paystack",
    displayName: "Paystack",
    operationalStatus: "ACTIVE",
    certificationStatus: "CERTIFIED",
    businessOwner: "BD Lead",
    technicalOwner: "Provider Team",
    lastReview: YESTERDAY,
    renewalDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    supportContacts: ["support@paystack.com", "account-manager@paystack.com"],
  },
  {
    providerCode: "flutterwave",
    displayName: "Flutterwave",
    operationalStatus: "ACTIVE",
    certificationStatus: "CERTIFIED",
    businessOwner: "BD Lead",
    technicalOwner: "Provider Team",
    lastReview: YESTERDAY,
    renewalDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    supportContacts: ["support@flutterwave.com"],
  },
  {
    providerCode: "mpesa",
    displayName: "M-Pesa (Safaricom)",
    operationalStatus: "ACTIVE",
    certificationStatus: "CERTIFIED",
    businessOwner: "Partnerships Lead",
    technicalOwner: "Provider Team",
    lastReview: LAST_WEEK,
    renewalDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
    supportContacts: ["api-support@safaricom.co.ke"],
  },
  {
    providerCode: "stripe",
    displayName: "Stripe",
    operationalStatus: "MAINTENANCE",
    certificationStatus: "PENDING",
    businessOwner: "BD Lead",
    technicalOwner: "Provider Team",
    lastReview: LAST_WEEK,
    renewalDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    supportContacts: ["support@stripe.com"],
  },
  {
    providerCode: "wise",
    displayName: "Wise Platform",
    operationalStatus: "MAINTENANCE",
    certificationStatus: "PENDING",
    businessOwner: "BD Lead",
    technicalOwner: "Provider Team",
    lastReview: LAST_WEEK,
    renewalDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    supportContacts: ["platform-support@wise.com"],
  },
];

// ---------------------------------------------------------------------------
// Regulatory governance (Chapter 15)
// ---------------------------------------------------------------------------

export const REGULATORY_REGISTERS: RegulatoryRegister[] = [
  {
    country: "Nigeria",
    licensing: "CBN Payment Service Bank License",
    reporting: "Monthly CBN returns",
    retention: "7 years (CBN)",
    kyc: "BVN + NIN required",
    aml: "NFIU reporting",
    consumerProtection: "CBN consumer protection regulations",
    status: "ESTABLISHED",
  },
  {
    country: "Kenya",
    licensing: "CBK Payment Service Provider License",
    reporting: "Quarterly CBK returns",
    retention: "7 years",
    kyc: "National ID + KRA PIN",
    aml: "FRC reporting",
    consumerProtection: "CBK consumer protection",
    status: "IN_PROGRESS",
  },
  {
    country: "Ghana",
    licensing: "BoG Payment Service Provider License",
    reporting: "Monthly BoG returns",
    retention: "7 years",
    kyc: "Ghana Card",
    aml: "FIC reporting",
    consumerProtection: "BoG consumer protection",
    status: "IN_PROGRESS",
  },
  {
    country: "South Africa",
    licensing: "SARB approval required",
    reporting: "Quarterly SARB returns",
    retention: "7 years",
    kyc: "SA ID + FICA",
    aml: "FIC reporting",
    consumerProtection: "NCA + FSCA",
    status: "PLANNED",
  },
];

// ---------------------------------------------------------------------------
// AI governance (Chapter 15)
// ---------------------------------------------------------------------------

export const AI_GOVERNANCE_RULES: AIGovernanceRule[] = [
  {
    rule: "Every AI-generated change is reviewed",
    description: "No AI code reaches production without human review",
    enforced: true,
  },
  {
    rule: "AI cannot approve its own code",
    description: "AI can write code but cannot approve PRs or trigger deployments",
    enforced: true,
  },
  {
    rule: "AI changes require automated validation",
    description: "Lint + typecheck + tests must pass before review",
    enforced: true,
  },
  {
    rule: "Prompt history retained for architectural work",
    description: "Significant architectural decisions have prompt history in ADR",
    enforced: true,
  },
  {
    rule: "AI recommendations subject to engineering judgment",
    description: "AI suggests, humans decide — especially for financial logic",
    enforced: true,
  },
];

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function getPrglfStats() {
  const launchDone = LAUNCH_CHECKLIST.filter((c) => c.status === "DONE").length;
  const launchTotal = LAUNCH_CHECKLIST.length;
  return {
    domainOwnership: DOMAIN_OWNERSHIP.length,
    adrs: ADRS.length,
    acceptedAdrs: ADRS.filter((a) => a.status === "ACCEPTED").length,
    changeRecords: CHANGE_RECORDS.length,
    releases: RELEASES.length,
    incidents: INCIDENTS.length,
    launchChecklistTotal: launchTotal,
    launchChecklistDone: launchDone,
    launchReadiness: Math.round((launchDone / launchTotal) * 100),
    postLaunchPhases: POST_LAUNCH_PHASES.length,
    operationalMetrics: OPERATIONAL_METRICS.length,
    providerGovernance: PROVIDER_GOVERNANCE.length,
    regulatoryRegisters: REGULATORY_REGISTERS.length,
    aiGovernanceRules: AI_GOVERNANCE_RULES.length,
    evolutionStages: EVOLUTION_STAGES.length,
  };
}
