// TurboCore — PIDA Deployment Data (Chapter 13)
//
// The production deployment blueprint — infrastructure components, environments,
// CI/CD pipelines, regions, backup/DR, readiness checklist, cost phases.

import type {
  EnvironmentConfig,
  DeploymentRecord,
  CICDPipeline,
  InfraComponent,
  RegionConfig,
  BackupConfig,
  DRTarget,
  ReadinessCheck,
  AutoscalingRule,
  SecretConfig,
  CostPhase,
} from "./types";

const NOW = new Date().toISOString();
const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

// ---------------------------------------------------------------------------
// Environments (Chapter 13 — promotion pipeline)
// ---------------------------------------------------------------------------

export const ENVIRONMENTS: EnvironmentConfig[] = [
  {
    id: "DEVELOPMENT",
    name: "Development",
    description: "Local development + feature branches. No real data.",
    url: "http://localhost:3000",
    status: "ACTIVE",
    databaseUrl: "file:./db/dev.db",
    redisUrl: "localhost:6379",
    region: "local",
    replicas: 1,
    autoScaling: false,
    lastDeployedAt: NOW,
    deployedBy: "developer",
    version: "dev",
  },
  {
    id: "SANDBOX",
    name: "Sandbox",
    description: "Provider sandbox testing. No real money.",
    url: "https://sandbox.turbopay.ng",
    status: "ACTIVE",
    databaseUrl: "postgresql://****@sandbox-db:5432/turbopay",
    redisUrl: "redis://****@sandbox-redis:6379",
    region: "eu-west-1",
    replicas: 2,
    autoScaling: true,
    lastDeployedAt: YESTERDAY,
    deployedBy: "ci-cd",
    version: "1.0.0-sandbox",
  },
  {
    id: "INTEGRATION",
    name: "Integration",
    description: "Full system integration testing.",
    url: "https://integration.turbopay.ng",
    status: "ACTIVE",
    databaseUrl: "postgresql://****@integration-db:5432/turbopay",
    redisUrl: "redis://****@integration-redis:6379",
    region: "eu-west-1",
    replicas: 2,
    autoScaling: true,
    lastDeployedAt: YESTERDAY,
    deployedBy: "ci-cd",
    version: "1.0.0-integration",
  },
  {
    id: "UAT",
    name: "UAT",
    description: "User acceptance testing with staging data.",
    url: "https://uat.turbopay.ng",
    status: "ACTIVE",
    databaseUrl: "postgresql://****@uat-db:5432/turbopay",
    redisUrl: "redis://****@uat-redis:6379",
    region: "eu-west-1",
    replicas: 2,
    autoScaling: true,
    lastDeployedAt: YESTERDAY,
    deployedBy: "qa-team",
    version: "1.0.0-rc.3",
  },
  {
    id: "PRODUCTION",
    name: "Production",
    description: "Live production environment. Real money. Real customers.",
    url: "https://turbopay.ng",
    status: "ACTIVE",
    databaseUrl: "postgresql://****@prod-db-cluster:5432/turbopay",
    redisUrl: "redis://****@prod-redis-cluster:6379",
    region: "eu-west-1 (primary), af-south-1 (planned)",
    replicas: 3,
    autoScaling: true,
    lastDeployedAt: YESTERDAY,
    deployedBy: "release-manager",
    version: "1.0.0",
  },
];

// ---------------------------------------------------------------------------
// CI/CD Pipeline (Chapter 13)
// ---------------------------------------------------------------------------

