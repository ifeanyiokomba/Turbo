"use client";

// TurboCore — ZTSA Security Command Center (Chapter 10)
//
// The operational hub for security and compliance teams.
// Shows: feature risk profiles, ABAC policies, compliance targets,
// incident runbooks, Zero Trust verifier, security posture.

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Key,
  Fingerprint,
  Eye,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  Zap,
  Scale,
  FileText,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Play,
  Loader2,
  Globe,
  Server,
  User,
  Cpu,
} from "lucide-react";

interface ZtsaData {
  featureRisk: {
    profiles: Array<{
      feature: string;
      name: string;
      riskLevel: string;
      requiredAuth: string;
      requiredPermissions: string[];
      requiredKycTier: number;
      maxRequestsPerMinute: number;
      description: string;
    }>;
    stats: {
      totalFeatures: number;
      byLevel: Record<string, number>;
      byAuth: Record<string, number>;
    };
  };
  policies: {
    list: Array<{
      id: string;
      name: string;
      description: string;
      effect: string;
      priority: number;
      enabled: boolean;
      conditions: unknown[];
    }>;
    stats: {
      total: number;
      enabled: number;
      disabled: number;
      allowPolicies: number;
      denyPolicies: number;
    };
  };
  compliance: {
    targets: Array<{
      standard: string;
      name: string;
      status: string;
      controls: number;
      implemented: number;
      gaps: string[];
    }>;
    stats: {
      totalStandards: number;
      byStatus: Record<string, number>;
      totalControls: number;
      totalImplemented: number;
      compliancePercentage: number;
    };
  };
  incidentRunbooks: Array<{
    id: string;
    trigger: string;
    name: string;
    severity: string;
    steps: Array<{ action: string; automated: boolean; owner: string }>;
  }>;
  securityPosture: {
    checks: Array<{ check: string; status: string; message: string }>;
    summary: { pass: number; warn: number; fail: number; total: number };
  };
  monitoring: Record<string, number>;
}

const RISK_COLORS: Record<string, string> = {
  LOW: "bg-emerald-100 text-emerald-700 border-emerald-300",
  MEDIUM: "bg-amber-100 text-amber-700 border-amber-300",
  HIGH: "bg-rose-100 text-rose-700 border-rose-300",
  CRITICAL: "bg-red-100 text-red-700 border-red-300",
};

const COMPLIANCE_COLORS: Record<string, string> = {
  COMPLIANT: "bg-emerald-100 text-emerald-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  NOT_STARTED: "bg-slate-100 text-slate-700",
};

type SubTab = "overview" | "features" | "policies" | "compliance" | "incidents" | "verifier";

