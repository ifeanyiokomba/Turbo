"use client";

// TurboCore — PRGLF Admin Tab (Chapter 15: Production Readiness, Governance & Launch Framework)
//
// "Software reaches production. Platforms stay in production."

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Rocket,
  Shield,
  Users,
  GitBranch,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  TrendingUp,
  Globe,
  ChevronDown,
  ChevronRight,
  Building2,
  Scale,
  Cpu,
  Activity,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  DONE: "bg-emerald-100 text-emerald-700",
  DEPLOYED: "bg-emerald-100 text-emerald-700",
  ACCEPTED: "bg-emerald-100 text-emerald-700",
  ESTABLISHED: "bg-emerald-100 text-emerald-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CERTIFIED: "bg-emerald-100 text-emerald-700",
  GOOD: "bg-emerald-100 text-emerald-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  PLANNED: "bg-blue-100 text-blue-700",
  UPCOMING: "bg-blue-100 text-blue-700",
  PENDING: "bg-amber-100 text-amber-700",
  WARNING: "bg-amber-100 text-amber-700",
  NOT_STARTED: "bg-slate-100 text-slate-500",
  BLOCKED: "bg-rose-100 text-rose-700",
  CRITICAL: "bg-rose-100 text-rose-700",
  CURRENT: "bg-emerald-100 text-emerald-700",
  NEXT: "bg-blue-100 text-blue-700",
  FUTURE: "bg-slate-100 text-slate-500",
  VACANT: "bg-rose-100 text-rose-700",
};

const CATEGORY_COLORS: Record<string, string> = {
  TECHNICAL: "bg-blue-100 text-blue-700",
  SECURITY: "bg-rose-100 text-rose-700",
  OPERATIONS: "bg-amber-100 text-amber-700",
  BUSINESS: "bg-emerald-100 text-emerald-700",
  COMPLIANCE: "bg-fuchsia-100 text-fuchsia-700",
};

type SubTab = "overview" | "launch" | "governance" | "executive" | "roadmap";

