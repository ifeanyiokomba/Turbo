"use client";

// Admin tab — Providers
// Lists every ProviderConfig with live health score, circuit breaker state, and
// capability count. Supports: add provider dialog, inline enable/disable toggle,
// per-row "rotate credentials" dialog (new AES-256-GCM version), and a "details"
// dialog showing the provider's capabilities + routes.

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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Server, Plus, KeyRound, RefreshCw, Loader2, Download, Eye, Activity,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/money";
import {
  exportCsv, CIRCUIT_TONE, HealthBar, ALL_CONTRACTS,
} from "./shared";

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

export default function ProvidersTab() {
  const [providers, setProviders] = React.useState<ProviderRow[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Add provider dialog
  const [addOpen, setAddOpen] = React.useState(false);
  const [addForm, setAddForm] = React.useState({ code: "", displayName: "", sandbox: true, enabled: true, defaultPriority: 50 });
  const [adding, setAdding] = React.useState(false);

  // Rotate credentials dialog
  const [rotateTarget, setRotateTarget] = React.useState<ProviderRow | null>(null);
  const [rotatePairs, setRotatePairs] = React.useState<{ key: string; value: string }[]>([{ key: "", value: "" }]);
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
      if (!res.ok) { toast.error("Failed to load providers"); return; }
      const data = await res.json();
      setProviders(data.providers);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  async function toggleEnabled(p: ProviderRow, next: boolean) {
    // Optimistic update
    setProviders((cur) => cur?.map((x) => x.id === p.id ? { ...x, enabled: next } : x) ?? null);
    try {
      const res = await fetch(`/api/admin/providers/${p.code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${p.displayName} ${next ? "enabled" : "disabled"}`);
    } catch {
      // Revert on failure
      setProviders((cur) => cur?.map((x) => x.id === p.id ? { ...x, enabled: !next } : x) ?? null);
      toast.error("Failed to update provider");
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
      toast.success(`Credentials rotated for ${rotateTarget.displayName} (v${data.credential.version})`);
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
        fetch(`/api/admin/capabilities?providerCode=${encodeURIComponent(p.code)}`, { cache: "no-store" }),
        fetch(`/api/admin/routing?providerCode=${encodeURIComponent(p.code)}`, { cache: "no-store" }),
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
            <p className="text-xs text-muted-foreground">Live health score + circuit breaker state per provider.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
              if (!providers) return;
              exportCsv(
                `turbopay-providers-${new Date().toISOString().slice(0, 10)}.csv`,
                ["Code", "Display Name", "Sandbox", "Enabled", "Health", "Circuit", "Priority", "Capabilities"],
                providers.map((p) => [p.code, p.displayName, p.sandbox ? "Yes" : "No", p.enabled ? "Yes" : "No", p.healthScore, p.circuitState, p.defaultPriority, p.capabilityCount]),
              );
              toast.success("Providers exported");
            }} disabled={!providers || providers.length === 0}>
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

      <Card className="p-5">
        {loading && !providers ? (
          <div className="space-y-2">
            {[0,1,2,3,4].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
          </div>
        ) : providers && providers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-2 font-medium">Provider</th>
                  <th className="pb-2 pr-2 font-medium">Sandbox</th>
                  <th className="pb-2 pr-2 font-medium">Enabled</th>
                  <th className="pb-2 pr-2 font-medium">Health</th>
                  <th className="pb-2 pr-2 font-medium">Circuit</th>
                  <th className="pb-2 pr-2 font-medium">Priority</th>
                  <th className="pb-2 pr-2 font-medium">Capabilities</th>
                  <th className="pb-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => (
                  <tr key={p.id} className="border-t transition-colors hover:bg-muted/40">
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Server className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium">{p.displayName}</p>
                          <p className="text-xs text-muted-foreground font-mono">{p.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 pr-2">
                      <Badge variant="secondary" className={`text-[10px] ${p.sandbox ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}>
                        {p.sandbox ? "Sandbox" : "Live"}
                      </Badge>
                    </td>
                    <td className="py-2 pr-2">
                      <Switch checked={p.enabled} onCheckedChange={(v) => toggleEnabled(p, v)} aria-label="Toggle provider" />
                    </td>
                    <td className="py-2 pr-2"><HealthBar score={p.healthScore} /></td>
                    <td className="py-2 pr-2">
                      <Badge variant="secondary" className={`text-[10px] ${CIRCUIT_TONE[p.circuitState] ?? "bg-muted text-muted-foreground"}`}>
                        {p.circuitState}
                      </Badge>
                      {p.circuitFailures > 0 && (
                        <span className="ml-1 text-[10px] text-muted-foreground">({p.circuitFailures}f)</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-xs tabular-nums">{p.defaultPriority}</td>
                    <td className="py-2 pr-2 text-xs tabular-nums">{p.capabilityCount}</td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => openDetails(p)}>
                          <Eye className="h-3.5 w-3.5" /> View
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => { setRotateTarget(p); setRotatePairs([{ key: "", value: "" }]); }}>
                          <KeyRound className="h-3.5 w-3.5" /> Rotate
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-14 text-center">
            <Server className="h-6 w-6 text-muted-foreground" />
            <p className="mt-3 font-medium">No providers configured</p>
            <p className="mt-1 text-sm text-muted-foreground">Add your first provider to get started.</p>
          </div>
        )}
      </Card>

      {/* Add provider dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add provider</DialogTitle>
            <DialogDescription>Register a new payment provider config. Codes are lowercase and unique.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="p-code">Code</Label>
              <Input id="p-code" placeholder="e.g. paystack" value={addForm.code} onChange={(e) => setAddForm({ ...addForm, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
            </div>
            <div>
              <Label htmlFor="p-name">Display name</Label>
              <Input id="p-name" placeholder="Paystack" value={addForm.displayName} onChange={(e) => setAddForm({ ...addForm, displayName: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="p-prio">Default priority (0-100)</Label>
              <Input id="p-prio" type="number" min={0} max={100} value={addForm.defaultPriority} onChange={(e) => setAddForm({ ...addForm, defaultPriority: Number(e.target.value) || 0 })} />
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={addForm.sandbox} onCheckedChange={(v) => setAddForm({ ...addForm, sandbox: v })} />
                Sandbox
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={addForm.enabled} onCheckedChange={(v) => setAddForm({ ...addForm, enabled: v })} />
                Enabled
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
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
              Secrets are AES-256-GCM encrypted at rest. The previous active version is automatically deactivated. Plaintext secrets are never returned.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[50vh] overflow-y-auto scrollbar-thin pr-1">
            {rotatePairs.map((pair, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
                <Input placeholder="key (e.g. secret_key)" value={pair.key} onChange={(e) => {
                  const next = [...rotatePairs];
                  next[idx] = { ...pair, key: e.target.value };
                  setRotatePairs(next);
                }} />
                <Input placeholder="value" type="password" value={pair.value} onChange={(e) => {
                  const next = [...rotatePairs];
                  next[idx] = { ...pair, value: e.target.value };
                  setRotatePairs(next);
                }} />
                <Button variant="ghost" size="sm" disabled={rotatePairs.length === 1} onClick={() => setRotatePairs(rotatePairs.filter((_, i) => i !== idx))}>×</Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setRotatePairs([...rotatePairs, { key: "", value: "" }])}>
              <Plus className="h-3.5 w-3.5" /> Add pair
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRotateTarget(null)}>Cancel</Button>
            <Button onClick={submitRotate} disabled={rotating}>
              {rotating ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
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
              <Activity className="h-4 w-4 text-primary" />
              {detailsTarget?.displayName} <span className="text-xs text-muted-foreground font-mono">({detailsTarget?.code})</span>
            </DialogTitle>
            <DialogDescription>
              Health {detailsTarget?.healthScore}/100 · Circuit {detailsTarget?.circuitState} · Priority {detailsTarget?.defaultPriority}
            </DialogDescription>
          </DialogHeader>
          {detailsLoading ? (
            <div className="space-y-2 py-4">
              {[0,1,2,3].map((i) => <Skeleton key={i} className="h-10 rounded-xl" />)}
            </div>
          ) : (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto scrollbar-thin pr-1">
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Capabilities ({detailsCaps?.length ?? 0})</h4>
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
                            <td className="p-2"><Badge variant="outline" className="text-[10px]">{c.direction}</Badge></td>
                            <td className="p-2 tabular-nums">{c.feeBps}</td>
                            <td className="p-2 tabular-nums">{c.settleHours}h</td>
                            <td className="p-2">
                              <Badge variant="secondary" className={`text-[10px] ${c.enabled ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                                {c.enabled ? "Yes" : "No"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No capability rows.</p>
                )}
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Routes ({detailsRoutes?.length ?? 0})</h4>
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
                            <td className="p-2">{r.country}/{r.currency}</td>
                            <td className="p-2 tabular-nums">{r.priority}</td>
                            <td className="p-2 tabular-nums">{r.weight}%</td>
                            <td className="p-2 tabular-nums">{r.canaryPercent}%</td>
                            <td className="p-2">
                              <Badge variant="secondary" className={`text-[10px] ${r.enabled ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                                {r.enabled ? "Yes" : "No"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No explicit routes — provider relies on capabilities + scoring.</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <span className="mr-auto text-xs text-muted-foreground">Last updated {detailsTarget ? formatDate(detailsTarget.updatedAt, true) : "—"}</span>
            <Button variant="outline" onClick={() => setDetailsTarget(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