export default function ZtsaTab() {
  const [data, setData] = React.useState<ZtsaData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [subTab, setSubTab] = React.useState<SubTab>("overview");
  const [expandedPolicy, setExpandedPolicy] = React.useState<string | null>(null);
  const [expandedRunbook, setExpandedRunbook] = React.useState<string | null>(null);
  const [expandedCompliance, setExpandedCompliance] = React.useState<string | null>(null);
  const [toggling, setToggling] = React.useState<string | null>(null);

  // Verifier state
  const [verifyFeature, setVerifyFeature] = React.useState("wallet.transfer");
  const [verifyRole, setVerifyRole] = React.useState("USER");
  const [verifyKyc, setVerifyKyc] = React.useState("2");
  const [verifyMfa, setVerifyMfa] = React.useState(true);
  const [verifyDevice, setVerifyDevice] = React.useState(true);
  const [verifyResult, setVerifyResult] = React.useState<null | {
    verified: boolean;
    riskLevel: string;
    requiredAuth: string;
    deniedReason?: string;
    checks: Array<{ check: string; passed: boolean; reason: string }>;
  }>(null);
  const [verifying, setVerifying] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ztsa", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load ZTSA data");
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

  const handleTogglePolicy = React.useCallback(
    async (id: string, enabled: boolean) => {
      setToggling(id);
      try {
        const res = await fetch("/api/admin/ztsa/policy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "toggle", id, enabled }),
        });
        const d = await res.json();
        if (d.success) {
          toast.success(d.message);
          load();
        } else toast.error(d.message);
      } catch {
        toast.error("Network error");
      } finally {
        setToggling(null);
      }
    },
    [load]
  );

  const handleVerify = React.useCallback(async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch("/api/admin/ztsa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feature: verifyFeature,
          role: verifyRole,
          kycTier: Number(verifyKyc),
          isAuthenticated: true,
          hasMfa: verifyMfa,
          deviceTrusted: verifyDevice,
          permissions: [],
          country: "NG",
        }),
      });
      setVerifyResult(await res.json());
    } catch {
      toast.error("Network error");
    } finally {
      setVerifying(false);
    }
  }, [verifyFeature, verifyRole, verifyKyc, verifyMfa, verifyDevice]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }
  if (!data) return null;

  const subTabs: Array<{
    id: SubTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: "overview", label: "Overview", icon: ShieldCheck },
    { id: "features", label: "Feature Risk", icon: Zap },
    { id: "policies", label: "Policies (ABAC)", icon: Scale },
    { id: "compliance", label: "Compliance", icon: FileText },
    { id: "incidents", label: "Incidents", icon: AlertTriangle },
    { id: "verifier", label: "Zero Trust Verifier", icon: Fingerprint },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10">
            <Shield className="h-5 w-5 text-rose-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Security Command Center</h2>
            <p className="text-muted-foreground text-sm">
              Zero Trust — Never Trust. Always Verify.
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
                  ? "bg-rose-500/10 text-rose-600"
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
              <div className="text-2xl font-bold text-emerald-600">
                {data.securityPosture.summary.pass}
              </div>
              <div className="text-muted-foreground text-xs">Security Checks Passed</div>
            </Card>
            <Card className="border-l-4 border-l-amber-500 p-4">
              <div className="text-2xl font-bold text-amber-600">
                {data.securityPosture.summary.warn}
              </div>
              <div className="text-muted-foreground text-xs">Warnings</div>
            </Card>
            <Card className="border-l-4 border-l-rose-500 p-4">
              <div className="text-2xl font-bold text-rose-600">
                {data.securityPosture.summary.fail}
              </div>
              <div className="text-muted-foreground text-xs">Failures</div>
            </Card>
            <Card className="border-l-4 border-l-blue-500 p-4">
              <div className="text-2xl font-bold text-blue-600">
                {data.compliance.stats.compliancePercentage}%
              </div>
              <div className="text-muted-foreground text-xs">Compliance Score</div>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium">Feature Risk Engine</span>
              </div>
              <div className="text-2xl font-bold">{data.featureRisk.stats.totalFeatures}</div>
              <div className="text-muted-foreground text-xs">Features profiled</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {Object.entries(data.featureRisk.stats.byLevel).map(([k, v]) => (
                  <Badge key={k} variant="outline" className={`text-xs ${RISK_COLORS[k] ?? ""}`}>
                    {k}: {v}
                  </Badge>
                ))}
              </div>
            </Card>
            <Card className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <Scale className="h-4 w-4 text-violet-600" />
                <span className="text-sm font-medium">ABAC Policies</span>
              </div>
              <div className="text-2xl font-bold">{data.policies.stats.total}</div>
              <div className="text-muted-foreground text-xs">
                {data.policies.stats.enabled} enabled, {data.policies.stats.disabled} disabled
              </div>
              <div className="mt-2 flex gap-1">
                <Badge variant="outline" className="bg-emerald-50 text-xs">
                  {data.policies.stats.allowPolicies} ALLOW
                </Badge>
                <Badge variant="outline" className="bg-rose-50 text-xs">
                  {data.policies.stats.denyPolicies} DENY
                </Badge>
              </div>
            </Card>
            <Card className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium">Compliance</span>
              </div>
              <div className="text-2xl font-bold">{data.compliance.stats.totalStandards}</div>
              <div className="text-muted-foreground text-xs">
                {data.compliance.stats.totalImplemented}/{data.compliance.stats.totalControls}{" "}
                controls
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {Object.entries(data.compliance.stats.byStatus).map(([k, v]) => (
                  <Badge
                    key={k}
                    variant="outline"
                    className={`text-xs ${COMPLIANCE_COLORS[k] ?? ""}`}
                  >
                    {k}: {v}
                  </Badge>
                ))}
              </div>
            </Card>
          </div>

          {/* Security posture checks */}
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Security Posture Checks</h3>
            <div className="space-y-1.5">
              {data.securityPosture.checks.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {c.status === "PASS" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : c.status === "WARN" ? (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-500" />
                  )}
                  <span className="font-medium">{c.check}</span>
                  <span className="text-muted-foreground flex-1 truncate">{c.message}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Security Layers diagram (Chapter 10 spec) */}
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">
              Security Layers — Every Request Passes Through
            </h3>
            <div className="bg-muted/50 overflow-x-auto rounded-lg p-4 font-mono text-xs leading-relaxed">
              <pre className="whitespace-pre">{`Internet
    ↓
Edge Protection (HSTS, CSP, CORS, SSRF Guard)
    ↓
API Gateway (Rate Limiting, Input Validation)
    ↓
Authentication (JWT + Session + MFA + Passkeys)
    ↓
Authorization (RBAC + ABAC Policy Engine)
    ↓
Risk Engine (Velocity, Fraud Score, Device Trust)
    ↓
Business Services (Orchestrator, Ledger, Wallet)
    ↓
Database (Encrypted at Rest, Soft-Delete, Audit)
    ↓
Audit (Immutable Audit Logs)
    ↓
Monitoring (Security Command Center)`}</pre>
            </div>
          </Card>

          {/* Real Monitoring Metrics (Chapter 10 — Monitoring) */}
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Security Monitoring (Last 24 Hours)</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <XCircle className="h-3 w-3 text-rose-500" /> Failed Logins
                </div>
                <div className="mt-1 text-xl font-bold text-rose-600">
                  {data.monitoring.failedLogins24h}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <ShieldAlert className="h-3 w-3 text-amber-500" /> Permission Changes
                </div>
                <div className="mt-1 text-xl font-bold text-amber-600">
                  {data.monitoring.permissionChanges24h}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <Server className="h-3 w-3 text-rose-500" /> Provider Auth Failures
                </div>
                <div className="mt-1 text-xl font-bold text-rose-600">
                  {data.monitoring.providerAuthFailures24h}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <AlertTriangle className="h-3 w-3 text-amber-500" /> Webhook Failures
                </div>
                <div className="mt-1 text-xl font-bold text-amber-600">
                  {data.monitoring.webhookFailures24h}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <AlertTriangle className="h-3 w-3 text-rose-500" /> Suspicious Transfers
                </div>
                <div className="mt-1 text-xl font-bold text-rose-600">
                  {data.monitoring.suspiciousTransfers24h}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <Globe className="h-3 w-3 text-amber-500" /> High-Risk Country Access
                </div>
                <div className="mt-1 text-xl font-bold text-amber-600">
                  {data.monitoring.highRiskCountryAccess24h}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <Shield className="h-3 w-3 text-emerald-500" /> API Abuse Blocked
                </div>
                <div className="mt-1 text-xl font-bold text-emerald-600">
                  {data.monitoring.apiAbuseBlocked24h}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <Key className="h-3 w-3 text-amber-500" /> Token Revocations
                </div>
                <div className="mt-1 text-xl font-bold text-amber-600">
                  {data.monitoring.tokenRevocations24h}
                </div>
              </div>
            </div>
            <Separator className="my-3" />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <Activity className="h-3 w-3 text-emerald-500" /> Active Sessions
                </div>
                <div className="mt-1 text-xl font-bold text-emerald-600">
                  {data.monitoring.activeSessions}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <Lock className="h-3 w-3 text-blue-500" /> MFA Enrollments
                </div>
                <div className="mt-1 text-xl font-bold text-blue-600">
                  {data.monitoring.mfaEnrollments}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <Fingerprint className="h-3 w-3 text-violet-500" /> Passkey Enrollments
                </div>
                <div className="mt-1 text-xl font-bold text-violet-600">
                  {data.monitoring.passkeyEnrollments}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Feature Risk */}
      {subTab === "features" && (
        <div className="max-h-[600px] space-y-2 overflow-y-auto">
          {data.featureRisk.profiles.map((f) => (
            <Card key={f.feature} className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={`text-xs ${RISK_COLORS[f.riskLevel] ?? ""}`}>
                  {f.riskLevel}
                </Badge>
                <span className="text-sm font-medium">{f.name}</span>
                <code className="text-muted-foreground text-xs">{f.feature}</code>
                <Badge variant="outline" className="ml-auto text-xs">
                  {f.requiredAuth}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  KYC {f.requiredKycTier}+
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {f.maxRequestsPerMinute}/min
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">{f.description}</p>
            </Card>
          ))}
        </div>
      )}

      {/* ABAC Policies */}
      {subTab === "policies" && (
        <div className="space-y-2">
          {data.policies.list.map((p) => (
            <Card key={p.id} className="p-3">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`text-xs ${p.effect === "DENY" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}
                >
                  {p.effect}
                </Badge>
                <span className="text-sm font-medium">{p.name}</span>
                <Badge variant="outline" className="text-xs">
                  P{p.priority}
                </Badge>
                <div className="ml-auto flex items-center gap-2">
                  {toggling === p.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Switch
                      checked={p.enabled}
                      onCheckedChange={(c) => handleTogglePolicy(p.id, c)}
                    />
                  )}
                </div>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">{p.description}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Compliance */}
      {subTab === "compliance" && (
        <div className="space-y-2">
          {data.compliance.targets.map((t) => {
            const expanded = expandedCompliance === t.standard;
            return (
              <Card key={t.standard} className="p-3">
                <div
                  className="flex cursor-pointer items-center gap-2"
                  onClick={() => setExpandedCompliance(expanded ? null : t.standard)}
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <Badge className={`text-xs ${COMPLIANCE_COLORS[t.status] ?? ""}`}>
                    {t.status}
                  </Badge>
                  <span className="text-sm font-medium">{t.name}</span>
                  <span className="text-muted-foreground ml-auto text-xs">
                    {t.implemented}/{t.controls} controls
                  </span>
                </div>
                {expanded && (
                  <div className="mt-3 ml-6 space-y-1">
                    <div className="text-xs font-medium text-rose-600">Gaps:</div>
                    {t.gaps.map((g, i) => (
                      <div key={i} className="text-muted-foreground text-xs">
                        • {g}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Incidents */}
      {subTab === "incidents" && (
        <div className="space-y-2">
          {data.incidentRunbooks.map((r) => {
            const expanded = expandedRunbook === r.id;
            return (
              <Card key={r.id} className="p-3">
                <div
                  className="flex cursor-pointer items-center gap-2"
                  onClick={() => setExpandedRunbook(expanded ? null : r.id)}
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <Badge variant="outline" className={`text-xs ${RISK_COLORS[r.severity] ?? ""}`}>
                    {r.severity}
                  </Badge>
                  <span className="text-sm font-medium">{r.name}</span>
                </div>
                {expanded && (
                  <div className="mt-3 ml-6 space-y-2">
                    <p className="text-muted-foreground text-xs">
                      <strong>Trigger:</strong> {r.trigger}
                    </p>
                    <div className="text-xs font-medium">Steps:</div>
                    {r.steps.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="bg-muted flex h-5 w-5 items-center justify-center rounded-full font-mono">
                          {i + 1}
                        </span>
                        <span className="flex-1">{s.action}</span>
                        {s.automated ? (
                          <Badge variant="outline" className="bg-emerald-50 text-xs">
                            Auto
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-xs">
                            Manual
                          </Badge>
                        )}
                        <span className="text-muted-foreground">{s.owner}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Zero Trust Verifier */}
      {subTab === "verifier" && (
        <Card className="space-y-5 p-6">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Fingerprint className="h-5 w-5 text-rose-600" /> Zero Trust Verifier
            </h3>
            <p className="text-muted-foreground text-sm">
              Test access decisions against the full Zero Trust stack.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Feature</Label>
              <Select value={verifyFeature} onValueChange={setVerifyFeature}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {data.featureRisk.profiles.map((f) => (
                    <SelectItem key={f.feature} value={f.feature}>
                      {f.name} ({f.riskLevel})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={verifyRole} onValueChange={setVerifyRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">User</SelectItem>
                  <SelectItem value="MERCHANT">Merchant</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="COMPLIANCE">Compliance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>KYC Tier</Label>
              <Select value={verifyKyc} onValueChange={setVerifyKyc}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Tier 0 (None)</SelectItem>
                  <SelectItem value="1">Tier 1 (Basic)</SelectItem>
                  <SelectItem value="2">Tier 2 (Verified)</SelectItem>
                  <SelectItem value="3">Tier 3 (Enhanced)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-4 pt-6">
              <div className="flex items-center gap-2">
                <Switch checked={verifyMfa} onCheckedChange={setVerifyMfa} />
                <span className="text-sm">MFA</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={verifyDevice} onCheckedChange={setVerifyDevice} />
                <span className="text-sm">Trusted Device</span>
              </div>
            </div>
          </div>
          <Button onClick={handleVerify} disabled={verifying} className="gap-2">
            {verifying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Shield className="h-4 w-4" />
            )}{" "}
            Verify Access
          </Button>

          {verifyResult && (
            <div
              className={`rounded-lg border p-4 ${verifyResult.verified ? "border-emerald-500/40 bg-emerald-500/5" : "border-rose-500/40 bg-rose-500/5"}`}
            >
              <div className="mb-3 flex items-center gap-2">
                {verifyResult.verified ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-rose-600" />
                )}
                <span className="font-semibold">
                  {verifyResult.verified ? "ACCESS GRANTED" : "ACCESS DENIED"}
                </span>
                <Badge
                  variant="outline"
                  className={`ml-auto text-xs ${RISK_COLORS[verifyResult.riskLevel] ?? ""}`}
                >
                  {verifyResult.riskLevel}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {verifyResult.requiredAuth}
                </Badge>
              </div>
              {verifyResult.deniedReason && (
                <p className="mb-2 text-sm text-rose-600">{verifyResult.deniedReason}</p>
              )}
              <Separator className="my-3" />
              <div className="space-y-1.5">
                {verifyResult.checks.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {c.passed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-rose-500" />
                    )}
                    <span className="font-medium">{c.check}</span>
                    <span className="text-muted-foreground flex-1 truncate">{c.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
