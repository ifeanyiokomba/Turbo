"use client";

// TurboCore — PIDA Admin Tab (Chapter 13: Production Infrastructure & Deployment Architecture)

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Server,
  Globe,
  Cloud,
  Database,
  Lock,
  GitBranch,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  RefreshCw,
  Rocket,
  Shield,
  TrendingUp,
  DollarSign,
  Zap,
  Activity,
  Layers,
  Cpu,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  READY: "bg-emerald-100 text-emerald-700",
  ACTIVE: "bg-emerald-100 text-emerald-700",
  HEALTHY: "bg-emerald-100 text-emerald-700",
  SUCCESS: "bg-emerald-100 text-emerald-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  PLANNED: "bg-blue-100 text-blue-700",
  DEPLOYING: "bg-amber-100 text-amber-700",
  NOT_STARTED: "bg-slate-100 text-slate-500",
  STANDBY: "bg-slate-100 text-slate-500",
  BLOCKED: "bg-rose-100 text-rose-700",
  FAILED: "bg-rose-100 text-rose-700",
  DOWN: "bg-rose-100 text-rose-700",
};

const PHASE_COLORS: Record<number, string> = {
  1: "bg-emerald-100 text-emerald-700",
  2: "bg-amber-100 text-amber-700",
  3: "bg-blue-100 text-blue-700",
};

type SubTab = "overview" | "environments" | "cicd" | "infra" | "regions" | "readiness" | "costs";

