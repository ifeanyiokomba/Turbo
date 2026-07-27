"use client";

// TurboCore — MTPA Admin Tab (Chapter 11: Multi-Tenant Platform Architecture)
//
// "One TurboCore. Unlimited businesses."
// Shows: tenant list, tenant detail (config, branding, providers, fees, limits),
// per-tenant policies, lifecycle management, billing, cross-tenant operations.

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Building2,
  Globe,
  Server,
  Shield,
  ChevronLeft,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Layers,
  DollarSign,
  Palette,
  Key,
  Webhook,
  Users,
  TrendingUp,
  AlertTriangle,
  Play,
  Trash2,
} from "lucide-react";

interface TenantData {
  id: string;
  code: string;
  name: string;
  displayName: string;
  description: string;
  tier: string;
  lifecycle: string;
  environment: string;
  country: string;
  currency: string;
  domain: string | null;
  createdAt: string;
  activatedAt: string | null;
  config?: {
    primaryProvider: string;
    secondaryProviders: string[];
    enabledProviders: string[];
    routingPriority: string;
    fees: {
      transferFeeMinor: number;
      transferFeeCurrency: string;
      paymentFeeBps: number;
      payoutFeeBps: number;
      fxSpreadBps: number;
    };
    limits: {
      dailyTransferLimitMinor: number;
      monthlyTransferLimitMinor: number;
      singleTransactionLimitMinor: number;
      dailyApiCalls: number;
    };
    risk: { maxRiskScore: number; requireMfaAbove: number; velocityLimitPerHour: number };
    compliance: {
      kycRequired: boolean;
      kycTierRequired: number;
      amlScreening: boolean;
      sanctionsScreening: boolean;
      regulatoryBody: string | null;
    };
    features: Record<string, boolean>;
    branding: {
      primaryColor: string;
      secondaryColor: string;
      typography: string;
      supportContact: string | null;
      customDomain: string | null;
    };
    webhookConfig: { url: string | null; events: string[]; enabled: boolean };
    teamRoles: string[];
    apiKeys: { sandbox: { publicKey: string }; production: { publicKey: string } };
    version: number;
  };
}

interface MtpaData {
  tenants: TenantData[];
  stats: {
    totalTenants: number;
    byLifecycle: Record<string, number>;
    byTier: Record<string, number>;
    byEnvironment: Record<string, number>;
    activeTenants: number;
    suspendedTenants: number;
  };
  policies: Array<{
    id: string;
    tenantId: string;
    category: string;
    name: string;
    description: string;
    enabled: boolean;
    priority: number;
  }>;
  policyStats: {
    total: number;
    enabled: number;
    disabled: number;
    byCategory: Record<string, number>;
  };
}

const LIFECYCLE_COLORS: Record<string, string> = {
  CREATED: "bg-slate-100 text-slate-700",
  CONFIGURED: "bg-blue-100 text-blue-700",
  VERIFIED: "bg-cyan-100 text-cyan-700",
  ACTIVATED: "bg-emerald-100 text-emerald-700",
  SUSPENDED: "bg-rose-100 text-rose-700",
  ARCHIVED: "bg-slate-100 text-slate-500",
};

const TIER_COLORS: Record<string, string> = {
  STARTER: "bg-slate-100 text-slate-700",
  GROWTH: "bg-blue-100 text-blue-700",
  ENTERPRISE: "bg-violet-100 text-violet-700",
  WHITE_LABEL: "bg-amber-100 text-amber-700",
};

const ENV_COLORS: Record<string, string> = {
  DEVELOPMENT: "bg-slate-100 text-slate-700",
  SANDBOX: "bg-amber-100 text-amber-700",
  UAT: "bg-cyan-100 text-cyan-700",
  PRODUCTION: "bg-emerald-100 text-emerald-700",
};

