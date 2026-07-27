"use client";

// TurboCore — OMO Admin Tab (Chapter 12: Observability, Monitoring & Operations)
//
// The 5 pillars: Logs, Metrics, Tracing, Health Monitoring, Alerting.
// Plus: SLI/SLO, Incident Management, Business/Fraud/Reconciliation/Audit dashboards, OIE.

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Bug,
  CheckCircle2,
  Cpu,
  DollarSign,
  Eye,
  FileText,
  Gauge,
  Globe,
  Loader2,
  Network,
  RefreshCw,
  Shield,
  TrendingUp,
  Zap,
  XCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  MET: "bg-emerald-100 text-emerald-700",
  AT_RISK: "bg-amber-100 text-amber-700",
  BREACHED: "bg-rose-100 text-rose-700",
  HEALTHY: "bg-emerald-100 text-emerald-700",
  DEGRADED: "bg-amber-100 text-amber-700",
  DOWN: "bg-rose-100 text-rose-700",
  FIRING: "bg-rose-100 text-rose-700",
  ACKNOWLEDGED: "bg-amber-100 text-amber-700",
  RESOLVED: "bg-emerald-100 text-emerald-700",
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-rose-100 text-rose-700 border-rose-300",
  HIGH: "bg-amber-100 text-amber-700 border-amber-300",
  MEDIUM: "bg-blue-100 text-blue-700 border-blue-300",
  LOW: "bg-slate-100 text-slate-700 border-slate-300",
  INFO: "bg-slate-100 text-slate-700 border-slate-300",
};

const LOG_COLORS: Record<string, string> = {
  TRACE: "text-slate-400",
  DEBUG: "text-slate-500",
  INFO: "text-blue-500",
  WARN: "text-amber-500",
  ERROR: "text-rose-500",
  FATAL: "text-rose-700 font-bold",
};

type SubTab = "overview" | "health" | "alerts" | "dashboards" | "logs" | "oie";

