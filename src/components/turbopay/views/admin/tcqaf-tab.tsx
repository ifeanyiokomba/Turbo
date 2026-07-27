"use client";

// TurboCore — TCQAF Admin Tab (Chapter 14: Testing, Certification & Quality Assurance)

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Shield,
  Bug,
  Zap,
  Activity,
  FileText,
  Server,
  Beaker,
  GitBranch,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Gauge,
  Cpu,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  PASS: "bg-emerald-100 text-emerald-700",
  PASSED: "bg-emerald-100 text-emerald-700",
  CERTIFIED: "bg-emerald-100 text-emerald-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  FAIL: "bg-rose-100 text-rose-700",
  FAILED: "bg-rose-100 text-rose-700",
  PENDING: "bg-amber-100 text-amber-700",
  RUNNING: "bg-blue-100 text-blue-700",
  SKIP: "bg-slate-100 text-slate-500",
  SKIPPED: "bg-slate-100 text-slate-500",
  EXPIRED: "bg-rose-100 text-rose-700",
  NOT_STARTED: "bg-slate-100 text-slate-500",
};

const DOMAIN_COLORS: Record<string, string> = {
  UNIT: "bg-blue-100 text-blue-700",
  INTEGRATION: "bg-cyan-100 text-cyan-700",
  CONTRACT: "bg-violet-100 text-violet-700",
  PROVIDER_CERT: "bg-amber-100 text-amber-700",
  SECURITY: "bg-rose-100 text-rose-700",
  PERFORMANCE: "bg-emerald-100 text-emerald-700",
  CHAOS: "bg-orange-100 text-orange-700",
  COMPLIANCE: "bg-fuchsia-100 text-fuchsia-700",
  UAT: "bg-blue-100 text-blue-700",
  REGRESSION: "bg-slate-100 text-slate-700",
};

type SubTab = "overview" | "suites" | "certification" | "gates" | "load" | "chaos" | "simulation";