export default function PidaTab() {
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [subTab, setSubTab] = React.useState<SubTab>("overview");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pida", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load PIDA data");
        return;
      }
      setData(await res.json());
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  if (loading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  if (!data) return null;

  const s = data.stats;
  const readinessPercent = Math.round((s.readyChecks / s.readinessChecks) * 100);

  const subTabs: Array<{
    id: SubTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: "overview", label: "Overview", icon: Rocket },
    { id: "environments", label: "Environments", icon: Layers },
    { id: "cicd", label: "CI/CD", icon: GitBranch },
    { id: "infra", label: "Infrastructure", icon: Server },
    { id: "regions", label: "Regions", icon: Globe },
    { id: "readiness", label: "Readiness", icon: CheckCircle2 },
    { id: "costs", label: "Costs", icon: DollarSign },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
            <Rocket className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Production Infrastructure</h2>
            <p className="text-muted-foreground text-sm">From MVP to global payment platform.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2">
        {subTabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                subTab === t.id
                  ? "bg-blue-500/10 text-blue-600"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Overview */}
      {subTab === "overview" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-l-4 border-l-emerald-500 p-4">
              <div className="text-2xl font-bold text-emerald-600">{readinessPercent}%</div>
              <div className="text-muted-foreground text-xs">
                Production Ready ({s.readyChecks}/{s.readinessChecks})
              </div>
            </Card>
            <Card className="border-l-4 border-l-blue-500 p-4">
              <div className="text-2xl font-bold text-blue-600">
                {s.healthyComponents}/{s.infraComponents}
              </div>
              <div className="text-muted-foreground text-xs">Infra Components Healthy</div>
            </Card>
            <Card className="border-l-4 border-l-amber-500 p-4">
              <div className="text-2xl font-bold text-amber-600">
                {s.activeRegions}/{s.regions}
              </div>
              <div className="text-muted-foreground text-xs">Regions Active</div>
            </Card>
            <Card className="border-l-4 border-l-violet-500 p-4">
              <div className="text-2xl font-bold text-violet-600">{s.secrets}</div>
              <div className="text-muted-foreground text-xs">Secrets Managed</div>
            </Card>
          </div>

          {/* Architecture diagram */}
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Production Architecture</h3>
            <div className="bg-muted/50 overflow-x-auto rounded-lg p-4 font-mono text-xs leading-relaxed">
              <pre className="whitespace-pre">{`Internet
    ↓
Cloudflare Edge (DNS, CDN, WAF, DDoS, SSL/TLS, Rate Limiting)
    ↓
API Gateway (Cloudflare Workers — Auth, Routing, Validation)
    ↓
┌──────────┬──────────┬──────────┐
│ Identity │ Payment  │ Admin    │
│ Service  │ Core     │ Portal   │
└──────────┴──────────┴──────────┘
    ↓
Event Bus (TEB — Cloudflare Queues → NATS → Kafka)
    ↓
┌──────────┬──────────┬──────────┬──────────┐
│ Ledger   │ Wallet   │ Providers│ Notifications│
└──────────┴──────────┴──────────┴──────────┘
    ↓
PostgreSQL Cluster (Primary + Read + Analytics Replicas)
Redis Cluster (Cache, Sessions, Locks)
Cloudflare R2 (Documents, Receipts, Exports)`}</pre>
            </div>
          </Card>

          {/* DR targets */}
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Shield className="h-4 w-4 text-rose-600" /> Disaster Recovery
            </h3>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <span className="text-muted-foreground text-xs">RPO</span>
                <p className="text-lg font-bold text-emerald-600">{data.drTarget.rpo}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">RTO</span>
                <p className="text-lg font-bold text-emerald-600">{data.drTarget.rto}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Cross-Region Backups</span>
                <p className="text-lg font-bold">{data.drTarget.crossRegionBackups ? "✓" : "✗"}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Tested</span>
                <p className="text-lg font-bold">
                  {data.drTarget.proceduresDocumented ? "✓" : "✗"}
                </p>
              </div>
            </div>
          </Card>

          {/* Backups */}
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Backup Strategy</h3>
            <div className="space-y-1.5">
              {data.backups?.map((b: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="font-medium">{b.component}</span>
                  <Badge variant="outline" className="text-xs">
                    {b.type}
                  </Badge>
                  <span className="text-muted-foreground">{b.frequency}</span>
                  <span className="text-muted-foreground ml-auto">Retention: {b.retention}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Environments */}
      {subTab === "environments" && (
        <div className="space-y-3">
          {/* Promotion pipeline */}
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Promotion Pipeline</h3>
            <div className="bg-muted/50 rounded-lg p-4 font-mono text-xs">
              <pre className="whitespace-pre">
                Development → Sandbox → Integration → UAT → Production
              </pre>
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              No direct deployment from development to production. Every promotion requires
              automated validation.
            </p>
          </Card>

          {data.environments?.map((env: any) => (
            <Card key={env.id} className="p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge className={`text-xs ${STATUS_COLORS[env.status] ?? ""}`}>{env.status}</Badge>
                <span className="font-semibold">{env.name}</span>
                <Badge variant="outline" className="text-xs">
                  {env.region}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {env.replicas} replicas
                </Badge>
                {env.autoScaling && (
                  <Badge variant="outline" className="bg-emerald-50 text-xs">
                    Auto-scaling
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground mb-2 text-xs">{env.description}</p>
              <div className="grid gap-2 text-xs sm:grid-cols-3">
                <div>
                  <span className="text-muted-foreground">URL:</span>{" "}
                  <a href={env.url} className="text-blue-600 hover:underline">
                    {env.url}
                  </a>
                </div>
                <div>
                  <span className="text-muted-foreground">Version:</span>{" "}
                  <span className="font-mono">{env.version}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Last deployed:</span>{" "}
                  {env.lastDeployedAt?.slice(0, 10) ?? "—"}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* CI/CD */}
      {subTab === "cicd" && (
        <div className="space-y-4">
          {data.pipelines?.map((p: any) => (
            <Card key={p.id} className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-blue-600" />
                <span className="font-semibold">{p.name}</span>
                <Badge className={`text-xs ${STATUS_COLORS[p.status] ?? ""}`}>{p.status}</Badge>
                <Badge variant="outline" className="text-xs">
                  {p.trigger}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {p.branch}
                </Badge>
                <span className="text-muted-foreground ml-auto text-xs">{p.duration}s</span>
              </div>
              <div className="space-y-1.5">
                {p.stages?.map((stage: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="bg-muted flex h-5 w-5 items-center justify-center rounded-full font-mono">
                      {i + 1}
                    </span>
                    {stage.status === "SUCCESS" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : stage.status === "FAILED" ? (
                      <XCircle className="h-3.5 w-3.5 text-rose-500" />
                    ) : stage.status === "RUNNING" ? (
                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-slate-400" />
                    )}
                    <span className="font-medium">{stage.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {stage.type}
                    </Badge>
                    <span className="text-muted-foreground ml-auto">{stage.duration}s</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}

          {/* Recent deployments */}
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Recent Deployments</h3>
            <div className="space-y-2">
              {data.deployments?.map((d: any) => (
                <div key={d.id} className="flex items-center gap-2 rounded border p-2 text-xs">
                  <Badge className={`text-xs ${STATUS_COLORS[d.status] ?? ""}`}>{d.status}</Badge>
                  <span className="font-mono font-medium">{d.version}</span>
                  <Badge variant="outline" className="text-xs">
                    {d.environment}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {d.strategy}
                  </Badge>
                  {d.strategy === "CANARY" && (
                    <Badge variant="outline" className="bg-amber-50 text-xs">
                      {d.canaryPercent}%
                    </Badge>
                  )}
                  <span className="text-muted-foreground ml-auto">{d.commitHash}</span>
                  {d.smokeTestsPassed && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Infrastructure */}
      {subTab === "infra" && (
        <div className="space-y-3">
          {data.infraComponents?.map((c: any) => (
            <Card key={c.id} className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`text-xs ${STATUS_COLORS[c.status] ?? ""}`}>{c.status}</Badge>
                <Badge variant="outline" className={`text-xs ${PHASE_COLORS[c.phase] ?? ""}`}>
                  Phase {c.phase}
                </Badge>
                <span className="text-sm font-medium">{c.name}</span>
                <Badge variant="outline" className="text-xs">
                  {c.provider}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {c.region}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">{c.description}</p>
            </Card>
          ))}

          {/* Autoscaling */}
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 text-blue-600" /> Autoscaling Rules
            </h3>
            <div className="space-y-1.5">
              {data.autoscalingRules?.map((r: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="font-medium">{r.metric}</span>
                  <span className="text-muted-foreground">
                    {r.operator} {r.threshold}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {r.action}
                  </Badge>
                  <span className="text-muted-foreground ml-auto">
                    Min: {r.minReplicas} / Max: {r.maxReplicas}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Secrets */}
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Lock className="h-4 w-4 text-amber-600" /> Secret Management
            </h3>
            <div className="space-y-1.5">
              {data.secrets?.map((sec: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <Lock className="text-muted-foreground h-3.5 w-3.5" />
                  <span className="font-mono font-medium">{sec.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {sec.storedIn}
                  </Badge>
                  {sec.rotationEnabled ? (
                    <Badge variant="outline" className="bg-emerald-50 text-xs">
                      Rotation ON
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-rose-50 text-xs">
                      Rotation OFF
                    </Badge>
                  )}
                  <span className="text-muted-foreground ml-auto">
                    {sec.lastRotatedAt
                      ? `Rotated: ${sec.lastRotatedAt.slice(0, 10)}`
                      : "Never rotated"}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Regions */}
      {subTab === "regions" && (
        <div className="space-y-3">
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Multi-Region Strategy</h3>
            <div className="bg-muted/50 rounded-lg p-4 font-mono text-xs">
              <pre className="whitespace-pre">{`Phase 1: Europe (Primary) → serves all countries
Phase 2: Europe + Africa South (Lagos) + Africa East (Nairobi)
Phase 3: + Middle East + Asia → global active-active

Traffic routed to nearest healthy region.
Provider adapters are region-aware (M-Pesa → Kenya, Paystack → Nigeria).`}</pre>
            </div>
          </Card>
          {data.regions?.map((r: any) => (
            <Card key={r.id} className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`text-xs ${STATUS_COLORS[r.status] ?? ""}`}>{r.status}</Badge>
                <Globe className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium">{r.name}</span>
                <span className="text-muted-foreground ml-auto text-xs">
                  {r.latencyMs}ms latency
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Countries:</span>
                <div className="flex gap-1">
                  {r.countries.map((c: string) => (
                    <Badge key={c} variant="outline" className="text-xs">
                      {c}
                    </Badge>
                  ))}
                </div>
                <span className="text-muted-foreground ml-auto">Primary: {r.primaryProvider}</span>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">{r.dataResidency}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Readiness */}
      {subTab === "readiness" && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center gap-4">
              <div className="relative flex h-20 w-20 items-center justify-center">
                <svg className="h-20 w-20 -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-muted"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeDasharray={`${2 * Math.PI * 42 * (readinessPercent / 100)} ${2 * Math.PI * 42}`}
                    className="text-emerald-500 transition-all duration-1000"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute text-xl font-bold">{readinessPercent}%</div>
              </div>
              <div>
                <h3 className="text-lg font-semibold">Production Readiness</h3>
                <p className="text-muted-foreground text-sm">
                  {s.readyChecks} of {s.readinessChecks} checks ready
                </p>
                <div className="mt-1 flex gap-2">
                  <Badge className="bg-emerald-100 text-xs text-emerald-700">
                    {s.readyChecks} READY
                  </Badge>
                  <Badge className="bg-amber-100 text-xs text-amber-700">
                    {s.inProgressChecks} IN PROGRESS
                  </Badge>
                </div>
              </div>
            </div>
          </Card>
          <div className="space-y-2">
            {data.readinessChecks?.map((c: any) => (
              <Card key={c.id} className="p-3">
                <div className="flex items-center gap-2">
                  {c.status === "READY" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : c.status === "IN_PROGRESS" ? (
                    <Clock className="h-4 w-4 text-amber-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-500" />
                  )}
                  <Badge className={`text-xs ${STATUS_COLORS[c.status] ?? ""}`}>{c.status}</Badge>
                  <span className="flex-1 text-sm font-medium">{c.check}</span>
                  <Badge variant="outline" className="text-xs">
                    {c.category}
                  </Badge>
                </div>
                {c.evidence && (
                  <p className="text-muted-foreground mt-1 ml-6 text-xs">{c.evidence}</p>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Costs */}
      {subTab === "costs" && (
        <div className="space-y-3">
          {data.costPhases?.map((p: any) => (
            <Card key={p.phase} className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-600" />
                <span className="font-semibold">{p.phase}</span>
                <Badge variant="outline" className="ml-auto text-xs">
                  {p.monthlyEstimate}
                </Badge>
              </div>
              <p className="text-muted-foreground mb-2 text-xs">{p.description}</p>
              <div className="mb-1 text-xs font-medium">Capacity: {p.transactionCapacity}</div>
              <div className="space-y-1">
                {p.components.map((c: string, i: number) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" /> {c}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
