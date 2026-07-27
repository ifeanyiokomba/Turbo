"use client";

// Admin tab — Routing rules (enhanced for Task P9-A)
//
// Two panels:
//   1. Geo-routing preview — pick (country, currency, contract, direction) and see
//      the live scored provider pool + the failover chain that the orchestrator
//      would walk. Uses /api/capabilities/enhanced.
//   2. ProviderRoute rules table — priority/weight/canary sliders per row, add/delete.

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  RefreshCw,
  Loader2,
  Download,
  Trash2,
  GitBranch,
  Globe,
  ArrowRight,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import {
  exportCsv,
  ALL_CONTRACTS,
  COMMON_COUNTRIES,
  COMMON_CURRENCIES,
  healthTone,
  CIRCUIT_TONE,
} from "./shared";

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

interface EnhancedProvider {
  providerCode: string;
  score: number;
  successRate: number;
  avgLatencyMs: number;
  health: number;
  circuit: string;
  preferred: boolean;
  fee: { bps: number; fixedMinor: number };
  settleHours: number;
  inFailoverChain: boolean;
}

interface EnhancedContract {
  contract: string;
  available: boolean;
  reason: string;
  primaryProvider: string | null;
  failoverChain: string[];
  geo: { country: string; currency: string };
  preferredInCountry: string[];
  providers: EnhancedProvider[];
}

interface EnhancedResponse {
  country: string;
  currency: string;
  direction: string;
  amountMinor: number;
  countryName: string;
  flagEmoji: string;
  contracts: EnhancedContract[];
  generatedAt: string;
}

