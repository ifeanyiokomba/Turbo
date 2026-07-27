"use client";

// Admin tab — Providers (enhanced for Task P9-A)
// Lists every ProviderConfig with:
//   - live health dot (green/amber/red based on healthScore)
//   - circuit breaker state badge (CLOSED/HALF_OPEN/OPEN)
//   - success rate % + avg latency + last 10 health samples sparkline
//   - "Test provider" button — pings the adapter via listBanks/listBillers and records
//     the result as a ProviderHealthCheck sample.
//   - "Force circuit reset" button — admin ops escape hatch to clear breaker state.
//   - failover stats card: total failovers in last 24h, top providers failed over,
//     top reasons, and success-rate-after-failover.
//
// Per-provider health samples are fetched lazily on first view (collapsible row) or
// via the per-provider actions.

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Server,
  Plus,
  KeyRound,
  RefreshCw,
  Loader2,
  Download,
  Eye,
  Activity,
  Zap,
  RotateCcw,
  TrendingUp,
  Clock,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/money";
import { exportCsv, CIRCUIT_TONE, HealthBar, healthTone, ALL_CONTRACTS } from "./shared";
import { HealthSparkline, FailoverStatsCard } from "./provider-health-widgets";

interface ProviderRow {
  id: string;
  code: string;
  displayName: string;
  sandbox: boolean;
  enabled: boolean;
  weightsJSON: string;
  defaultPriority: number;
  website: string | null;
  logoUrl: string | null;
  healthScore: number;
  healthUpdatedAt: string;
  circuitState: string;
  circuitFailures: number;
  capabilityCount: number;
  createdAt: string;
  updatedAt: string;
}

interface CapabilityRow {
  id: string;
  providerCode: string;
  contract: string;
  country: string;
  currency: string;
  service: string | null;
  direction: string;
  minAmountMinor: number;
  maxAmountMinor: number;
  feeBps: number;
  feeFixedMinor: number;
  settleHours: number;
  enabled: boolean;
}

interface RouteRow {
  id: string;
  contract: string;
  providerCode: string;
  country: string;
  currency: string;
  priority: number;
  weight: number;
  canaryPercent: number;
  enabled: boolean;
}

interface HealthSample {
  id: string;
  ok: boolean;
  latencyMs: number;
  errorCode: string | null;
  healthScore: number;
  sampledAt: string;
}

interface ProviderHealthDetail {
  providerCode: string;
  exists: boolean;
  healthScore: number;
  healthUpdatedAt: string;
  circuit: { state: string; failures: number; successes: number };
  successRate: number;
  avgLatencyMs: number;
  totalSamples: number;
  failureBreakdown: Record<string, number>;
  samples: HealthSample[];
}