export default function MtpaTab() {
  const [data, setData] = React.useState<MtpaData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedTenant, setSelectedTenant] = React.useState<string | null>(null);
  const [togglingPolicy, setTogglingPolicy] = React.useState<string | null>(null);
  const [transitioning, setTransitioning] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/mtpa", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load tenants");
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
      setTogglingPolicy(id);
      try {
        const res = await fetch("/api/admin/mtpa/policy", {
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
        setTogglingPolicy(null);
      }
    },
    [load]
  );

  const handleLifecycle = React.useCallback(
    async (tenantId: string, lifecycle: string) => {
      setTransitioning(tenantId);
      try {
        const res = await fetch("/api/admin/mtpa/lifecycle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId, lifecycle }),
        });
        const d = await res.json();
        if (d.success) {
          toast.success(d.message);
          load();
        } else toast.error(d.error ?? "Failed");
      } catch {
        toast.error("Network error");
      } finally {
        setTransitioning(null);
      }
    },
    [load]
  );

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

  // Single tenant detail view
  if (selectedTenant) {
    const tenant = data.tenants.find((t) => t.id === selectedTenant);
    if (!tenant) {
      setSelectedTenant(null);
      return null;
    }
    const config = tenant.config;
    const tenantPolicies = data.policies.filter((p) => p.tenantId === tenant.id);

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedTenant(null)}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: (config?.branding.primaryColor ?? "#059669") + "20" }}
            >
              <Building2
                className="h-5 w-5"
                style={{ color: config?.branding.primaryColor ?? "#059669" }}
              />
            </div>
            <div>
              <h2 className="text-xl font-bold">{tenant.displayName}</h2>
              <p className="text-muted-foreground text-sm">{tenant.description}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge className={LIFECYCLE_COLORS[tenant.lifecycle] ?? ""}>{tenant.lifecycle}</Badge>
          <Badge className={TIER_COLORS[tenant.tier] ?? ""}>{tenant.tier}</Badge>
          <Badge className={ENV_COLORS[tenant.environment] ?? ""}>{tenant.environment}</Badge>
          <Badge variant="outline">
            {tenant.country} · {tenant.currency}
          </Badge>
          {tenant.domain && <Badge variant="outline">{tenant.domain}</Badge>}
        </div>

        {/* Lifecycle management */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Lifecycle Management</h3>
          <div className="flex flex-wrap gap-2">
            {["CONFIGURED", "VERIFIED", "ACTIVATED", "SUSPENDED", "ARCHIVED"].map((l) => (
              <Button
                key={l}
                size="sm"
                variant={tenant.lifecycle === l ? "default" : "outline"}
                disabled={transitioning === tenant.id || tenant.lifecycle === l}
                onClick={() => handleLifecycle(tenant.id, l)}
              >
                {transitioning === tenant.id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                {l}
              </Button>
            ))}
          </div>
        </Card>

        {config && (
          <>
            {/* Providers + Routing */}
            <Card className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Server className="h-4 w-4 text-cyan-600" /> Providers & Routing
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground text-xs">Primary Provider</span>
                  <p className="font-medium">{config.primaryProvider}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Routing Priority</span>
                  <p className="font-medium">{config.routingPriority}</p>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-muted-foreground text-xs">Enabled Providers</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {config.enabledProviders.map((p) => (
                      <Badge key={p} variant="outline" className="text-xs">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Fees */}
            <Card className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <DollarSign className="h-4 w-4 text-emerald-600" /> Fees
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <span className="text-muted-foreground text-xs">Transfer Fee</span>
                  <p className="font-medium">
                    {config.fees.transferFeeMinor / 100} {config.fees.transferFeeCurrency}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Payment Fee</span>
                  <p className="font-medium">{config.fees.paymentFeeBps} bps</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Payout Fee</span>
                  <p className="font-medium">{config.fees.payoutFeeBps} bps</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">FX Spread</span>
                  <p className="font-medium">{config.fees.fxSpreadBps} bps</p>
                </div>
              </div>
            </Card>

            {/* Limits + Risk */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <TrendingUp className="h-4 w-4 text-amber-600" /> Limits
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Daily Transfer</span>
                    <span className="font-medium">
                      {(config.limits.dailyTransferLimitMinor / 100).toLocaleString()}{" "}
                      {tenant.currency}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Monthly Transfer</span>
                    <span className="font-medium">
                      {(config.limits.monthlyTransferLimitMinor / 100).toLocaleString()}{" "}
                      {tenant.currency}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Single Transaction</span>
                    <span className="font-medium">
                      {(config.limits.singleTransactionLimitMinor / 100).toLocaleString()}{" "}
                      {tenant.currency}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Daily API Calls</span>
                    <span className="font-medium">
                      {config.limits.dailyApiCalls.toLocaleString()}
                    </span>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Shield className="h-4 w-4 text-rose-600" /> Risk & Compliance
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Risk Score</span>
                    <span className="font-medium">{config.risk.maxRiskScore}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">MFA Above</span>
                    <span className="font-medium">
                      {(config.risk.requireMfaAbove / 100).toLocaleString()} {tenant.currency}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">KYC Tier</span>
                    <span className="font-medium">{config.compliance.kycTierRequired}+</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">AML Screening</span>
                    <span>
                      {config.compliance.amlScreening ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-rose-500" />
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Regulator</span>
                    <span className="font-medium">{config.compliance.regulatoryBody ?? "—"}</span>
                  </div>
                </div>
              </Card>
            </div>

            {/* Branding */}
            <Card className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Palette className="h-4 w-4 text-violet-600" /> Branding (White-Label)
              </h3>
              <div className="flex gap-4">
                <div className="flex flex-col gap-2">
                  <div
                    className="h-16 w-16 rounded-lg"
                    style={{ backgroundColor: config.branding.primaryColor }}
                  />
                  <span className="text-muted-foreground text-center text-xs">
                    {config.branding.primaryColor}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <div
                    className="h-16 w-16 rounded-lg"
                    style={{ backgroundColor: config.branding.secondaryColor }}
                  />
                  <span className="text-muted-foreground text-center text-xs">
                    {config.branding.secondaryColor}
                  </span>
                </div>
                <div className="flex-1 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Typography</span>
                    <span className="font-medium">{config.branding.typography}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Support Contact</span>
                    <span className="font-medium">{config.branding.supportContact ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Custom Domain</span>
                    <span className="font-medium">{config.branding.customDomain ?? "—"}</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Features */}
            <Card className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Layers className="h-4 w-4 text-blue-600" /> Feature Flags (Per-Tenant)
              </h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(config.features).map(([k, v]) => (
                  <Badge
                    key={k}
                    variant="outline"
                    className={`text-xs ${v ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-400"}`}
                  >
                    {v ? "✓" : "✗"} {k}
                  </Badge>
                ))}
              </div>
            </Card>

            {/* API Keys */}
            <Card className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Key className="h-4 w-4 text-amber-600" /> API Keys
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sandbox Public Key</span>
                  <code className="text-xs">{config.apiKeys.sandbox.publicKey}</code>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Production Public Key</span>
                  <code className="text-xs">{config.apiKeys.production.publicKey}</code>
                </div>
              </div>
            </Card>

            {/* Webhooks */}
            <Card className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Webhook className="h-4 w-4 text-cyan-600" /> Webhook Configuration
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">URL</span>
                  <span className="font-medium">{config.webhookConfig.url ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Enabled</span>
                  <span>
                    {config.webhookConfig.enabled ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-rose-500" />
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Events:</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {config.webhookConfig.events.map((e) => (
                      <Badge key={e} variant="outline" className="text-xs">
                        {e}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Team Roles */}
            <Card className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4 text-blue-600" /> Team Roles
              </h3>
              <div className="flex flex-wrap gap-2">
                {config.teamRoles.map((r) => (
                  <Badge key={r} variant="outline" className="text-xs">
                    {r}
                  </Badge>
                ))}
              </div>
            </Card>
          </>
        )}

        {/* Per-tenant policies */}
        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-600" /> Tenant Policies (
            {tenantPolicies.length})
          </h3>
          <div className="space-y-2">
            {tenantPolicies.length === 0 && (
              <p className="text-muted-foreground text-sm">No policies configured.</p>
            )}
            {tenantPolicies.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-lg border p-2">
                <Badge variant="outline" className="text-xs">
                  {p.category}
                </Badge>
                <span className="flex-1 text-sm font-medium">{p.name}</span>
                <Badge variant="outline" className="text-xs">
                  P{p.priority}
                </Badge>
                {togglingPolicy === p.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Switch
                    checked={p.enabled}
                    onCheckedChange={(c) => handleTogglePolicy(p.id, c)}
                  />
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  // Tenant list view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10">
            <Building2 className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Multi-Tenant Platform</h2>
            <p className="text-muted-foreground text-sm">One TurboCore. Unlimited businesses.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-violet-500 p-4">
          <div className="text-2xl font-bold text-violet-600">{data.stats.totalTenants}</div>
          <div className="text-muted-foreground text-xs">Total Tenants</div>
        </Card>
        <Card className="border-l-4 border-l-emerald-500 p-4">
          <div className="text-2xl font-bold text-emerald-600">{data.stats.activeTenants}</div>
          <div className="text-muted-foreground text-xs">Active</div>
        </Card>
        <Card className="border-l-4 border-l-rose-500 p-4">
          <div className="text-2xl font-bold text-rose-600">{data.stats.suspendedTenants}</div>
          <div className="text-muted-foreground text-xs">Suspended</div>
        </Card>
        <Card className="border-l-4 border-l-amber-500 p-4">
          <div className="text-2xl font-bold text-amber-600">{data.policyStats.total}</div>
          <div className="text-muted-foreground text-xs">Tenant Policies</div>
        </Card>
      </div>

      {/* Tenant hierarchy diagram */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Tenant Hierarchy</h3>
        <div className="bg-muted/50 overflow-x-auto rounded-lg p-4 font-mono text-xs leading-relaxed">
          <pre className="whitespace-pre">{`TurboCore (Platform)
    ↓
    ├── TurboPay Consumer (White-Label, NG, Production)
    │     └── TurboPay Business (Enterprise, NG, Production)
    ├── Bank A — White Label (White-Label, NG, Production)
    ├── Fintech B — Embedded Finance (Growth, KE, Production)
    ├── Government C — Payment Infrastructure (Enterprise, NG, Production)
    ├── Marketplace D — Split Payments (Growth, GH, Sandbox)
    └── Enterprise E — Corporate Payouts (Enterprise, ZA, UAT)`}</pre>
        </div>
      </Card>

      {/* Tenant list */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Tenants</h3>
        {data.tenants.map((t) => (
          <Card
            key={t.id}
            className="hover:bg-muted/50 cursor-pointer p-4 transition-colors"
            onClick={() => setSelectedTenant(t.id)}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: (t.config?.branding.primaryColor ?? "#059669") + "20" }}
              >
                <Building2
                  className="h-5 w-5"
                  style={{ color: t.config?.branding.primaryColor ?? "#059669" }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{t.displayName}</span>
                  <Badge className={`text-xs ${LIFECYCLE_COLORS[t.lifecycle] ?? ""}`}>
                    {t.lifecycle}
                  </Badge>
                  <Badge className={`text-xs ${TIER_COLORS[t.tier] ?? ""}`}>{t.tier}</Badge>
                  <Badge className={`text-xs ${ENV_COLORS[t.environment] ?? ""}`}>
                    {t.environment}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-0.5 truncate text-xs">{t.description}</p>
              </div>
              <div className="text-right text-xs">
                <div className="font-medium">
                  {t.country} · {t.currency}
                </div>
                {t.domain && <div className="text-muted-foreground">{t.domain}</div>}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
