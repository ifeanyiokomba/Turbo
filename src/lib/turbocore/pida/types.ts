// TurboCore — PIDA Types (Chapter 13: Production Infrastructure & Deployment Architecture)
//
// "Infrastructure must be immutable, automated, observable, repeatable, secure,
//  region-aware, provider-aware."

// ---------------------------------------------------------------------------
// Environments (Chapter 13 — promotion pipeline)
// ---------------------------------------------------------------------------

export type Environment = "DEVELOPMENT" | "SANDBOX" | "INTEGRATION" | "UAT" | "PRODUCTION";

export interface EnvironmentConfig {
  id: Environment;
  name: string;
  description: string;
  url: string;
  status: "ACTIVE" | "INACTIVE" | "MAINTENANCE";
  databaseUrl: string; // masked
  redisUrl: string; // masked
  region: string;
  replicas: number;
  autoScaling: boolean;
  lastDeployedAt: string | null;
  deployedBy: string | null;
  version: string | null;
}

// ---------------------------------------------------------------------------
// Deployment strategies (Chapter 13)
// ---------------------------------------------------------------------------

export type DeploymentStrategy = "BLUE_GREEN" | "CANARY" | "ROLLING" | "RECREATE";

export interface DeploymentRecord {
  id: string;
  version: string;
  environment: Environment;
  strategy: DeploymentStrategy;
  status:
    "PENDING" | "BUILDING" | "DEPLOYING" | "SMOKE_TESTING" | "SUCCESS" | "FAILED" | "ROLLED_BACK";
  startedAt: string;
  completedAt: string | null;
  deployedBy: string;
  commitHash: string;
  canaryPercent: number; // 0, 5, 20, 50, 100 for canary; 100 for blue-green
  smokeTestsPassed: boolean;
  rollbackReason?: string;
}

// ---------------------------------------------------------------------------
// CI/CD Pipeline (Chapter 13)
// ---------------------------------------------------------------------------

export interface CICDPipeline {
  id: string;
  name: string;
  trigger: "PUSH" | "PR" | "MANUAL" | "SCHEDULED";
  branch: string;
  stages: PipelineStage[];
  status: "IDLE" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED";
  lastRun: string | null;
  duration: number | null; // seconds
}

export interface PipelineStage {
  name: string;
  type:
    "TEST" | "LINT" | "SECURITY_SCAN" | "BUILD" | "CONTAINER" | "DEPLOY" | "SMOKE_TEST" | "MONITOR";
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";
  duration: number | null; // seconds
  startedAt: string | null;
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Infrastructure components (Chapter 13)
// ---------------------------------------------------------------------------

export type InfraComponentType =
  | "EDGE"
  | "FRONTEND"
  | "API_GATEWAY"
  | "BACKEND_SERVICE"
  | "DATABASE"
  | "REDIS"
  | "OBJECT_STORAGE"
  | "EVENT_QUEUE"
  | "SEARCH"
  | "MONITORING"
  | "CONTAINER_PLATFORM";

export interface InfraComponent {
  id: string;
  name: string;
  type: InfraComponentType;
  provider: string; // "Cloudflare" | "PostgreSQL" | "Redis" | etc.
  status: "HEALTHY" | "DEGRADED" | "DOWN" | "PLANNED";
  region: string;
  phase: 1 | 2 | 3; // MVP, African Scale, Global Scale
  description: string;
  config: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Multi-region (Chapter 13)
// ---------------------------------------------------------------------------

export interface RegionConfig {
  id: string;
  name: string;
  countries: string[];
  status: "ACTIVE" | "PLANNED" | "STANDBY";
  primaryProvider: string;
  latencyMs: number;
  dataResidency: string;
}

// ---------------------------------------------------------------------------
// Backup & DR (Chapter 13)
// ---------------------------------------------------------------------------

export interface BackupConfig {
  component: string;
  type: "WAL_ARCHIVING" | "DAILY_BACKUP" | "WEEKLY_SNAPSHOT" | "MONTHLY_ARCHIVE";
  frequency: string;
  retention: string;
  lastBackupAt: string | null;
  status: "HEALTHY" | "STALE" | "FAILED";
}

export interface DRTarget {
  rpo: string; // Recovery Point Objective
  rto: string; // Recovery Time Objective
  crossRegionBackups: boolean;
  testedAt: string | null;
  proceduresDocumented: boolean;
}

// ---------------------------------------------------------------------------
// Production readiness checklist (Chapter 13)
// ---------------------------------------------------------------------------

export interface ReadinessCheck {
  id: string;
  category: string;
  check: string;
  status: "READY" | "IN_PROGRESS" | "NOT_STARTED" | "BLOCKED";
  evidence?: string;
  owner: string;
}

// ---------------------------------------------------------------------------
// Autoscaling (Chapter 13)
// ---------------------------------------------------------------------------

export interface AutoscalingRule {
  metric: string;
  threshold: number;
  operator: "GT" | "LT";
  action: "SCALE_UP" | "SCALE_DOWN";
  minReplicas: number;
  maxReplicas: number;
}

// ---------------------------------------------------------------------------
// Secret management (Chapter 13)
// ---------------------------------------------------------------------------

export interface SecretConfig {
  name: string;
  type:
    | "DATABASE_URL"
    | "REDIS_URL"
    | "JWT_SECRET"
    | "PROVIDER_KEY"
    | "ENCRYPTION_KEY"
    | "WEBHOOK_SECRET";
  storedIn: string; // "Cloudflare Secrets" | "AWS Secrets Manager" | etc.
  rotationEnabled: boolean;
  lastRotatedAt: string | null;
  environments: Environment[];
}

// ---------------------------------------------------------------------------
// Cost optimization phases (Chapter 13)
// ---------------------------------------------------------------------------

export interface CostPhase {
  phase: string;
  description: string;
  monthlyEstimate: string;
  components: string[];
  transactionCapacity: string;
}