export default function ProvidersTab() {
  const [providers, setProviders] = React.useState<ProviderRow[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [expandedRow, setExpandedRow] = React.useState<string | null>(null);
  const [healthByProvider, setHealthByProvider] = React.useState<
    Record<string, ProviderHealthDetail | null>
  >({});
  const [healthLoading, setHealthLoading] = React.useState<Record<string, boolean>>({});
  const [testingCode, setTestingCode] = React.useState<string | null>(null);
  const [resettingCode, setResettingCode] = React.useState<string | null>(null);

  // Add provider dialog
  const [addOpen, setAddOpen] = React.useState(false);
  const [addForm, setAddForm] = React.useState({
    code: "",
    displayName: "",
    sandbox: true,
    enabled: true,
    defaultPriority: 50,
  });
  const [adding, setAdding] = React.useState(false);

  // Rotate credentials dialog
  const [rotateTarget, setRotateTarget] = React.useState<ProviderRow | null>(null);
  const [rotatePairs, setRotatePairs] = React.useState<{ key: string; value: string }[]>([
    { key: "", value: "" },
  ]);
  const [rotating, setRotating] = React.useState(false);

  // Details dialog
  const [detailsTarget, setDetailsTarget] = React.useState<ProviderRow | null>(null);
  const [detailsCaps, setDetailsCaps] = React.useState<CapabilityRow[] | null>(null);
  const [detailsRoutes, setDetailsRoutes] = React.useState<RouteRow[] | null>(null);
  const [detailsLoading, setDetailsLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/providers", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load providers");
        return;
      }
      const data = await res.json();
      setProviders(data.providers);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function loadHealth(code: string) {
    setHealthLoading((cur) => ({ ...cur, [code]: true }));
    try {
      const res = await fetch(`/api/admin/provider-health/${encodeURIComponent(code)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        toast.error("Failed to load health samples");
        return;
      }
      const data: ProviderHealthDetail = await res.json();
      setHealthByProvider((cur) => ({ ...cur, [code]: data }));
    } finally {
      setHealthLoading((cur) => ({ ...cur, [code]: false }));
    }
  }

  function toggleExpand(code: string) {
    if (expandedRow === code) {
      setExpandedRow(null);
      return;
    }
    setExpandedRow(code);
    if (!healthByProvider[code]) loadHealth(code);
  }

  async function toggleEnabled(p: ProviderRow, next: boolean) {
    setProviders((cur) => cur?.map((x) => (x.id === p.id ? { ...x, enabled: next } : x)) ?? null);
    try {
      const res = await fetch(`/api/admin/providers/${p.code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${p.displayName} ${next ? "enabled" : "disabled"}`);
    } catch {
      setProviders(
        (cur) => cur?.map((x) => (x.id === p.id ? { ...x, enabled: !next } : x)) ?? null
      );
      toast.error("Failed to update provider");
    }
  }

  async function testProvider(p: ProviderRow) {
    setTestingCode(p.code);
    try {
      const res = await fetch(`/api/admin/provider-health/${encodeURIComponent(p.code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed");
      }
      const data = await res.json();
      if (data.result?.ok) {
        toast.success(`${p.displayName} test OK · ${data.result.latencyMs}ms`, {
          description: data.contract ? `via ${data.contract}` : undefined,
        });
      } else {
        toast.error(`${p.displayName} test failed · ${data.result?.errorCode ?? "UNKNOWN"}`, {
          description: data.result?.detail ? String(data.result.detail) : undefined,
        });
      }
      // Refresh health + provider list (breaker/health may have changed)
      await Promise.all([loadHealth(p.code), load()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTestingCode(null);
    }
  }

  async function forceResetCircuit(p: ProviderRow) {
    if (
      !confirm(
        `Force-reset the circuit breaker for ${p.displayName}? This clears the in-memory breaker state immediately.`
      )
    )
      return;
    setResettingCode(p.code);
    try {
      const res = await fetch(`/api/admin/provider-health/${encodeURIComponent(p.code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_circuit" }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed");
      }
      const data = await res.json();
      if (data.didReset) {
        toast.success(`${p.displayName} circuit reset → CLOSED`);
      } else {
        toast.info(`${p.displayName} circuit was already CLOSED`);
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setResettingCode(null);
    }
  }

  async function submitAdd() {
    if (!addForm.code || !addForm.displayName) {
      toast.error("Code and display name are required");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/admin/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed");
      }
      toast.success(`Provider "${addForm.code}" created`);
      setAddOpen(false);
      setAddForm({ code: "", displayName: "", sandbox: true, enabled: true, defaultPriority: 50 });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create provider");
    } finally {
      setAdding(false);
    }
  }

  async function submitRotate() {
    if (!rotateTarget) return;
    const valid = rotatePairs.filter((p) => p.key.trim() && p.value.trim());
    if (valid.length === 0) {
      toast.error("Add at least one key/value pair");
      return;
    }
    const secretsJSON: Record<string, string> = {};
    for (const p of valid) secretsJSON[p.key.trim()] = p.value.trim();
    setRotating(true);
    try {
      const res = await fetch("/api/admin/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerCode: rotateTarget.code, secretsJSON }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed");
      }
      const data = await res.json();
      toast.success(
        `Credentials rotated for ${rotateTarget.displayName} (v${data.credential.version})`
      );
      setRotateTarget(null);
      setRotatePairs([{ key: "", value: "" }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rotate credentials");
    } finally {
      setRotating(false);
    }
  }

  async function openDetails(p: ProviderRow) {
    setDetailsTarget(p);
    setDetailsCaps(null);
    setDetailsRoutes(null);
    setDetailsLoading(true);
    try {
      const [capsRes, routesRes] = await Promise.all([
        fetch(`/api/admin/capabilities?providerCode=${encodeURIComponent(p.code)}`, {
          cache: "no-store",
        }),
        fetch(`/api/admin/routing?providerCode=${encodeURIComponent(p.code)}`, {
          cache: "no-store",
        }),
      ]);
      if (capsRes.ok) setDetailsCaps((await capsRes.json()).capabilities ?? []);
      if (routesRes.ok) setDetailsRoutes((await routesRes.json()).routes ?? []);
    } finally {
      setDetailsLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Provider configs</h3>
            <p className="text-muted-foreground text-xs">
              Live health score + circuit breaker state per provider. Click a row to expand the
              health sparkline.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                if (!providers) return;
                exportCsv(
                  `turbopay-providers-${new Date().toISOString().slice(0, 10)}.csv`,
                  [
                    "Code",
                    "Display Name",
                    "Sandbox",
                    "Enabled",
                    "Health",
                    "Circuit",
                    "Priority",
                    "Capabilities",
                  ],
                  providers.map((p) => [
                    p.code,
                    p.displayName,
                    p.sandbox ? "Yes" : "No",
                    p.enabled ? "Yes" : "No",
                    p.healthScore,
                    p.circuitState,
                    p.defaultPriority,
                    p.capabilityCount,
                  ])
                );
                toast.success("Providers exported");
              }}
              disabled={!providers || providers.length === 0}
            >
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add provider
            </Button>
          </div>
        </div>
      </Card>

      {/* Failover stats */}
      <FailoverStatsCard />

      <Card className="p-5">
        {loading && !providers ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 rounded-xl" />
            ))}
          </div>
        ) : providers && providers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="text-muted-foreground text-left text-xs">
                  <th className="w-8 pr-2 pb-2 font-medium"></th>
                  <th className="pr-2 pb-2 font-medium">Provider</th>
                  <th className="pr-2 pb-2 font-medium">Sandbox</th>
                  <th className="pr-2 pb-2 font-medium">Enabled</th>
                  <th className="pr-2 pb-2 font-medium">Health</th>
                  <th className="pr-2 pb-2 font-medium">Circuit</th>
                  <th className="pr-2 pb-2 font-medium">Success</th>
                  <th className="pr-2 pb-2 font-medium">Latency</th>
                  <th className="pr-2 pb-2 font-medium">Capabilities</th>
                  <th className="pb-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => {
                  const tone = healthTone(p.healthScore);
                  const expanded = expandedRow === p.code;
                  const healthDetail = healthByProvider[p.code];
                  const healthLoadingRow = healthLoading[p.code];
                  return (
                    <React.Fragment key={p.id}>
                      <tr className="hover:bg-muted/40 border-t transition-colors">
                        <td className="py-2 pr-2 align-middle">
                          <button
                            type="button"
                            onClick={() => toggleExpand(p.code)}
                            className="text-muted-foreground hover:bg-muted flex h-6 w-6 items-center justify-center rounded"
                            aria-label={expanded ? "Collapse row" : "Expand row"}
                          >
                            {expanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                        <td className="py-2 pr-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.bar}`}
                              title={`Health ${p.healthScore}/100`}
                              aria-hidden
                            />
                            <div className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                              <Server className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="font-medium">{p.displayName}</p>
                              <p className="text-muted-foreground font-mono text-xs">{p.code}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 pr-2">
                          <Badge
                            variant="secondary"
                            className={`text-[10px] ${p.sandbox ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}
                          >
                            {p.sandbox ? "Sandbox" : "Live"}
                          </Badge>
                        </td>
                        <td className="py-2 pr-2">
                          <Switch
                            checked={p.enabled}
                            onCheckedChange={(v) => toggleEnabled(p, v)}
                            aria-label="Toggle provider"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <HealthBar score={p.healthScore} />
                        </td>
                        <td className="py-2 pr-2">
                          <Badge
                            variant="secondary"
                            className={`text-[10px] ${CIRCUIT_TONE[p.circuitState] ?? "bg-muted text-muted-foreground"}`}
                          >
                            {p.circuitState}
                          </Badge>
                          {p.circuitFailures > 0 && (
                            <span className="text-muted-foreground ml-1 text-[10px]">
                              ({p.circuitFailures}f)
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-2 text-xs tabular-nums">
                          {healthDetail ? `${healthDetail.successRate}%` : "—"}
                        </td>
                        <td className="py-2 pr-2 text-xs tabular-nums">
                          {healthDetail ? `${healthDetail.avgLatencyMs}ms` : "—"}
                        </td>
                        <td className="py-2 pr-2 text-xs tabular-nums">{p.capabilityCount}</td>
                        <td className="py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 px-2 text-xs"
                              onClick={() => openDetails(p)}
                            >
                              <Eye className="h-3.5 w-3.5" /> View
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 px-2 text-xs"
                              onClick={() => testProvider(p)}
                              disabled={testingCode === p.code}
                              title="Ping the provider via listBanks/listBillers"
                            >
                              {testingCode === p.code ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Zap className="h-3.5 w-3.5" />
                              )}
                              Test
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 px-2 text-xs text-amber-700 dark:text-amber-400"
                              onClick={() => forceResetCircuit(p)}
                              disabled={resettingCode === p.code || p.circuitState === "CLOSED"}
                              title="Force-clear the circuit breaker"
                            >
                              {resettingCode === p.code ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5" />
                              )}
                              Reset
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 px-2 text-xs"
                              onClick={() => {
                                setRotateTarget(p);
                                setRotatePairs([{ key: "", value: "" }]);
                              }}
                            >
                              <KeyRound className="h-3.5 w-3.5" /> Rotate
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-muted/20 border-t">
                          <td colSpan={10} className="p-4">
                            {healthLoadingRow && !healthDetail ? (
                              <div className="space-y-2">
                                <Skeleton className="h-24 rounded-xl" />
                                <Skeleton className="h-16 rounded-xl" />
                              </div>
                            ) : healthDetail ? (
                              <div className="grid gap-4 md:grid-cols-[1.4fr_1fr_1fr]">
                                <div className="bg-background rounded-xl border p-3">
                                  <div className="mb-2 flex items-center justify-between">
                                    <h4 className="text-muted-foreground text-xs font-semibold uppercase">
                                      Last {healthDetail.samples.length} health samples
                                    </h4>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-2 text-xs"
                                      onClick={() => loadHealth(p.code)}
                                    >
                                      <RefreshCw className="h-3 w-3" /> Refresh
                                    </Button>
                                  </div>
                                  {healthDetail.samples.length > 0 ? (
                                    <HealthSparkline samples={healthDetail.samples} height={80} />
                                  ) : (
                                    <div className="text-muted-foreground flex h-20 items-center justify-center rounded-lg border border-dashed text-xs">
                                      No recent samples — click "Test" to generate one.
                                    </div>
                                  )}
                                </div>
                                <div className="bg-background rounded-xl border p-3">
                                  <h4 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
                                    Health snapshot
                                  </h4>
                                  <dl className="space-y-1.5 text-xs">
                                    <div className="flex justify-between">
                                      <dt className="text-muted-foreground flex items-center gap-1">
                                        <Activity className="h-3 w-3" /> Health
                                      </dt>
                                      <dd
                                        className={`font-medium tabular-nums ${healthTone(healthDetail.healthScore).text}`}
                                      >
                                        {healthDetail.healthScore}/100
                                      </dd>
                                    </div>
                                    <div className="flex justify-between">
                                      <dt className="text-muted-foreground flex items-center gap-1">
                                        <TrendingUp className="h-3 w-3" /> Success
                                      </dt>
                                      <dd className="font-medium tabular-nums">
                                        {healthDetail.successRate}%
                                      </dd>
                                    </div>
                                    <div className="flex justify-between">
                                      <dt className="text-muted-foreground flex items-center gap-1">
                                        <Clock className="h-3 w-3" /> Avg latency
                                      </dt>
                                      <dd className="font-medium tabular-nums">
                                        {healthDetail.avgLatencyMs}ms
                                      </dd>
                                    </div>
                                    <div className="flex justify-between">
                                      <dt className="text-muted-foreground">Samples (24h)</dt>
                                      <dd className="font-medium tabular-nums">
                                        {healthDetail.totalSamples}
                                      </dd>
                                    </div>
                                    <div className="flex justify-between">
                                      <dt className="text-muted-foreground">Circuit state</dt>
                                      <dd>
                                        <Badge
                                          variant="secondary"
                                          className={`text-[10px] ${CIRCUIT_TONE[healthDetail.circuit.state] ?? "bg-muted text-muted-foreground"}`}
                                        >
                                          {healthDetail.circuit.state}
                                        </Badge>
                                      </dd>
                                    </div>
                                  </dl>
                                </div>
                                <div className="bg-background rounded-xl border p-3">
                                  <h4 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
                                    Failure breakdown
                                  </h4>
                                  {Object.keys(healthDetail.failureBreakdown).length > 0 ? (
                                    <div className="space-y-1.5">
                                      {Object.entries(healthDetail.failureBreakdown)
                                        .sort((a, b) => b[1] - a[1])
                                        .map(([code, count]) => (
                                          <div
                                            key={code}
                                            className="flex items-center justify-between text-xs"
                                          >
                                            <Badge
                                              variant="outline"
                                              className="font-mono text-[10px]"
                                            >
                                              {code}
                                            </Badge>
                                            <span className="font-medium text-red-600 tabular-nums dark:text-red-400">
                                              {count}×
                                            </span>
                                          </div>
                                        ))}
                                    </div>
                                  ) : (
                                    <div className="text-muted-foreground flex h-16 items-center justify-center rounded-lg border border-dashed text-xs">
                                      <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                                        <Activity className="h-3 w-3" /> No failures in window
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="text-muted-foreground text-xs">
                                No health data available.
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-14 text-center">
            <Server className="text-muted-foreground h-6 w-6" />
            <p className="mt-3 font-medium">No providers configured</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Add your first provider to get started.
            </p>
          </div>
        )}
      </Card>

      {/* Add provider dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add provider</DialogTitle>
            <DialogDescription>
              Register a new payment provider config. Codes are lowercase and unique.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="p-code">Code</Label>
              <Input
                id="p-code"
                placeholder="e.g. paystack"
                value={addForm.code}
                onChange={(e) =>
                  setAddForm({
                    ...addForm,
                    code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="p-name">Display name</Label>
              <Input
                id="p-name"
                placeholder="Paystack"
                value={addForm.displayName}
                onChange={(e) => setAddForm({ ...addForm, displayName: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="p-prio">Default priority (0-100)</Label>
              <Input
                id="p-prio"
                type="number"
                min={0}
                max={100}
                value={addForm.defaultPriority}
                onChange={(e) =>
                  setAddForm({ ...addForm, defaultPriority: Number(e.target.value) || 0 })
                }
              />
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={addForm.sandbox}
                  onCheckedChange={(v) => setAddForm({ ...addForm, sandbox: v })}
                />
                Sandbox
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={addForm.enabled}
                  onCheckedChange={(v) => setAddForm({ ...addForm, enabled: v })}
                />
                Enabled
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitAdd} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create provider
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rotate credentials dialog */}
      <Dialog open={!!rotateTarget} onOpenChange={(o) => !o && setRotateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate credentials · {rotateTarget?.displayName}</DialogTitle>
            <DialogDescription>
              Secrets are AES-256-GCM encrypted at rest. The previous active version is
              automatically deactivated. Plaintext secrets are never returned.
            </DialogDescription>
          </DialogHeader>
          <div className="scrollbar-thin max-h-[50vh] space-y-3 overflow-y-auto pr-1">
            {rotatePairs.map((pair, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
                <Input
                  placeholder="key (e.g. secret_key)"
                  value={pair.key}
                  onChange={(e) => {
                    const next = [...rotatePairs];
                    next[idx] = { ...pair, key: e.target.value };
                    setRotatePairs(next);
                  }}
                />
                <Input
                  placeholder="value"
                  type="password"
                  value={pair.value}
                  onChange={(e) => {
                    const next = [...rotatePairs];
                    next[idx] = { ...pair, value: e.target.value };
                    setRotatePairs(next);
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={rotatePairs.length === 1}
                  onClick={() => setRotatePairs(rotatePairs.filter((_, i) => i !== idx))}
                >
                  ×
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => setRotatePairs([...rotatePairs, { key: "", value: "" }])}
            >
              <Plus className="h-3.5 w-3.5" /> Add pair
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRotateTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitRotate} disabled={rotating}>
              {rotating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              Rotate now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Provider details dialog */}
      <Dialog open={!!detailsTarget} onOpenChange={(o) => !o && setDetailsTarget(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="text-primary h-4 w-4" />
              {detailsTarget?.displayName}{" "}
              <span className="text-muted-foreground font-mono text-xs">
                ({detailsTarget?.code})
              </span>
            </DialogTitle>
            <DialogDescription>
              Health {detailsTarget?.healthScore}/100 · Circuit {detailsTarget?.circuitState} ·
              Priority {detailsTarget?.defaultPriority}
            </DialogDescription>
          </DialogHeader>
          {detailsLoading ? (
            <div className="space-y-2 py-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="scrollbar-thin max-h-[60vh] space-y-4 overflow-y-auto pr-1">
              <div>
                <h4 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
                  Capabilities ({detailsCaps?.length ?? 0})
                </h4>
                {detailsCaps && detailsCaps.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40">
                        <tr className="text-left">
                          <th className="p-2 font-medium">Contract</th>
                          <th className="p-2 font-medium">Country</th>
                          <th className="p-2 font-medium">Currency</th>
                          <th className="p-2 font-medium">Direction</th>
                          <th className="p-2 font-medium">Fee bps</th>
                          <th className="p-2 font-medium">Settle</th>
                          <th className="p-2 font-medium">Enabled</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailsCaps.map((c) => (
                          <tr key={c.id} className="border-t">
                            <td className="p-2 font-mono">{c.contract}</td>
                            <td className="p-2">{c.country}</td>
                            <td className="p-2">{c.currency}</td>
                            <td className="p-2">
                              <Badge variant="outline" className="text-[10px]">
                                {c.direction}
                              </Badge>
                            </td>
                            <td className="p-2 tabular-nums">{c.feeBps}</td>
                            <td className="p-2 tabular-nums">{c.settleHours}h</td>
                            <td className="p-2">
                              <Badge
                                variant="secondary"
                                className={`text-[10px] ${c.enabled ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}
                              >
                                {c.enabled ? "Yes" : "No"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">No capability rows.</p>
                )}
              </div>
              <div>
                <h4 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
                  Routes ({detailsRoutes?.length ?? 0})
                </h4>
                {detailsRoutes && detailsRoutes.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40">
                        <tr className="text-left">
                          <th className="p-2 font-medium">Contract</th>
                          <th className="p-2 font-medium">Country</th>
                          <th className="p-2 font-medium">Priority</th>
                          <th className="p-2 font-medium">Weight</th>
                          <th className="p-2 font-medium">Canary</th>
                          <th className="p-2 font-medium">Enabled</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailsRoutes.map((r) => (
                          <tr key={r.id} className="border-t">
                            <td className="p-2 font-mono">{r.contract}</td>
                            <td className="p-2">
                              {r.country}/{r.currency}
                            </td>
                            <td className="p-2 tabular-nums">{r.priority}</td>
                            <td className="p-2 tabular-nums">{r.weight}%</td>
                            <td className="p-2 tabular-nums">{r.canaryPercent}%</td>
                            <td className="p-2">
                              <Badge
                                variant="secondary"
                                className={`text-[10px] ${r.enabled ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}
                              >
                                {r.enabled ? "Yes" : "No"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    No explicit routes — provider relies on capabilities + scoring.
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <span className="text-muted-foreground mr-auto text-xs">
              Last updated {detailsTarget ? formatDate(detailsTarget.updatedAt, true) : "—"}
            </span>
            <Button variant="outline" onClick={() => setDetailsTarget(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