export const PIPELINES: CICDPipeline[] = [
  {
    id: "main-pipeline",
    name: "Main CI/CD Pipeline",
    trigger: "PUSH",
    branch: "main",
    status: "SUCCESS",
    lastRun: YESTERDAY,
    duration: 342,
    stages: [
      {
        name: "Install Dependencies",
        type: "BUILD",
        status: "SUCCESS",
        duration: 45,
        startedAt: YESTERDAY,
        completedAt: YESTERDAY,
      },
      {
        name: "Lint (ESLint)",
        type: "LINT",
        status: "SUCCESS",
        duration: 12,
        startedAt: YESTERDAY,
        completedAt: YESTERDAY,
      },
      {
        name: "Type Check (tsc)",
        type: "TEST",
        status: "SUCCESS",
        duration: 38,
        startedAt: YESTERDAY,
        completedAt: YESTERDAY,
      },
      {
        name: "Unit Tests (Vitest)",
        type: "TEST",
        status: "SUCCESS",
        duration: 25,
        startedAt: YESTERDAY,
        completedAt: YESTERDAY,
      },
      {
        name: "Security Scan (SAST)",
        type: "SECURITY_SCAN",
        status: "SUCCESS",
        duration: 67,
        startedAt: YESTERDAY,
        completedAt: YESTERDAY,
      },
      {
        name: "Dependency Scan",
        type: "SECURITY_SCAN",
        status: "SUCCESS",
        duration: 18,
        startedAt: YESTERDAY,
        completedAt: YESTERDAY,
      },
      {
        name: "Build (Next.js)",
        type: "BUILD",
        status: "SUCCESS",
        duration: 89,
        startedAt: YESTERDAY,
        completedAt: YESTERDAY,
      },
      {
        name: "Container Build",
        type: "CONTAINER",
        status: "SUCCESS",
        duration: 34,
        startedAt: YESTERDAY,
        completedAt: YESTERDAY,
      },
      {
        name: "Deploy to Staging",
        type: "DEPLOY",
        status: "SUCCESS",
        duration: 8,
        startedAt: YESTERDAY,
        completedAt: YESTERDAY,
      },
      {
        name: "Smoke Tests",
        type: "SMOKE_TEST",
        status: "SUCCESS",
        duration: 6,
        startedAt: YESTERDAY,
        completedAt: YESTERDAY,
      },
    ],
  },
];

export const RECENT_DEPLOYMENTS: DeploymentRecord[] = [
  {
    id: "dep_1",
    version: "1.0.0",
    environment: "PRODUCTION",
    strategy: "BLUE_GREEN",
    status: "SUCCESS",
    startedAt: YESTERDAY,
    completedAt: YESTERDAY,
    deployedBy: "release-manager",
    commitHash: "5d97106",
    canaryPercent: 100,
    smokeTestsPassed: true,
  },
  {
    id: "dep_2",
    version: "1.1.0-canary",
    environment: "PRODUCTION",
    strategy: "CANARY",
    status: "DEPLOYING",
    startedAt: NOW,
    completedAt: null,
    deployedBy: "ci-cd",
    commitHash: "abc1234",
    canaryPercent: 5,
    smokeTestsPassed: false,
  },
];

// ---------------------------------------------------------------------------
// Infrastructure components (Chapter 13)
// ---------------------------------------------------------------------------

export const INFRA_COMPONENTS: InfraComponent[] = [
  {
    id: "edge-cf",
    name: "Cloudflare Edge",
    type: "EDGE",
    provider: "Cloudflare",
    status: "HEALTHY",
    region: "Global",
    phase: 1,
    description: "DNS, CDN, WAF, DDoS protection, SSL/TLS, rate limiting",
    config: { waf: true, ddos: true, rateLimit: "1000/min" },
  },
  {
    id: "frontend-pages",
    name: "Next.js Frontend",
    type: "FRONTEND",
    provider: "Cloudflare Pages",
    status: "HEALTHY",
    region: "Global",
    phase: 1,
    description: "React frontend served via Cloudflare Pages CDN",
    config: { framework: "Next.js 16", ssr: true },
  },
  {
    id: "api-gateway",
    name: "API Gateway",
    type: "API_GATEWAY",
    provider: "Cloudflare Workers",
    status: "HEALTHY",
    region: "Global",
    phase: 1,
    description: "Lightweight gateway: auth, routing, rate limiting, validation",
    config: { runtime: "Cloudflare Workers" },
  },
  {
    id: "backend-k8s",
    name: "Backend Services (K8s)",
    type: "BACKEND_SERVICE",
    provider: "Kubernetes",
    status: "HEALTHY",
    region: "eu-west-1",
    phase: 1,
    description:
      "Containerized microservices: Identity, Payment, Wallet, Ledger, Risk, Provider, Notification, Settlement, Analytics",
    config: { services: 9, minReplicas: 2, maxReplicas: 10 },
  },
  {
    id: "db-postgres",
    name: "PostgreSQL Cluster",
    type: "DATABASE",
    provider: "PostgreSQL",
    status: "HEALTHY",
    region: "eu-west-1",
    phase: 1,
    description: "Primary + Read Replica + Analytics Replica",
    config: { primary: true, readReplicas: 1, analyticsReplicas: 1, walArchiving: true },
  },
  {
    id: "redis",
    name: "Redis Cluster",
    type: "REDIS",
    provider: "Redis",
    status: "HEALTHY",
    region: "eu-west-1",
    phase: 1,
    description:
      "Sessions, idempotency, provider health cache, routing cache, distributed locks, rate limiting",
    config: { mode: "cluster", persistence: false },
  },
  {
    id: "storage-r2",
    name: "Object Storage (R2)",
    type: "OBJECT_STORAGE",
    provider: "Cloudflare R2",
    status: "HEALTHY",
    region: "Global",
    phase: 1,
    description: "KYC documents, receipts, reports, audit exports, merchant assets",
    config: { encryption: true, versioning: true },
  },
  {
    id: "queue-cf",
    name: "Event Queue",
    type: "EVENT_QUEUE",
    provider: "Cloudflare Queues",
    status: "HEALTHY",
    region: "Global",
    phase: 1,
    description: "Async event processing — outbox publisher, webhook delivery",
    config: { phase1: "Cloudflare Queues", phase2: "NATS JetStream", phase3: "Apache Kafka" },
  },
  {
    id: "monitoring",
    name: "Observability Stack",
    type: "MONITORING",
    provider: "OpenTelemetry",
    status: "HEALTHY",
    region: "eu-west-1",
    phase: 1,
    description: "Structured logging, metrics, distributed tracing, dashboards, alerting",
    config: { logs: "Loki", metrics: "Prometheus", traces: "Jaeger", dashboards: "Grafana" },
  },
];