export default function PrglfTab() {
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [subTab, setSubTab] = React.useState<SubTab>("overview");
  const [expandedAdr, setExpandedAdr] = React.useState<string | null>(null);
  const [expandedIncident, setExpandedIncident] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/prglf", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load governance data");
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

  const subTabs: Array<{
    id: SubTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: "overview", label: "Overview", icon: Rocket },
    { id: "launch", label: "Launch Checklist", icon: CheckCircle2 },
    { id: "governance", label: "Governance", icon: Scale },
    { id: "executive", label: "Executive", icon: TrendingUp },
    { id: "roadmap", label: "Roadmap", icon: Globe },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10">
            <Rocket className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Governance &amp; Launch</h2>
            <p className="text-muted-foreground text-sm">
              How we operate TurboCore for the next 10 years.
            </p>
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
                  ? "bg-violet-500/10 text-violet-600"
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
              <div className="text-2xl font-bold text-emerald-600">{s.launchReadiness}%</div>
              <div className="text-muted-foreground text-xs">
                Launch Readiness ({s.launchChecklistDone}/{s.launchChecklistTotal})
              </div>
            </Card>
            <Card className="border-l-4 border-l-blue-500 p-4">
              <div className="text-2xl font-bold text-blue-600">{s.acceptedAdrs}</div>
              <div className="text-muted-foreground text-xs">Architecture Decisions (ADRs)</div>
            </Card>
            <Card className="border-l-4 border-l-amber-500 p-4">
              <div className="text-2xl font-bold text-amber-600">{s.domainOwnership}</div>
              <div className="text-muted-foreground text-xs">Domains with Owners</div>
            </Card>
            <Card className="border-l-4 border-l-violet-500 p-4">
              <div className="text-2xl font-bold text-violet-600">{s.evolutionStages}</div>
              <div className="text-muted-foreground text-xs">Evolution Stages</div>
            </Card>
          </div>

          {/* Operating model */}
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">TurboCore Operating Model</h3>
            <div className="bg-muted/50 rounded-lg p-4 font-mono text-xs leading-relaxed">
              <pre className="whitespace-pre">{`Platform Governance → Engineering → Security → Operations
→ Compliance → Finance → Support → Customers

Every function has clearly defined responsibilities.`}</pre>
            </div>
          </Card>

          {/* Domain ownership */}
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-blue-600" /> Platform Ownership
            </h3>
            <div className="space-y-1.5">
              {data.domainOwnership?.map((d: any) => (
                <div key={d.domain} className="flex items-center gap-2 text-xs">
                  <Badge className={`text-xs ${STATUS_COLORS[d.status] ?? ""}`}>{d.status}</Badge>
                  <span className="w-32 shrink-0 font-medium">{d.domain}</span>
                  <span className="text-muted-foreground flex-1 truncate">{d.owner}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Post-launch strategy */}
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Post-Launch Strategy (First 90 Days)</h3>
            <div className="space-y-2">
              {data.postLaunchPhases?.map((p: any) => (
                <div
                  key={p.phase}
                  className={`rounded-lg border p-3 ${p.status === "CURRENT" ? "border-emerald-500/40 bg-emerald-500/5" : ""}`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <Badge className={`text-xs ${STATUS_COLORS[p.status] ?? ""}`}>{p.status}</Badge>
                    <span className="text-sm font-medium">{p.phase}</span>
                    <span className="text-muted-foreground ml-auto text-xs">{p.days}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.priorities?.map((pri: string) => (
                      <Badge key={pri} variant="outline" className="text-xs">
                        {pri}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* AI governance */}
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Cpu className="h-4 w-4 text-violet-600" /> AI Governance
            </h3>
            <div className="space-y-1.5">
              {data.aiGovernanceRules?.map((r: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {r.enforced ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-rose-500" />
                  )}
                  <span className="font-medium">{r.rule}</span>
                  <span className="text-muted-foreground flex-1 truncate">{r.description}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Launch Checklist */}
      {subTab === "launch" && (
        <div className="space-y-3">
          <Card
            className={`p-4 ${s.launchReadiness >= 90 ? "border-l-4 border-l-emerald-500" : "border-l-4 border-l-amber-500"}`}
          >
            <div className="flex items-center gap-2">
              {s.launchReadiness >= 90 ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              ) : (
                <Clock className="h-6 w-6 text-amber-500" />
              )}
              <div>
                <h3 className="text-lg font-semibold">{s.launchReadiness}% Ready for Launch</h3>
                <p className="text-muted-foreground text-xs">
                  {s.launchChecklistDone}/{s.launchChecklistTotal} checks completed
                </p>
              </div>
            </div>
          </Card>
          {data.launchChecklist?.map((c: any) => (
            <Card key={c.id} className="p-3">
              <div className="flex items-center gap-2">
                {c.status === "DONE" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : c.status === "IN_PROGRESS" ? (
                  <Clock className="h-4 w-4 text-amber-500" />
                ) : c.status === "BLOCKED" ? (
                  <XCircle className="h-4 w-4 text-rose-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-slate-400" />
                )}
                <Badge className={`text-xs ${STATUS_COLORS[c.status] ?? ""}`}>{c.status}</Badge>
                <Badge variant="outline" className={`text-xs ${CATEGORY_COLORS[c.category] ?? ""}`}>
                  {c.category}
                </Badge>
                <span className="flex-1 text-sm font-medium">{c.check}</span>
              </div>
              {c.evidence && <p className="mt-1 ml-6 text-xs text-emerald-600">✓ {c.evidence}</p>}
            </Card>
          ))}
        </div>
      )}

      {/* Governance */}
      {subTab === "governance" && (
        <div className="space-y-4">
          {/* ADRs */}
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4 text-blue-600" /> Architecture Decision Records (
              {data.adrs?.length})
            </h3>
            <div className="space-y-2">
              {data.adrs?.map((adr: any) => {
                const expanded = expandedAdr === adr.id;
                return (
                  <div key={adr.id} className="rounded border p-2">
                    <div
                      className="flex cursor-pointer items-center gap-2"
                      onClick={() => setExpandedAdr(expanded ? null : adr.id)}
                    >
                      {expanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <Badge className={`text-xs ${STATUS_COLORS[adr.status] ?? ""}`}>
                        {adr.status}
                      </Badge>
                      <span className="font-mono text-xs">{adr.id}</span>
                      <span className="flex-1 text-sm font-medium">{adr.title}</span>
                      <span className="text-muted-foreground text-xs">{adr.date}</span>
                    </div>
                    {expanded && (
                      <div className="mt-2 ml-6 space-y-1 text-xs">
                        <div>
                          <span className="text-muted-foreground">Decision:</span> {adr.decision}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Reason:</span> {adr.reason}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Alternatives:</span>{" "}
                          {adr.alternatives.join(", ")}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Approved by:</span>{" "}
                          {adr.approvedBy}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Change management */}
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <GitBranch className="h-4 w-4 text-amber-600" /> Change Management (
              {data.changes?.length})
            </h3>
            <div className="space-y-1.5">
              {data.changes?.map((c: any) => (
                <div key={c.id} className="flex items-center gap-2 rounded border p-2 text-xs">
                  <Badge className={`text-xs ${STATUS_COLORS[c.status] ?? ""}`}>{c.status}</Badge>
                  <Badge variant="outline" className="text-xs">
                    {c.type}
                  </Badge>
                  <span className="font-mono">{c.id}</span>
                  <span className="flex-1 truncate font-medium">{c.title}</span>
                  <Badge
                    variant="outline"
                    className={`text-xs ${c.riskLevel === "HIGH" || c.riskLevel === "CRITICAL" ? "bg-rose-50" : c.riskLevel === "MEDIUM" ? "bg-amber-50" : "bg-emerald-50"}`}
                  >
                    {c.riskLevel}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          {/* Incident governance */}
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-rose-600" /> Incident Governance (
              {data.incidents?.length})
            </h3>
            {data.incidents?.map((inc: any) => {
              const expanded = expandedIncident === inc.id;
              return (
                <div key={inc.id} className="mb-2 rounded border p-2">
                  <div
                    className="flex cursor-pointer items-center gap-2"
                    onClick={() => setExpandedIncident(expanded ? null : inc.id)}
                  >
                    {expanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <Badge className={`text-xs ${STATUS_COLORS[inc.status] ?? ""}`}>
                      {inc.status}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-xs ${inc.severity === "CRITICAL" || inc.severity === "HIGH" ? "bg-rose-50" : "bg-amber-50"}`}
                    >
                      {inc.severity}
                    </Badge>
                    <span className="flex-1 text-sm font-medium">{inc.title}</span>
                  </div>
                  {expanded && (
                    <div className="mt-2 ml-6 space-y-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Impact:</span> {inc.impact}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Root cause:</span> {inc.rootCause}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Resolution:</span> {inc.resolution}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Customer impact:</span>{" "}
                        {inc.customerImpact}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Lessons:</span>
                        <ul className="mt-1 ml-4">
                          {inc.lessonsLearned?.map((l: string, i: number) => (
                            <li key={i}>• {l}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Action items:</span>
                        <div className="mt-1 space-y-0.5">
                          {inc.actionItems?.map((a: any, i: number) => (
                            <div key={i} className="flex gap-2">
                              <Badge variant="outline" className="text-xs">
                                {a.status}
                              </Badge>
                              <span className="flex-1">{a.item}</span>
                              <span className="text-muted-foreground">{a.owner}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </Card>

          {/* Regulatory governance */}
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Scale className="h-4 w-4 text-fuchsia-600" /> Regulatory Registers
            </h3>
            <div className="space-y-1.5">
              {data.regulatoryRegisters?.map((r: any) => (
                <div key={r.country} className="rounded border p-2">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge className={`text-xs ${STATUS_COLORS[r.status] ?? ""}`}>{r.status}</Badge>
                    <span className="text-sm font-medium">{r.country}</span>
                  </div>
                  <div className="text-muted-foreground grid gap-1 text-xs sm:grid-cols-2">
                    <div>
                      <span className="font-medium">Licensing:</span> {r.licensing}
                    </div>
                    <div>
                      <span className="font-medium">Reporting:</span> {r.reporting}
                    </div>
                    <div>
                      <span className="font-medium">Retention:</span> {r.retention}
                    </div>
                    <div>
                      <span className="font-medium">KYC:</span> {r.kyc}
                    </div>
                    <div>
                      <span className="font-medium">AML:</span> {r.aml}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Provider governance */}
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Building2 className="h-4 w-4 text-cyan-600" /> Provider Governance
            </h3>
            <div className="space-y-1.5">
              {data.providerGovernance?.map((p: any) => (
                <div
                  key={p.providerCode}
                  className="flex items-center gap-2 rounded border p-2 text-xs"
                >
                  <Badge className={`text-xs ${STATUS_COLORS[p.operationalStatus] ?? ""}`}>
                    {p.operationalStatus}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {p.certificationStatus}
                  </Badge>
                  <span className="font-medium">{p.displayName}</span>
                  <span className="text-muted-foreground ml-auto">
                    Business: {p.businessOwner} · Tech: {p.technicalOwner}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Executive Dashboard */}
      {subTab === "executive" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <div className="mb-1 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                <span className="text-muted-foreground text-xs">Gross Payment Volume</span>
              </div>
              <div className="text-2xl font-bold">
                ₦{(data.executiveDashboard?.grossPaymentVolume ?? 0).toLocaleString()}
              </div>
            </Card>
            <Card className="p-4">
              <div className="mb-1 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-blue-600" />
                <span className="text-muted-foreground text-xs">Net Revenue</span>
              </div>
              <div className="text-2xl font-bold">
                ₦{(data.executiveDashboard?.netRevenue ?? 0).toLocaleString()}
              </div>
            </Card>
            <Card className="p-4">
              <div className="mb-1 flex items-center gap-2">
                <Users className="h-4 w-4 text-violet-600" />
                <span className="text-muted-foreground text-xs">Active Customers</span>
              </div>
              <div className="text-2xl font-bold">
                {data.executiveDashboard?.activeCustomers ?? 0}
              </div>
            </Card>
            <Card className="p-4">
              <div className="mb-1 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-amber-600" />
                <span className="text-muted-foreground text-xs">Active Merchants</span>
              </div>
              <div className="text-2xl font-bold">
                {data.executiveDashboard?.activeMerchants ?? 0}
              </div>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold">Provider Distribution</h3>
              <div className="space-y-2">
                {data.executiveDashboard?.providerDistribution?.map((p: any) => (
                  <div key={p.provider} className="flex items-center gap-2 text-xs">
                    <span className="w-24 font-medium">{p.provider}</span>
                    <div className="bg-muted h-5 flex-1 overflow-hidden rounded-full">
                      <div className="h-full bg-blue-500" style={{ width: `${p.percentage}%` }} />
                    </div>
                    <span className="w-8 text-right font-mono">{p.percentage}%</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold">Geographic Growth</h3>
              <div className="space-y-2">
                {data.executiveDashboard?.geographicGrowth?.map((g: any) => (
                  <div key={g.country} className="flex items-center gap-2 text-xs">
                    <Globe className="h-4 w-4 text-emerald-500" />
                    <span className="font-medium">{g.country}</span>
                    <span className="ml-auto font-bold text-emerald-600">+{g.growth}%</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Operational metrics */}
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Operational Metrics</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.operationalMetrics?.map((m: any) => (
                <div key={m.name} className="rounded-lg border p-3">
                  <div className="flex items-center gap-1.5">
                    <Badge className={`text-xs ${STATUS_COLORS[m.status] ?? ""}`}>{m.status}</Badge>
                    {m.trend === "UP" && <TrendingUp className="h-3 w-3 text-emerald-500" />}
                  </div>
                  <div className="mt-1 text-lg font-bold">
                    {m.value}
                    {m.unit}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {m.name} (target: {m.target}
                    {m.unit})
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-4 text-center">
              <Activity className="mx-auto mb-1 h-8 w-8 text-emerald-500" />
              <div className="text-3xl font-bold text-emerald-600">
                {data.executiveDashboard?.platformAvailability}%
              </div>
              <div className="text-muted-foreground text-xs">Platform Availability</div>
            </Card>
            <Card className="p-4 text-center">
              <CheckCircle2 className="mx-auto mb-1 h-8 w-8 text-emerald-500" />
              <div className="text-3xl font-bold text-emerald-600">
                {data.executiveDashboard?.settlementPerformance}%
              </div>
              <div className="text-muted-foreground text-xs">Settlement Performance</div>
            </Card>
          </div>
        </div>
      )}

      {/* Roadmap */}
      {subTab === "roadmap" && (
        <div className="space-y-3">
          {data.evolutionStages?.map((stage: any) => (
            <Card
              key={stage.stage}
              className={`p-4 ${stage.status === "CURRENT" ? "border-l-4 border-l-emerald-500" : stage.status === "NEXT" ? "border-l-4 border-l-blue-500" : ""}`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge className={`text-xs ${STATUS_COLORS[stage.status] ?? ""}`}>
                  {stage.status}
                </Badge>
                <span className="text-lg font-bold">{stage.stage}</span>
                <Badge variant="outline" className="ml-auto text-xs">
                  {stage.timeline}
                </Badge>
              </div>
              <p className="text-muted-foreground mb-2 text-sm">{stage.description}</p>
              <div className="flex flex-wrap gap-1">
                {stage.capabilities?.map((c: string) => (
                  <Badge key={c} variant="outline" className="text-xs">
                    {c}
                  </Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Need to import DollarSign since it's used in the executive tab
import { DollarSign } from "lucide-react";