export default function RoutingTab() {
  const [routes, setRoutes] = React.useState<RouteRow[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [addOpen, setAddOpen] = React.useState(false);
  const [addForm, setAddForm] = React.useState({
    providerCode: "",
    contract: "CARD_PAYMENT",
    country: "NG",
    currency: "NGN",
    priority: 50,
    weight: 100,
    canaryPercent: 100,
    enabled: true,
  });
  const [adding, setAdding] = React.useState(false);

  // Geo-routing preview state
  const [geoCountry, setGeoCountry] = React.useState("NG");
  const [geoCurrency, setGeoCurrency] = React.useState("NGN");
  const [geoContract, setGeoContract] = React.useState("CARD_PAYMENT");
  const [geoDirection, setGeoDirection] = React.useState<"INBOUND" | "OUTBOUND">("INBOUND");
  const [enhanced, setEnhanced] = React.useState<EnhancedResponse | null>(null);
  const [enhancedLoading, setEnhancedLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/routing", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load routing rules");
        return;
      }
      const data = await res.json();
      setRoutes(data.routes);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEnhanced = React.useCallback(async () => {
    setEnhancedLoading(true);
    try {
      const params = new URLSearchParams({
        country: geoCountry,
        currency: geoCurrency,
        contract: geoContract,
        direction: geoDirection,
        amountMinor: "100000",
      });
      const res = await fetch(`/api/capabilities/enhanced?${params}`, { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load enhanced capabilities");
        return;
      }
      const data: EnhancedResponse = await res.json();
      setEnhanced(data);
    } finally {
      setEnhancedLoading(false);
    }
  }, [geoCountry, geoCurrency, geoContract, geoDirection]);

  React.useEffect(() => {
    load();
  }, [load]);
  React.useEffect(() => {
    loadEnhanced();
  }, [loadEnhanced]);

  async function patchRoute(id: string, patch: Partial<RouteRow>) {
    setRoutes((cur) => cur?.map((r) => (r.id === id ? { ...r, ...patch } : r)) ?? null);
    try {
      const res = await fetch(`/api/admin/routing/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Failed to update route");
      load();
    }
  }

  async function deleteRoute(r: RouteRow) {
    if (!confirm(`Delete route for ${r.providerCode} · ${r.contract} · ${r.country}?`)) return;
    setRoutes((cur) => cur?.filter((x) => x.id === r.id) ?? null);
    try {
      const res = await fetch(`/api/admin/routing/${r.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Route deleted");
    } catch {
      toast.error("Failed to delete");
      load();
    }
  }

  async function submitAdd() {
    if (!addForm.providerCode.trim()) {
      toast.error("Provider code is required");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/admin/routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...addForm,
          providerCode: addForm.providerCode.trim().toLowerCase(),
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed");
      }
      toast.success("Route created");
      setAddOpen(false);
      setAddForm({ ...addForm, providerCode: "" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add route");
    } finally {
      setAdding(false);
    }
  }

  const activeContract = enhanced?.contracts.find((c) => c.contract === geoContract);

  return (
    <div className="space-y-4">
      {/* Geo-routing preview */}
      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Globe className="text-primary h-4 w-4" /> Geo-routing preview
            </h3>
            <p className="text-muted-foreground text-xs">
              Live routing decision for the chosen (country, currency, contract). Shows the scored
              provider pool and the failover chain the orchestrator would walk.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={loadEnhanced}
            disabled={enhancedLoading}
          >
            {enhancedLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}{" "}
            Refresh
          </Button>
        </div>

        <div className="mb-4 grid gap-2 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <Label className="text-muted-foreground text-[10px] uppercase">Country</Label>
            <Select value={geoCountry} onValueChange={setGeoCountry}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMON_COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-muted-foreground text-[10px] uppercase">Currency</Label>
            <Select value={geoCurrency} onValueChange={setGeoCurrency}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMON_CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-muted-foreground text-[10px] uppercase">Contract</Label>
            <Select value={geoContract} onValueChange={setGeoContract}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_CONTRACTS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-muted-foreground text-[10px] uppercase">Direction</Label>
            <Select
              value={geoDirection}
              onValueChange={(v) => setGeoDirection(v as "INBOUND" | "OUTBOUND")}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INBOUND">INBOUND</SelectItem>
                <SelectItem value="OUTBOUND">OUTBOUND</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {enhancedLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        ) : !activeContract ? (
          <div className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
            No routing decision for this combination.
          </div>
        ) : !activeContract.available ? (
          <div className="bg-muted/20 rounded-xl border border-dashed p-4 text-sm">
            <p className="font-medium text-amber-600 dark:text-amber-400">No provider available</p>
            <p className="text-muted-foreground mt-1 text-xs">
              No capability row matches this (country, currency, contract, direction).
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Failover chain visualization */}
            <div className="bg-muted/20 rounded-xl border p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h4 className="text-muted-foreground text-[10px] font-semibold uppercase">
                  Failover chain
                </h4>
                <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">
                  {activeContract.failoverChain.length} step
                  {activeContract.failoverChain.length === 1 ? "" : "s"}
                </Badge>
                {activeContract.preferredInCountry.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="gap-1 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
                  >
                    <Star className="h-2.5 w-2.5" /> Preferred:{" "}
                    {activeContract.preferredInCountry.join(", ")}
                  </Badge>
                )}
              </div>
              {activeContract.failoverChain.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  {activeContract.failoverChain.map((code, idx) => (
                    <React.Fragment key={code + idx}>
                      <div className="bg-background flex items-center gap-2 rounded-lg border px-3 py-2">
                        <span
                          className={`h-2 w-2 rounded-full ${idx === 0 ? "bg-emerald-500" : "bg-amber-500"}`}
                        />
                        <div>
                          <p className="font-mono text-xs font-medium">{code}</p>
                          <p className="text-muted-foreground text-[10px]">
                            {idx === 0 ? "primary" : `failover #${idx}`}
                          </p>
                        </div>
                      </div>
                      {idx < activeContract.failoverChain.length - 1 && (
                        <ArrowRight className="text-muted-foreground h-3 w-3" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">
                  No alternatives — single-provider routing.
                </p>
              )}
            </div>

            {/* Provider pool table */}
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-2 font-medium">Provider</th>
                    <th className="p-2 font-medium">Score</th>
                    <th className="p-2 font-medium">Health</th>
                    <th className="p-2 font-medium">Circuit</th>
                    <th className="p-2 font-medium">Success</th>
                    <th className="p-2 font-medium">Latency</th>
                    <th className="p-2 font-medium">Fee</th>
                    <th className="p-2 font-medium">Settle</th>
                    <th className="p-2 font-medium">Preferred</th>
                    <th className="p-2 font-medium">In chain</th>
                  </tr>
                </thead>
                <tbody>
                  {activeContract.providers.map((p) => {
                    const tone = healthTone(p.health);
                    return (
                      <tr key={p.providerCode} className="border-t">
                        <td className="p-2 font-mono">{p.providerCode}</td>
                        <td className="p-2 font-semibold tabular-nums">{p.score}</td>
                        <td className="p-2">
                          <div className="flex items-center gap-1.5">
                            <span className={`h-2 w-2 rounded-full ${tone.bar}`} />
                            <span className={`tabular-nums ${tone.text}`}>{p.health}</span>
                          </div>
                        </td>
                        <td className="p-2">
                          <Badge
                            variant="secondary"
                            className={`text-[10px] ${CIRCUIT_TONE[p.circuit] ?? "bg-muted text-muted-foreground"}`}
                          >
                            {p.circuit}
                          </Badge>
                        </td>
                        <td className="p-2 tabular-nums">{p.successRate}%</td>
                        <td className="p-2 tabular-nums">{p.avgLatencyMs}ms</td>
                        <td className="p-2 tabular-nums">
                          {p.fee.bps > 0 ? `${p.fee.bps}bps` : "—"}
                          {p.fee.fixedMinor > 0 ? `+${p.fee.fixedMinor}` : ""}
                        </td>
                        <td className="p-2 tabular-nums">{p.settleHours}h</td>
                        <td className="p-2">
                          {p.preferred ? (
                            <Badge
                              variant="secondary"
                              className="gap-1 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
                            >
                              <Star className="h-2.5 w-2.5" /> Yes
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2">
                          {p.inFailoverChain ? (
                            <Badge
                              variant="secondary"
                              className="bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400"
                            >
                              ✓
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Provider routing rules</h3>
            <p className="text-muted-foreground text-xs">
              Priority/weight/canary sliders apply on next routing-engine refresh.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!routes || routes.length === 0}
              onClick={() => {
                if (!routes) return;
                exportCsv(
                  `turbopay-routes-${new Date().toISOString().slice(0, 10)}.csv`,
                  [
                    "Contract",
                    "Provider",
                    "Country",
                    "Currency",
                    "Priority",
                    "Weight",
                    "Canary",
                    "Enabled",
                  ],
                  routes.map((r) => [
                    r.contract,
                    r.providerCode,
                    r.country,
                    r.currency,
                    r.priority,
                    r.weight,
                    r.canaryPercent,
                    r.enabled ? "Yes" : "No",
                  ])
                );
                toast.success("Routes exported");
              }}
            >
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add route
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        {loading && !routes ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : routes && routes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="text-muted-foreground text-left text-xs">
                  <th className="pr-2 pb-2 font-medium">Contract</th>
                  <th className="pr-2 pb-2 font-medium">Provider</th>
                  <th className="pr-2 pb-2 font-medium">Country</th>
                  <th className="pr-2 pb-2 font-medium">Priority</th>
                  <th className="pr-2 pb-2 font-medium">Weight</th>
                  <th className="pr-2 pb-2 font-medium">Canary %</th>
                  <th className="pr-2 pb-2 font-medium">Enabled</th>
                  <th className="pb-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/40 border-t transition-colors">
                    <td className="py-3 pr-2 align-top">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {r.contract}
                      </Badge>
                    </td>
                    <td className="py-3 pr-2 align-top font-mono text-xs">{r.providerCode}</td>
                    <td className="py-3 pr-2 align-top text-xs">
                      {r.country}
                      <span className="text-muted-foreground"> / {r.currency}</span>
                    </td>
                    <td className="w-44 py-3 pr-2 align-top">
                      <div className="flex items-center gap-2">
                        <Slider
                          value={[r.priority]}
                          min={0}
                          max={100}
                          step={1}
                          onValueChange={(v) =>
                            setRoutes(
                              (cur) =>
                                cur?.map((x) => (x.id === r.id ? { ...x, priority: v[0] } : x)) ??
                                null
                            )
                          }
                          onValueCommit={(v) => patchRoute(r.id, { priority: v[0] })}
                          className="flex-1"
                        />
                        <span className="w-6 text-right text-xs tabular-nums">{r.priority}</span>
                      </div>
                    </td>
                    <td className="w-44 py-3 pr-2 align-top">
                      <div className="flex items-center gap-2">
                        <Slider
                          value={[r.weight]}
                          min={0}
                          max={100}
                          step={1}
                          onValueChange={(v) =>
                            setRoutes(
                              (cur) =>
                                cur?.map((x) => (x.id === r.id ? { ...x, weight: v[0] } : x)) ??
                                null
                            )
                          }
                          onValueCommit={(v) => patchRoute(r.id, { weight: v[0] })}
                          className="flex-1"
                        />
                        <span className="w-6 text-right text-xs tabular-nums">{r.weight}</span>
                      </div>
                    </td>
                    <td className="w-44 py-3 pr-2 align-top">
                      <div className="flex items-center gap-2">
                        <Slider
                          value={[r.canaryPercent]}
                          min={0}
                          max={100}
                          step={1}
                          onValueChange={(v) =>
                            setRoutes(
                              (cur) =>
                                cur?.map((x) =>
                                  x.id === r.id ? { ...x, canaryPercent: v[0] } : x
                                ) ?? null
                            )
                          }
                          onValueCommit={(v) => patchRoute(r.id, { canaryPercent: v[0] })}
                          className="flex-1"
                        />
                        <span className="w-6 text-right text-xs tabular-nums">
                          {r.canaryPercent}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-2 align-top">
                      <Switch
                        checked={r.enabled}
                        onCheckedChange={(v) => patchRoute(r.id, { enabled: v })}
                        aria-label="Toggle route"
                      />
                    </td>
                    <td className="py-3 text-right align-top">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-red-600"
                        onClick={() => deleteRoute(r)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-14 text-center">
            <GitBranch className="text-muted-foreground h-6 w-6" />
            <p className="mt-3 font-medium">No routing rules</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Without explicit routes, the engine relies on capabilities + scoring.
            </p>
          </div>
        )}
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add routing rule</DialogTitle>
            <DialogDescription>
              Route a (contract, country, currency) tuple to a specific provider.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Provider code</Label>
              <Input
                placeholder="paystack"
                value={addForm.providerCode}
                onChange={(e) =>
                  setAddForm({ ...addForm, providerCode: e.target.value.toLowerCase() })
                }
              />
            </div>
            <div>
              <Label>Contract</Label>
              <Select
                value={addForm.contract}
                onValueChange={(v) => setAddForm({ ...addForm, contract: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_CONTRACTS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Country</Label>
              <Select
                value={addForm.country}
                onValueChange={(v) => setAddForm({ ...addForm, country: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_COUNTRIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Currency</Label>
              <Select
                value={addForm.currency}
                onValueChange={(v) => setAddForm({ ...addForm, currency: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority (0-100)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={addForm.priority}
                onChange={(e) => setAddForm({ ...addForm, priority: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Weight (0-100)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={addForm.weight}
                onChange={(e) => setAddForm({ ...addForm, weight: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Canary percent (0-100)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={addForm.canaryPercent}
                onChange={(e) =>
                  setAddForm({ ...addForm, canaryPercent: Number(e.target.value) || 0 })
                }
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={addForm.enabled}
                  onCheckedChange={(v) => setAddForm({ ...addForm, enabled: v })}
                />{" "}
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
              Add route
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