// ---------------------------------------------------------------------------
// Multi-region (Chapter 13)
// ---------------------------------------------------------------------------

export const REGIONS: RegionConfig[] = [
  {
    id: "eu-west-1",
    name: "Europe West (Primary)",
    countries: ["ALL"],
    status: "ACTIVE",
    primaryProvider: "paystack",
    latencyMs: 45,
    dataResidency: "EU GDPR compliant",
  },
  {
    id: "af-south-1",
    name: "Africa South (Lagos)",
    countries: ["NG", "GH"],
    status: "PLANNED",
    primaryProvider: "paystack",
    latencyMs: 15,
    dataResidency: "Nigeria NDPR compliant",
  },
  {
    id: "af-east-1",
    name: "Africa East (Nairobi)",
    countries: ["KE", "UG", "TZ", "RW"],
    status: "PLANNED",
    primaryProvider: "mpesa",
    latencyMs: 12,
    dataResidency: "Kenya DPA compliant",
  },
  {
    id: "me-central-1",
    name: "Middle East (Planned)",
    countries: ["AE", "SA"],
    status: "STANDBY",
    primaryProvider: "stripe",
    latencyMs: 35,
    dataResidency: "UAE PDPL compliant",
  },
  {
    id: "ap-south-1",
    name: "Asia South (Planned)",
    countries: ["IN"],
    status: "STANDBY",
    primaryProvider: "razorpay",
    latencyMs: 28,
    dataResidency: "India DPDP compliant",
  },
];

// ---------------------------------------------------------------------------
// Backup & DR (Chapter 13)
// ---------------------------------------------------------------------------

export const BACKUP_CONFIGS: BackupConfig[] = [
  {
    component: "PostgreSQL",
    type: "WAL_ARCHIVING",
    frequency: "Continuous",
    retention: "7 days",
    lastBackupAt: NOW,
    status: "HEALTHY",
  },
  {
    component: "PostgreSQL",
    type: "DAILY_BACKUP",
    frequency: "Every 24h",
    retention: "30 days",
    lastBackupAt: YESTERDAY,
    status: "HEALTHY",
  },
  {
    component: "PostgreSQL",
    type: "WEEKLY_SNAPSHOT",
    frequency: "Every 7 days",
    retention: "12 weeks",
    lastBackupAt: YESTERDAY,
    status: "HEALTHY",
  },
  {
    component: "PostgreSQL",
    type: "MONTHLY_ARCHIVE",
    frequency: "Every 30 days",
    retention: "7 years",
    lastBackupAt: YESTERDAY,
    status: "HEALTHY",
  },
  {
    component: "Cloudflare R2",
    type: "DAILY_BACKUP",
    frequency: "Continuous (versioning)",
    retention: "Forever (versioned)",
    lastBackupAt: NOW,
    status: "HEALTHY",
  },
];

export const DR_TARGET: DRTarget = {
  rpo: "≤ 5 minutes",
  rto: "≤ 30 minutes",
  crossRegionBackups: true,
  testedAt: YESTERDAY,
  proceduresDocumented: true,
};

// ---------------------------------------------------------------------------
// Production readiness checklist (Chapter 13)
// ---------------------------------------------------------------------------

