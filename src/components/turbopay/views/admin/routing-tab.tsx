"use client";

// Admin tab — Routing rules
// Lists ProviderRoute rows. Inline-edit priority/weight/canaryPercent via Slider
// + enabled Switch. Add/delete rows.

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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, RefreshCw, Loader2, Download, Trash2, GitBranch,
} from "lucide-react";
import { toast } from "sonner";
import { exportCsv, ALL_CONTRACTS, COMMON_COUNTRIES, COMMON_CURRENCIES } from "./shared";

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

export default function RoutingTab() {
  const [routes, setRoutes] = React.useState<RouteRow[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [addOpen, setAddOpen] = React.useState(false);
  const [addForm, setAddForm] = React.useState({
    providerCode: "", contract: "CARD_PAYMENT", country: "NG", currency: "NGN",
    priority: 50, weight: 100, canaryPercent: 100, enabled: true,
  });
  const [adding, setAdding] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/routing", { cache: "no-store" });
      if (!res.ok) { toast.error("Failed to load routing rules"); return; }
      const data = await res.json();
      setRoutes(data.routes);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  async function patchRoute(id: string, patch: Partial<RouteRow>) {
    setRoutes((cur) => cur?.map((r) => r.id === id ? { ...r, ...patch } : r) ?? null);
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
    setRoutes((cur) => cur?.filter((x) => x.id !== r.id) ?? null);
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
    if (!addForm.providerCode.trim()) { toast.error("Provider code is required"); return; }
    setAdding(true);
    try {
      const res = await fetch("/api/admin/routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...addForm, providerCode: addForm.providerCode.trim().toLowerCase() }),
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

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Provider routing rules</h3>
            <p className="text-xs text-muted-foreground">Priority/weight/canary sliders apply on next routing-engine refresh.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" disabled={!routes || routes.length === 0} onClick={() => {
              if (!routes) return;
              exportCsv(
                `turbopay-routes-${new Date().toISOString().slice(0, 10)}.csv`,
                ["Contract", "Provider", "Country", "Currency", "Priority", "Weight", "Canary", "Enabled"],
                routes.map((r) => [r.contract, r.providerCode, r.country, r.currency, r.priority, r.weight, r.canaryPercent, r.enabled ? "Yes" : "No"]),
              );
              toast.success("Routes exported");
            }}>
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
            {[0,1,2,3,4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : routes && routes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-2 font-medium">Contract</th>
                  <th className="pb-2 pr-2 font-medium">Provider</th>
                  <th className="pb-2 pr-2 font-medium">Country</th>
                  <th className="pb-2 pr-2 font-medium">Priority</th>
                  <th className="pb-2 pr-2 font-medium">Weight</th>
                  <th className="pb-2 pr-2 font-medium">Canary %</th>
                  <th className="pb-2 pr-2 font-medium">Enabled</th>
                  <th className="pb-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r) => (
                  <tr key={r.id} className="border-t transition-colors hover:bg-muted/40">
                    <td className="py-3 pr-2 align-top">
                      <Badge variant="outline" className="text-[10px] font-mono">{r.contract}</Badge>
                    </td>
                    <td className="py-3 pr-2 align-top font-mono text-xs">{r.providerCode}</td>
                    <td className="py-3 pr-2 align-top text-xs">{r.country}<span className="text-muted-foreground"> / {r.currency}</span></td>
                    <td className="py-3 pr-2 align-top w-44">
                      <div className="flex items-center gap-2">
                        <Slider
                          value={[r.priority]}
                          min={0} max={100} step={1}
                          onValueChange={(v) => setRoutes((cur) => cur?.map((x) => x.id === r.id ? { ...x, priority: v[0] } : x) ?? null)}
                          onValueCommit={(v) => patchRoute(r.id, { priority: v[0] })}
                          className="flex-1"
                        />
                        <span className="w-6 text-xs tabular-nums text-right">{r.priority}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-2 align-top w-44">
                      <div className="flex items-center gap-2">
                        <Slider
                          value={[r.weight]}
                          min={0} max={100} step={1}
                          onValueChange={(v) => setRoutes((cur) => cur?.map((x) => x.id === r.id ? { ...x, weight: v[0] } : x) ?? null)}
                          onValueCommit={(v) => patchRoute(r.id, { weight: v[0] })}
                          className="flex-1"
                        />
                        <span className="w-6 text-xs tabular-nums text-right">{r.weight}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-2 align-top w-44">
                      <div className="flex items-center gap-2">
                        <Slider
                          value={[r.canaryPercent]}
                          min={0} max={100} step={1}
                          onValueChange={(v) => setRoutes((cur) => cur?.map((x) => x.id === r.id ? { ...x, canaryPercent: v[0] } : x) ?? null)}
                          onValueCommit={(v) => patchRoute(r.id, { canaryPercent: v[0] })}
                          className="flex-1"
                        />
                        <span className="w-6 text-xs tabular-nums text-right">{r.canaryPercent}%</span>
                      </div>
                    </td>
                    <td className="py-3 pr-2 align-top">
                      <Switch checked={r.enabled} onCheckedChange={(v) => patchRoute(r.id, { enabled: v })} aria-label="Toggle route" />
                    </td>
                    <td className="py-3 text-right align-top">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600" onClick={() => deleteRoute(r)}>
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
            <GitBranch className="h-6 w-6 text-muted-foreground" />
            <p className="mt-3 font-medium">No routing rules</p>
            <p className="mt-1 text-sm text-muted-foreground">Without explicit routes, the engine relies on capabilities + scoring.</p>
          </div>
        )}
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add routing rule</DialogTitle>
            <DialogDescription>Route a (contract, country, currency) tuple to a specific provider.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Provider code</Label>
              <Input placeholder="paystack" value={addForm.providerCode} onChange={(e) => setAddForm({ ...addForm, providerCode: e.target.value.toLowerCase() })} />
            </div>
            <div>
              <Label>Contract</Label>
              <Select value={addForm.contract} onValueChange={(v) => setAddForm({ ...addForm, contract: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_CONTRACTS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Country</Label>
              <Select value={addForm.country} onValueChange={(v) => setAddForm({ ...addForm, country: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMMON_COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Currency</Label>
              <Select value={addForm.currency} onValueChange={(v) => setAddForm({ ...addForm, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMMON_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority (0-100)</Label>
              <Input type="number" min={0} max={100} value={addForm.priority} onChange={(e) => setAddForm({ ...addForm, priority: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>Weight (0-100)</Label>
              <Input type="number" min={0} max={100} value={addForm.weight} onChange={(e) => setAddForm({ ...addForm, weight: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>Canary percent (0-100)</Label>
              <Input type="number" min={0} max={100} value={addForm.canaryPercent} onChange={(e) => setAddForm({ ...addForm, canaryPercent: Number(e.target.value) || 0 })} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={addForm.enabled} onCheckedChange={(v) => setAddForm({ ...addForm, enabled: v })} /> Enabled
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
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