export default function TcqafTab() {
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [subTab, setSubTab] = React.useState<SubTab>("overview");
  const [expandedCert, setExpandedCert] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tcqaf", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load TCQAF data");
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
    { id: "overview", label: "Overview", icon: Gauge },
    { id: "suites", label: "Test Suites", icon: Beaker },
    { id: "certification", label: "Certification", icon: Shield },
    { id: "gates", label: "Release Gates", icon: GitBranch },
    { id: "load", label: "Load Tests", icon: TrendingUp },
    { id: "chaos", label: "Chaos", icon: Zap },
    { id: "simulation", label: "Simulation", icon: Cpu },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
            <Shield className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Testing &amp; Quality Assurance</h2>
            <p className="text-muted-foreground text-sm">
              Bank-grade — every scenario tested, every provider certified.
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
                  ? "bg-emerald-500/10 text-emerald-600"
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
              <div className="text-2xl font-bold text-emerald-600">{s.testPassRate}%</div>
              <div className="text-muted-foreground text-xs">
                Test Pass Rate ({s.totalPassed}/{s.totalTests})
              </div>
            </Card>
            <Card className="border-l-4 border-l-blue-500 p-4">
              <div className="text-2xl font-bold text-blue-600">{s.codeCoverage}%</div>
              <div className="text-muted-foreground text-xs">Code Coverage</div>
            </Card>
            <Card className="border-l-4 border-l-amber-500 p-4">
              <div className="text-2xl font-bold text-amber-600">{s.certifiedProviders}</div>
              <div className="text-muted-foreground text-xs">Providers Certified</div>
            </Card>
            <Card className="border-l-4 border-l-violet-500 p-4">
              <div className="text-2xl font-bold text-violet-600">
                {s.passedGates}/{s.releaseGates}
              </div>
              <div className="text-muted-foreground text-xs">Release Gates Passed</div>
            </Card>
          </div>

          {/* Quality metrics */}
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Quality Metrics</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <span className="text-muted-foreground text-xs">Escaped Defects</span>
                <p className="text-lg font-bold text-emerald-600">
                  {data.qualityMetrics.escapedDefects}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Regression Rate</span>
                <p className="text-lg font-bold text-emerald-600">
                  {data.qualityMetrics.regressionRate}%
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Deploy Success</span>
                <p className="text-lg font-bold text-emerald-600">
                  {data.qualityMetrics.deploymentSuccessRate}%
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Mean Recovery</span>
                <p className="text-lg font-bold">{data.qualityMetrics.meanRecoveryTime}min</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Provider Cert Score</span>
                <p className="text-lg font-bold">
                  {data.qualityMetrics.providerCertificationScore}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Security Findings</span>
                <p className="text-lg font-bold text-emerald-600">
                  {data.qualityMetrics.securityFindings}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Branch Coverage</span>
                <p className="text-lg font-bold">{data.qualityMetrics.branchCoverage}%</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Total Tests</span>
                <p className="text-lg font-bold">{data.qualityMetrics.totalTests}</p>
              </div>
            </div>
          </Card>

          {/* Testing pyramid */}
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Testing Pyramid</h3>
            <div className="bg-muted/50 rounded-lg p-4 font-mono text-xs leading-relaxed">
              <pre className="text-center whitespace-pre">{`                    Manual Exploration
                          ▲
                End-to-End Tests (15)
                      ▲
             Integration Tests (48)
                  ▲
            Component Tests (85)
               ▲
          Unit Tests (569) ← foundation`}</pre>
            </div>
          </Card>

          {/* Release certification process */}
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <GitBranch className="h-4 w-4 text-blue-600" /> Release Certification: v
              {data.releaseCertification.version} — {data.releaseCertification.status}
            </h3>
            <div className="space-y-1">
              {data.releaseCertification.stages?.map((stage: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="bg-muted flex h-5 w-5 items-center justify-center rounded-full font-mono">
                    {i + 1}
                  </span>
                  {stage.status === "PASSED" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-amber-500" />
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
        </div>
      )}

      {/* Test Suites */}
      {subTab === "suites" && (
        <div className="space-y-2">
          {data.testSuites?.map((ts: any) => (
            <Card key={ts.id} className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`text-xs ${DOMAIN_COLORS[ts.domain] ?? ""}`}>{ts.domain}</Badge>
                <Badge className={`text-xs ${STATUS_COLORS[ts.status] ?? ""}`}>{ts.status}</Badge>
                <span className="text-sm font-medium">{ts.name}</span>
                <div className="ml-auto flex gap-2 text-xs">
                  <span className="text-emerald-600">{ts.passed}✓</span>
                  {ts.failed > 0 && <span className="text-rose-600">{ts.failed}✗</span>}
                  {ts.skipped > 0 && <span className="text-muted-foreground">{ts.skipped}⏭</span>}
                  <span className="text-muted-foreground">{ts.duration}s</span>
                </div>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">{ts.description}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Certification */}
      {subTab === "certification" && (
        <div className="space-y-2">
          {/* Provider sandboxes */}
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Server className="h-4 w-4 text-amber-600" /> Provider Sandbox Management
            </h3>
            <div className="space-y-1.5">
              {data.providerSandboxes?.map((ps: any) => (
                <div key={ps.providerCode} className="flex items-center gap-2 text-xs">
                  <Badge className={`text-xs ${STATUS_COLORS[ps.certificationStatus] ?? ""}`}>
                    {ps.certificationStatus}
                  </Badge>
                  <span className="font-medium">{ps.displayName}</span>
                  {ps.sandboxAvailable && (
                    <Badge variant="outline" className="bg-emerald-50 text-xs">
                      Sandbox ✓
                    </Badge>
                  )}
                  {ps.credentialsConfigured && (
                    <Badge variant="outline" className="bg-blue-50 text-xs">
                      Creds ✓
                    </Badge>
                  )}
                  <span className="text-muted-foreground ml-auto">
                    {ps.testTransactionsRun} test txns
                  </span>
                  <span className="text-muted-foreground">
                    verified: {ps.lastVerified.slice(0, 10)}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Certification records */}
          {data.certifications?.map((cert: any) => {
            const expanded = expandedCert === cert.id;
            return (
              <Card key={cert.id} className="p-3">
                <div
                  className="flex cursor-pointer items-center gap-2"
                  onClick={() => setExpandedCert(expanded ? null : cert.id)}
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <Badge className={`text-xs ${STATUS_COLORS[cert.status] ?? ""}`}>
                    {cert.status}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {cert.type}
                  </Badge>
                  <span className="flex-1 text-sm font-medium">{cert.name}</span>
                  <span className="text-sm font-bold">{cert.score}/100</span>
                  <span className="text-muted-foreground text-xs">
                    {cert.passedChecks}/{cert.totalChecks}
                  </span>
                </div>
                {expanded && (
                  <div className="mt-3 ml-6 space-y-1.5">
                    {cert.checks?.map((c: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {c.status === "PASS" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        ) : c.status === "FAIL" ? (
                          <XCircle className="h-3.5 w-3.5 text-rose-500" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-slate-400" />
                        )}
                        <Badge variant="outline" className="text-xs">
                          {c.category}
                        </Badge>
                        <span className="font-medium">{c.name}</span>
                        {c.message && <span className="text-muted-foreground">— {c.message}</span>}
                        {c.durationMs && (
                          <span className="text-muted-foreground ml-auto">{c.durationMs}ms</span>
                        )}
                      </div>
                    ))}
                    <div className="text-muted-foreground mt-2 text-xs">
                      Verified: {cert.lastVerifiedAt.slice(0, 10)} · Expires:{" "}
                      {cert.expiresAt.slice(0, 10)} · By: {cert.certifiedBy}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Release Gates */}
      {subTab === "gates" && (
        <div className="space-y-2">
          <Card
            className={`p-4 ${s.allGatesPassed ? "border-l-4 border-l-emerald-500" : "border-l-4 border-l-rose-500"}`}
          >
            <div className="flex items-center gap-2">
              {s.allGatesPassed ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-rose-500" />
              )}
              <div>
                <h3 className="text-lg font-semibold">
                  {s.allGatesPassed ? "All Release Gates Passed" : "Release Gates Not Met"}
                </h3>
                <p className="text-muted-foreground text-xs">
                  {s.passedGates}/{s.releaseGates} gates passed ({s.blockingGates} blocking)
                </p>
              </div>
            </div>
          </Card>
          {data.releaseGates?.map((g: any) => (
            <Card key={g.id} className="p-3">
              <div className="flex items-center gap-2">
                {g.status === "PASSED" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : g.status === "FAILED" ? (
                  <XCircle className="h-4 w-4 text-rose-500" />
                ) : (
                  <Clock className="h-4 w-4 text-amber-500" />
                )}
                <Badge className={`text-xs ${STATUS_COLORS[g.status] ?? ""}`}>{g.status}</Badge>
                {g.blocking && (
                  <Badge variant="outline" className="bg-rose-50 text-xs text-rose-700">
                    BLOCKING
                  </Badge>
                )}
                <span className="flex-1 text-sm font-medium">{g.name}</span>
                <Badge variant="outline" className="text-xs">
                  {g.category}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">{g.description}</p>
              {g.evidence && <p className="mt-1 text-xs text-emerald-600">✓ {g.evidence}</p>}
            </Card>
          ))}
        </div>
      )}

      {/* Load Tests */}
      {subTab === "load" && (
        <div className="space-y-2">
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Load Testing Results</h3>
            <div className="space-y-2">
              {data.loadTests?.map((lt: any) => (
                <div key={lt.id} className="flex items-center gap-2 rounded border p-2 text-xs">
                  <Badge className={`text-xs ${STATUS_COLORS[lt.status] ?? ""}`}>{lt.status}</Badge>
                  <span className="font-bold">{lt.target}</span>
                  <span className="text-muted-foreground">for {lt.duration}</span>
                  <div className="ml-auto flex gap-3">
                    <span>
                      <span className="text-muted-foreground">avg:</span> {lt.avgResponseMs}ms
                    </span>
                    <span>
                      <span className="text-muted-foreground">p95:</span> {lt.p95ResponseMs}ms
                    </span>
                    <span>
                      <span className="text-muted-foreground">p99:</span> {lt.p99ResponseMs}ms
                    </span>
                    <span>
                      <span className="text-muted-foreground">errors:</span> {lt.errorRate}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Chaos Engineering */}
      {subTab === "chaos" && (
        <div className="space-y-2">
          {data.chaosExperiments?.map((exp: any) => (
            <Card key={exp.id} className="p-3">
              <div className="mb-1 flex items-center gap-2">
                <Zap className="h-4 w-4 text-orange-500" />
                <Badge className={`text-xs ${STATUS_COLORS[exp.status] ?? ""}`}>{exp.status}</Badge>
                <span className="flex-1 text-sm font-medium">{exp.name}</span>
                <span className="text-muted-foreground text-xs">{exp.runAt.slice(0, 10)}</span>
              </div>
              <p className="text-muted-foreground text-xs">{exp.description}</p>
              <div className="mt-2 grid gap-1 text-xs">
                <div>
                  <span className="font-medium text-rose-600">Injected:</span> {exp.failureInjected}
                </div>
                <div>
                  <span className="font-medium text-blue-600">Expected:</span>{" "}
                  {exp.expectedBehavior}
                </div>
                <div>
                  <span className="font-medium text-emerald-600">Actual:</span> {exp.actualBehavior}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Provider Simulation */}
      {subTab === "simulation" && (
        <div className="space-y-3">
          <Card className="p-4">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Cpu className="h-4 w-4 text-violet-600" /> Provider Simulation Framework (PSF)
            </h3>
            <p className="text-muted-foreground mb-3 text-xs">
              Emulate provider behaviour to test rare failure scenarios consistently.
            </p>
            <div className="space-y-1.5">
              {data.providerSimulations?.map((sim: any, i: number) => (
                <div key={i} className="flex items-center gap-2 rounded border p-2 text-xs">
                  {sim.enabled ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-slate-400" />
                  )}
                  <span className="font-medium">{sim.displayName}</span>
                  <Badge variant="outline" className="text-xs">
                    {sim.scenario}
                  </Badge>
                  <span className="text-muted-foreground flex-1 truncate">{sim.description}</span>
                  <span className="text-muted-foreground">
                    HTTP {sim.configuredResponse.status} · {sim.configuredResponse.delay}ms
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