export const READINESS_CHECKS: ReadinessCheck[] = [
  {
    id: "rc1",
    category: "Providers",
    check: "All provider adapters pass certification tests",
    status: "READY",
    evidence: "17 providers certified via /api/admin/gcr/certification",
    owner: "Engineering",
  },
  {
    id: "rc2",
    category: "Ledger",
    check: "Ledger reconciliation passes with zero unexplained variances",
    status: "READY",
    evidence: "FLE reconciliation engine — 0 variances in last 30 days",
    owner: "Finance",
  },
  {
    id: "rc3",
    category: "DR",
    check: "Disaster recovery has been tested",
    status: "READY",
    evidence: "DR tested on " + YESTERDAY.slice(0, 10) + " — RPO 3min, RTO 22min",
    owner: "DevOps",
  },
  {
    id: "rc4",
    category: "Security",
    check: "Security scanning passes",
    status: "READY",
    evidence: "16 security checks — 9 PASS, 7 WARN (dev-only), 0 FAIL",
    owner: "Security",
  },
  {
    id: "rc5",
    category: "Observability",
    check: "Observability dashboards are operational",
    status: "READY",
    evidence: "OMO — 5 pillars: logs, metrics, tracing, health, alerting",
    owner: "DevOps",
  },
  {
    id: "rc6",
    category: "Alerting",
    check: "Alerting has been validated",
    status: "READY",
    evidence: "2 firing alerts, 1 active incident with timeline",
    owner: "DevOps",
  },
  {
    id: "rc7",
    category: "Deployment",
    check: "Blue-green rollback has been rehearsed",
    status: "IN_PROGRESS",
    evidence: "Blue-green configured, rollback tested in staging",
    owner: "DevOps",
  },
  {
    id: "rc8",
    category: "Backup",
    check: "Backup restoration has been tested",
    status: "READY",
    evidence: "Monthly restore test passed",
    owner: "DevOps",
  },
  {
    id: "rc9",
    category: "Operations",
    check: "Runbooks exist for critical incidents",
    status: "READY",
    evidence: "6 incident runbooks in ZTSA",
    owner: "Security",
  },
  {
    id: "rc10",
    category: "Secrets",
    check: "Production secrets managed through secure secret manager",
    status: "IN_PROGRESS",
    evidence: "Cloudflare Secrets configured for 6 secrets, 2 pending rotation",
    owner: "DevOps",
  },
  {
    id: "rc11",
    category: "Compliance",
    check: "PCI DSS scope reduction validated",
    status: "READY",
    evidence: "No raw PAN stored — provider tokens only",
    owner: "Compliance",
  },
  {
    id: "rc12",
    category: "Multi-Tenant",
    check: "Tenant isolation verified",
    status: "READY",
    evidence: "RLS helpers + tenant context + cross-tenant audit",
    owner: "Engineering",
  },
];

// ---------------------------------------------------------------------------
// Autoscaling (Chapter 13)
// ---------------------------------------------------------------------------

export const AUTOSCALING_RULES: AutoscalingRule[] = [
  {
    metric: "CPU",
    threshold: 70,
    operator: "GT",
    action: "SCALE_UP",
    minReplicas: 2,
    maxReplicas: 10,
  },
  {
    metric: "CPU",
    threshold: 30,
    operator: "LT",
    action: "SCALE_DOWN",
    minReplicas: 2,
    maxReplicas: 10,
  },
  {
    metric: "Memory",
    threshold: 80,
    operator: "GT",
    action: "SCALE_UP",
    minReplicas: 2,
    maxReplicas: 10,
  },
  {
    metric: "QueueLength",
    threshold: 100,
    operator: "GT",
    action: "SCALE_UP",
    minReplicas: 2,
    maxReplicas: 10,
  },
  {
    metric: "RequestLatency",
    threshold: 500,
    operator: "GT",
    action: "SCALE_UP",
    minReplicas: 2,
    maxReplicas: 10,
  },
];

// ---------------------------------------------------------------------------
// Secret management (Chapter 13)
// ---------------------------------------------------------------------------