export default function OmoTab() {
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [subTab, setSubTab] = React.useState<SubTab>("overview");
  const [expandedIncident, setExpandedIncident] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/omo", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load observability data");
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
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  if (!data) return null;

  const subTabs: Array<{
    id: SubTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "health", label: "Health", icon: Gauge },
    { id: "alerts", label: "Alerts", icon: Bell },
    { id: "dashboards", label: "Dashboards", icon: BarChart3 },
    { id: "logs", label: "Logs", icon: FileText },
    { id: "oie", label: "OIE", icon: Zap },
  ];

  const firingAlerts = data.alerts?.filter((a: any) => a.status === "FIRING") ?? [];
  const activeIncidents =
    data.incidents?.filter((i: any) => i.status !== "RESOLVED" && i.status !== "POSTMORTEM") ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
            <Activity className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Observability &amp; Operations</h2>
            <p className="text-muted-foreground text-sm">Know before your customers do.</p>
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
          const badge = t.id === "alerts" && firingAlerts.length > 0 ? firingAlerts.length : 0;
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
              {badge > 0 && (
                <Badge variant="destructive" className="ml-1 text-xs">
                  {badge}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Overview */}
      {subTab === "overview" && (
        <div className="space-y-4">
          {/* Top stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-l-4 border-l-emerald-500 p-4">
              <div className="mb-1 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-muted-foreground text-xs">SLOs Met</span>
              </div>
              <div className="text-2xl font-bold text-emerald-600">
                {data.slos?.filter((s: any) => s.status === "MET").length ?? 0}/
                {data.slos?.length ?? 0}
              </div>
            </Card>
            <Card className="border-l-4 border-l-rose-500 p-4">
              <div className="mb-1 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-500" />
                <span className="text-muted-foreground text-xs">Firing Alerts</span>
              </div>
              <div className="text-2xl font-bold text-rose-600">{firingAlerts.length}</div>
            </Card>
            <Card className="border-l-4 border-l-amber-500 p-4">
              <div className="mb-1 flex items-center gap-2">
                <Bug className="h-4 w-4 text-amber-500" />
                <span className="text-muted-foreground text-xs">Active Incidents</span>
              </div>
              <div className="text-2xl font-bold text-amber-600">{activeIncidents.length}</div>
            </Card>
            <Card className="border-l-4 border-l-blue-500 p-4">
              <div className="mb-1 flex items-center gap-2">
                <Gauge className="h-4 w-4 text-blue-500" />
                <span className="text-muted-foreground text-xs">Providers Healthy</span>
              </div>
              <div className="text-2xl font-bold text-blue-600">
                {data.providerHealth?.filter((p: any) => p.status === "HEALTHY").length ?? 0}/
                {data.providerHealth?.length ?? 0}
              </div>
            </Card>
          </div>

          {/* Operational KPIs */}
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Operational KPIs</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="text-center">
                <div className="text-lg font-bold">{data.kpis?.mttd}m</div>
                <div className="text-muted-foreground text-xs">MTTD</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold">{data.kpis?.mtta}m</div>
                <div className="text-muted-foreground text-xs">MTTA</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold">{data.kpis?.mttr}m</div>
                <div className="text-muted-foreground text-xs">MTTR</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold">{data.kpis?.changeFailureRate}%</div>
                <div className="text-muted-foreground text-xs">Change Failure</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold">{data.kpis?.deploymentFrequency}/wk</div>
                <div className="text-muted-foreground text-xs">Deploy Freq</div>
              </div>
            </div>
          </Card>

          {/* SLI/SLO summary */}
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">SLI / SLO Status</h3>
            <div className="space-y-2">
              {data.slos?.map((slo: any) => (
                <div key={slo.name} className="flex items-center gap-2 text-sm">
                  <Badge className={`text-xs ${STATUS_COLORS[slo.status] ?? ""}`}>
                    {slo.status}
                  </Badge>
                  <span className="flex-1 font-medium">{slo.name}</span>
                  <span className="text-muted-foreground">
                    {slo.current}% / {slo.target}%
                  </span>
                  <div className="bg-muted h-2 w-24 overflow-hidden rounded-full">
                    <div
                      className={`h-full ${slo.status === "MET" ? "bg-emerald-500" : slo.status === "AT_RISK" ? "bg-amber-500" : "bg-rose-500"}`}
                      style={{ width: `${Math.min((slo.current / slo.target) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* 5 Pillars diagram */}
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">The Five Pillars of Observability</h3>
            <div className="bg-muted/50 rounded-lg p-4 font-mono text-xs leading-relaxed">
              <pre className="whitespace-pre">{`Logs (structured, correlated)
    ↓
Metrics (counters, gauges, timers)
    ↓
Tracing (distributed, end-to-end)
    ↓
Health Monitoring (provider + service)
    ↓
Alerting (actionable, trend-based)

→ Dashboards (Business, Fraud, Reconciliation, Audit)
→ Incident Management (detected → resolved → postmortem)
→ OIE (Operations Intelligence Engine — anomaly detection)`}</pre>
            </div>
          </Card>
        </div>
      )}

      {/* Health */}
      {subTab === "health" && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Provider Health Dashboard</h3>
          {data.providerHealth?.map((p: any) => (
            <Card key={p.providerCode} className="p-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className={`text-xs ${STATUS_COLORS[p.status] ?? ""}`}>{p.status}</Badge>
                <span className="text-sm font-medium">{p.displayName}</span>
                <Badge variant="outline" className="text-xs">
                  {p.country}
                </Badge>
                <div className="ml-auto flex gap-3 text-xs">
                  <span>
                    <span className="text-muted-foreground">Score:</span>{" "}
                    <span className="font-bold">{p.healthScore}</span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">Success:</span>{" "}
                    <span className="font-bold">{p.successRate}%</span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">Latency:</span>{" "}
                    <span className="font-bold">{p.latencyMs}ms</span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">Circuit:</span>{" "}
                    <span className="font-bold">{p.circuitState}</span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">Settle:</span>{" "}
                    <span className="font-bold">{p.settlementTime}</span>
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Alerts + Incidents */}
      {subTab === "alerts" && (
        <div className="space-y-4">
          <div>
            <h3 className="mb-3 text-lg font-semibold">Alerts ({data.alerts?.length ?? 0})</h3>
            <div className="space-y-2">
              {data.alerts?.map((a: any) => (
                <Card key={a.id} className="p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-xs ${SEVERITY_COLORS[a.severity] ?? ""}`}
                    >
                      {a.severity}
                    </Badge>
                    <Badge className={`text-xs ${STATUS_COLORS[a.status] ?? ""}`}>{a.status}</Badge>
                    <span className="flex-1 text-sm font-medium">{a.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {a.currentValue}% / {a.threshold}%
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">{a.description}</p>
                </Card>
              ))}
            </div>
          </div>
          <Separator />
          <div>
            <h3 className="mb-3 text-lg font-semibold">
              Incidents ({data.incidents?.length ?? 0})
            </h3>
            <div className="space-y-2">
              {data.incidents?.map((inc: any) => {
                const expanded = expandedIncident === inc.id;
                return (
                  <Card key={inc.id} className="p-3">
                    <div
                      className="flex cursor-pointer items-center gap-2"
                      onClick={() => setExpandedIncident(expanded ? null : inc.id)}
                    >
                      {expanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <Badge
                        variant="outline"
                        className={`text-xs ${SEVERITY_COLORS[inc.severity] ?? ""}`}
                      >
                        {inc.severity}
                      </Badge>
                      <Badge className={`text-xs ${STATUS_COLORS[inc.status] ?? ""}`}>
                        {inc.status}
                      </Badge>
                      <span className="flex-1 text-sm font-medium">{inc.title}</span>
                    </div>
                    {expanded && (
                      <div className="mt-3 ml-6 space-y-2">
                        <p className="text-muted-foreground text-xs">{inc.description}</p>
                        <div className="flex flex-wrap gap-2">
                          {inc.affectedServices?.map((s: string) => (
                            <Badge key={s} variant="outline" className="text-xs">
                              {s}
                            </Badge>
                          ))}
                          {inc.affectedProviders?.map((p: string) => (
                            <Badge key={p} variant="outline" className="text-xs">
                              {p}
                            </Badge>
                          ))}
                          {inc.affectedCountries?.map((c: string) => (
                            <Badge key={c} variant="outline" className="text-xs">
                              {c}
                            </Badge>
                          ))}
                        </div>
                        <div className="text-xs font-medium">Timeline:</div>
                        {inc.timeline?.map((t: any, i: number) => (
                          <div key={i} className="flex gap-2 text-xs">
                            <span className="text-muted-foreground font-mono">
                              {t.timestamp.slice(11, 19)}
                            </span>
                            <span className="flex-1">{t.event}</span>
                            <Badge variant="outline" className="text-xs">
                              {t.actor}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Dashboards */}
      {subTab === "dashboards" && (
        <div className="space-y-4">
          {/* Business dashboard */}
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <DollarSign className="h-4 w-4 text-emerald-600" /> Business Dashboard
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <span className="text-muted-foreground text-xs">Daily Revenue</span>
                <p className="text-lg font-bold">
                  ₦{(data.business?.dailyRevenue ?? 0).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Transaction Count</span>
                <p className="text-lg font-bold">{data.business?.transactionCount ?? 0}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Provider Costs</span>
                <p className="text-lg font-bold">
                  ₦{(data.business?.providerCosts ?? 0).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Growth Rate</span>
                <p className="text-lg font-bold text-emerald-600">
                  +{data.business?.growthRate ?? 0}%
                </p>
              </div>
            </div>
            <div className="mt-3">
              <span className="text-muted-foreground text-xs">Top Countries:</span>
              <div className="mt-1 flex gap-2">
                {data.business?.topCountries?.map((c: any) => (
                  <Badge key={c.country} variant="outline" className="text-xs">
                    {c.country}: {c.count} txns
                  </Badge>
                ))}
              </div>
            </div>
          </Card>

          {/* Fraud dashboard */}
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Shield className="h-4 w-4 text-rose-600" /> Fraud Dashboard
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <span className="text-muted-foreground text-xs">Blocked Txns</span>
                <p className="text-lg font-bold text-rose-600">
                  {data.fraud?.blockedTransactions ?? 0}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Device Abuse</span>
                <p className="text-lg font-bold">{data.fraud?.deviceAbuse ?? 0}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Velocity Violations</span>
                <p className="text-lg font-bold">{data.fraud?.velocityViolations ?? 0}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Total Flags</span>
                <p className="text-lg font-bold">{data.fraud?.totalFlags ?? 0}</p>
              </div>
            </div>
          </Card>

          {/* Reconciliation dashboard */}
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="h-4 w-4 text-amber-600" /> Reconciliation Dashboard
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <span className="text-muted-foreground text-xs">Outstanding Settlements</span>
                <p className="text-lg font-bold">
                  {data.reconciliation?.outstandingSettlements ?? 0}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Recon Failures</span>
                <p className="text-lg font-bold text-rose-600">
                  {data.reconciliation?.reconciliationFailures ?? 0}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Provider Differences</span>
                <p className="text-lg font-bold">{data.reconciliation?.providerDifferences ?? 0}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Bank Differences</span>
                <p className="text-lg font-bold">{data.reconciliation?.bankDifferences ?? 0}</p>
              </div>
            </div>
          </Card>

          {/* Audit dashboard */}
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4 text-blue-600" /> Audit Dashboard (24h)
            </h3>
            <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <span className="text-muted-foreground text-xs">Admin Actions</span>
                <p className="text-lg font-bold">{data.audit?.adminActions ?? 0}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Permission Changes</span>
                <p className="text-lg font-bold">{data.audit?.permissionChanges ?? 0}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Security Events</span>
                <p className="text-lg font-bold">{data.audit?.securityEvents ?? 0}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Exports</span>
                <p className="text-lg font-bold">{data.audit?.exports ?? 0}</p>
              </div>
            </div>
            {data.audit?.recentActions?.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs font-medium">Recent Actions:</span>
                {data.audit.recentActions.slice(0, 5).map((a: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground font-mono">
                      {a.timestamp.slice(11, 19)}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {a.category}
                    </Badge>
                    <span className="flex-1">{a.action}</span>
                    <span className="text-muted-foreground">{a.actor}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Logs */}
      {subTab === "logs" && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Structured Logs (last 20)</h3>
          <ScrollArea className="max-h-[600px]">
            <div className="space-y-1">
              {data.logs?.length === 0 && (
                <p className="text-muted-foreground py-4 text-center text-sm">No logs yet</p>
              )}
              {data.logs?.map((l: any, i: number) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded border p-2 font-mono text-xs"
                >
                  <span className="text-muted-foreground shrink-0">
                    {l.timestamp?.slice(11, 19)}
                  </span>
                  <span className={`shrink-0 font-bold ${LOG_COLORS[l.level] ?? ""}`}>
                    {l.level}
                  </span>
                  <span className="shrink-0 text-cyan-600">[{l.service}]</span>
                  <span className="flex-1">{l.message}</span>
                  {l.correlationId && (
                    <span className="text-muted-foreground shrink-0">
                      corr:{l.correlationId.slice(0, 8)}
                    </span>
                  )}
                  {l.provider && (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {l.provider}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* OIE — Operations Intelligence Engine */}
      {subTab === "oie" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
              <Zap className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Operations Intelligence Engine</h3>
              <p className="text-muted-foreground text-xs">
                AI-assisted operational insights — anomaly detection, trend analysis, predictions.
              </p>
            </div>
          </div>
          {data.insights?.map((insight: any) => (
            <Card
              key={insight.id}
              className="border-l-4 p-4"
              style={{
                borderLeftColor:
                  insight.severity === "HIGH"
                    ? "#f43f5e"
                    : insight.severity === "MEDIUM"
                      ? "#f59e0b"
                      : "#64748b",
              }}
            >
              <div className="mb-2 flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`text-xs ${SEVERITY_COLORS[insight.severity] ?? ""}`}
                >
                  {insight.severity}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {insight.type}
                </Badge>
                <span className="flex-1 text-sm font-medium">{insight.title}</span>
                <span
                  className={`text-sm font-bold ${insight.changePercent > 0 ? "text-rose-600" : "text-emerald-600"}`}
                >
                  {insight.changePercent > 0 ? "+" : ""}
                  {insight.changePercent}%
                </span>
              </div>
              <p className="text-muted-foreground mb-2 text-xs">{insight.description}</p>
              {insight.recommendedAction && (
                <div className="rounded border border-amber-500/20 bg-amber-500/5 p-2 text-xs">
                  <span className="font-medium">Recommended Action:</span>{" "}
                  {insight.recommendedAction}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