export const SECRET_CONFIGS: SecretConfig[] = [
  {
    name: "DATABASE_URL",
    type: "DATABASE_URL",
    storedIn: "Cloudflare Secrets",
    rotationEnabled: true,
    lastRotatedAt: YESTERDAY,
    environments: ["SANDBOX", "UAT", "PRODUCTION"],
  },
  {
    name: "REDIS_URL",
    type: "REDIS_URL",
    storedIn: "Cloudflare Secrets",
    rotationEnabled: true,
    lastRotatedAt: YESTERDAY,
    environments: ["SANDBOX", "UAT", "PRODUCTION"],
  },
  {
    name: "JWT_SECRET",
    type: "JWT_SECRET",
    storedIn: "Cloudflare Secrets",
    rotationEnabled: true,
    lastRotatedAt: null,
    environments: ["PRODUCTION"],
  },
  {
    name: "PAYSTACK_SECRET_KEY",
    type: "PROVIDER_KEY",
    storedIn: "Cloudflare Secrets",
    rotationEnabled: true,
    lastRotatedAt: YESTERDAY,
    environments: ["SANDBOX", "PRODUCTION"],
  },
  {
    name: "FLUTTERWAVE_SECRET_KEY",
    type: "PROVIDER_KEY",
    storedIn: "Cloudflare Secrets",
    rotationEnabled: true,
    lastRotatedAt: YESTERDAY,
    environments: ["SANDBOX", "PRODUCTION"],
  },
  {
    name: "ENCRYPTION_KEY",
    type: "ENCRYPTION_KEY",
    storedIn: "Cloudflare Secrets",
    rotationEnabled: false,
    lastRotatedAt: null,
    environments: ["PRODUCTION"],
  },
  {
    name: "WEBHOOK_SIGNING_SECRET",
    type: "WEBHOOK_SECRET",
    storedIn: "Cloudflare Secrets",
    rotationEnabled: true,
    lastRotatedAt: null,
    environments: ["PRODUCTION"],
  },
];

// ---------------------------------------------------------------------------
// Cost optimization phases (Chapter 13)
// ---------------------------------------------------------------------------

export const COST_PHASES: CostPhase[] = [
  {
    phase: "Phase 1 — MVP",
    description: "Single region, managed services, minimal infrastructure",
    monthlyEstimate: "$500-1,500/month",
    components: [
      "Cloudflare Pages (Free)",
      "Cloudflare Workers ($5/mo)",
      "Managed PostgreSQL ($100-300)",
      "Managed Redis ($50-150)",
      "Cloudflare Queues ($5-20)",
      "Cloudflare R2 ($5-20)",
      "Single K8s cluster ($200-500)",
    ],
    transactionCapacity: "Up to 100K transactions/month",
  },
  {
    phase: "Phase 2 — African Scale",
    description: "Two Kubernetes regions, PostgreSQL read replicas, regional provider routing",
    monthlyEstimate: "$3,000-8,000/month",
    components: [
      "Two K8s regions",
      "PostgreSQL cluster + read replicas",
      "Dedicated Redis cluster",
      "Regional provider routing",
      "Central observability stack",
      "Automated failover",
    ],
    transactionCapacity: "Up to 5M transactions/month",
  },
  {
    phase: "Phase 3 — Global Scale",
    description: "Multi-region Kubernetes, global traffic management, cross-region DB replication",
    monthlyEstimate: "$15,000-50,000/month",
    components: [
      "Multi-region K8s",
      "Global traffic management",
      "Cross-region DB replication",
      "Regional compliance boundaries",
      "Active-active architecture",
      "Dedicated networking",
    ],
    transactionCapacity: "50M+ transactions/month",
  },
];

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function getPidaStats() {
  return {
    environments: ENVIRONMENTS.length,
    activeEnvironments: ENVIRONMENTS.filter((e) => e.status === "ACTIVE").length,
    infraComponents: INFRA_COMPONENTS.length,
    healthyComponents: INFRA_COMPONENTS.filter((c) => c.status === "HEALTHY").length,
    regions: REGIONS.length,
    activeRegions: REGIONS.filter((r) => r.status === "ACTIVE").length,
    plannedRegions: REGIONS.filter((r) => r.status === "PLANNED").length,
    readinessChecks: READINESS_CHECKS.length,
    readyChecks: READINESS_CHECKS.filter((c) => c.status === "READY").length,
    inProgressChecks: READINESS_CHECKS.filter((c) => c.status === "IN_PROGRESS").length,
    secrets: SECRET_CONFIGS.length,
    secretsWithRotation: SECRET_CONFIGS.filter((s) => s.rotationEnabled).length,
    backupConfigs: BACKUP_CONFIGS.length,
    healthyBackups: BACKUP_CONFIGS.filter((b) => b.status === "HEALTHY").length,
    costPhases: COST_PHASES.length,
    deployments: RECENT_DEPLOYMENTS.length,
    pipelines: PIPELINES.length,
  };
}
