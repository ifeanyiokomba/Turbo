"use client";

// Admin tab — Capabilities matrix
// Editable grid of ProviderCapability rows. Filter by country/contract.
// Inline-edit enabled (Switch), feeBps, settleHours. Add/delete rows.

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, RefreshCw, Loader2, Download, Trash2, Filter,
} from "lucide-react";
import { toast } from "sonner";
import { exportCsv, ALL_CONTRACTS, COMMON_COUNTRIES, COMMON_CURRENCIES } from "./shared";

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

export default function CapabilitiesTab() {
  const [caps, setCaps] = React.useState<CapabilityRow[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [filterContract, setFilterContract] = React.useState("ALL");
  const [filterCountry, setFilterCountry] = React.useState("ALL");
  const [filterProvider, setFilterProvider] = React.useState("");

  // Add dialog
  const [addOpen, setAddOpen] = React.useState(false);
  const [addForm, setAddForm] = React.useState({
    providerCode: "", contract: "CARD_PAYMENT", country: "NG", currency: "NGN",
    direction: "INBOUND", service: "", minAmountMinor: 0, maxAmountMinor: 0,
    feeBps: 0, feeFixedMinor: 0, settleHours: 0, enabled: true,
  });
  const [adding, setAdding] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterContract !== "ALL") params.set("contract", filterContract);
      if (filterCountry !== "ALL") params.set("country", filterCountry);
      if (filterProvider.trim()) params.set("providerCode", filterProvider.trim());
      const res = await fetch(`/api/admin/capabilities?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) { toast.error("Failed to load capabilities"); return; }
      const data = await res.json();
      setCaps(data.capabilities);
    } finally {
      setLoading(false);
    }
  }, [filterContract, filterCountry, filterProvider]);

  React.useEffect(() => { load(); }, [load]);

  async function patchCap(id: string, patch: Partial<CapabilityRow>) {
    // Optimistic update
    setCaps((cur) => cur?.map((c) => c.id === id ? { ...c, ...patch } : c) ?? null);
    try {
      const res = await fetch(`/api/admin/capabilities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Failed to update capability");
      load(); // reload to revert
    }
  }

  async function deleteCap(c: CapabilityRow) {
    if (!confirm(`Delete capability for ${c.providerCode} · ${c.contract} · ${c.country}?`)) return;
    setCaps((cur) => cur?.filter((x) => x.id !== c.id) ?? null);
    try {
      const res = await fetch(`/api/admin/capabilities/${c.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Capability deleted");
    } catch {
      toast.error("Failed to delete");
      load();
    }
  }

  async function submitAdd() {
    if (!addForm.providerCode.trim()) { toast.error("Provider code is required"); return; }
    setAdding(true);
    try {
      const res = await fetch("/api/admin/capabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...addForm,
          providerCode: addForm.providerCode.trim().toLowerCase(),
          service: addForm.service.trim() || null,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed");
      }
      toast.success("Capability added");
      setAddOpen(false);
      setAddForm({ ...addForm, providerCode: "", service: "" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add capability");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filterContract} onValueChange={setFilterContract}>
            <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All contracts</SelectItem>
              {ALL_CONTRACTS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterCountry} onValueChange={setFilterCountry}>
            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {COMMON_COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Provider code" className="h-8 w-36" value={filterProvider} onChange={(e) => setFilterProvider(e.target.value)} />
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" disabled={!caps || caps.length === 0} onClick={() => {
              if (!caps) return;
              exportCsv(
                `turbopay-capabilities-${new Date().toISOString().slice(0, 10)}.csv`,
                ["Provider", "Contract", "Country", "Currency", "Direction", "Service", "Min", "Max", "Fee bps", "Fee fixed", "Settle h", "Enabled"],
                caps.map((c) => [c.providerCode, c.contract, c.country, c.currency, c.direction, c.service ?? "", c.minAmountMinor, c.maxAmountMinor, c.feeBps, c.feeFixedMinor, c.settleHours, c.enabled ? "Yes" : "No"]),
              );
              toast.success("Capabilities exported");
            }}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add capability
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        {loading && !caps ? (
          <div className="space-y-2">
            {[0,1,2,3,4,5].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
          </div>
        ) : caps && caps.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-2 font-medium">Provider</th>
                  <th className="pb-2 pr-2 font-medium">Contract</th>
                  <th className="pb-2 pr-2 font-medium">Country</th>
                  <th className="pb-2 pr-2 font-medium">Currency</th>
                  <th className="pb-2 pr-2 font-medium">Direction</th>
                  <th className="pb-2 pr-2 font-medium">Min</th>
                  <th className="pb-2 pr-2 font-medium">Max</th>
                  <th className="pb-2 pr-2 font-medium">Fee bps</th>
                  <th className="pb-2 pr-2 font-medium">Settle</th>
                  <th className="pb-2 pr-2 font-medium">Enabled</th>
                  <th className="pb-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {caps.map((c) => (
                  <tr key={c.id} className="border-t transition-colors hover:bg-muted/40">
                    <td className="py-2 pr-2 font-mono text-xs">{c.providerCode}</td>
                    <td className="py-2 pr-2 text-xs">
                      <Badge variant="outline" className="text-[10px]">{c.contract}</Badge>
                      {c.service && <p className="text-[10px] text-muted-foreground">{c.service}</p>}
                    </td>
                    <td className="py-2 pr-2 text-xs">{c.country}</td>
                    <td className="py-2 pr-2 text-xs">{c.currency}</td>
                    <td className="py-2 pr-2 text-xs">
                      <Badge variant="secondary" className={`text-[10px] ${c.direction === "INBOUND" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
                        {c.direction}
                      </Badge>
                    </td>
                    <td className="py-2 pr-2 text-xs tabular-nums">{c.minAmountMinor}</td>
                    <td className="py-2 pr-2 text-xs tabular-nums">{c.maxAmountMinor || "∞"}</td>
                    <td className="py-2 pr-2">
                      <Input
                        type="number"
                        className="h-7 w-16 px-1 text-xs tabular-nums"
                        value={c.feeBps}
                        min={0}
                        max={10000}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(10000, Number(e.target.value) || 0));
                          setCaps((cur) => cur?.map((x) => x.id === c.id ? { ...x, feeBps: v } : x) ?? null);
                        }}
                        onBlur={(e) => patchCap(c.id, { feeBps: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        type="number"
                        className="h-7 w-16 px-1 text-xs tabular-nums"
                        value={c.settleHours}
                        min={0}
                        max={720}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(720, Number(e.target.value) || 0));
                          setCaps((cur) => cur?.map((x) => x.id === c.id ? { ...x, settleHours: v } : x) ?? null);
                        }}
                        onBlur={(e) => patchCap(c.id, { settleHours: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Switch checked={c.enabled} onCheckedChange={(v) => patchCap(c.id, { enabled: v })} aria-label="Toggle capability" />
                    </td>
                    <td className="py-2 text-right">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600" onClick={() => deleteCap(c)}>
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
            <Filter className="h-6 w-6 text-muted-foreground" />
            <p className="mt-3 font-medium">No capabilities found</p>
            <p className="mt-1 text-sm text-muted-foreground">Try a different filter or add a new capability row.</p>
          </div>
        )}
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add capability</DialogTitle>
            <DialogDescription>Each (provider, contract, country, currency, direction, service) tuple is unique.</DialogDescription>
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
              <Label>Direction</Label>
              <Select value={addForm.direction} onValueChange={(v) => setAddForm({ ...addForm, direction: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INBOUND">INBOUND</SelectItem>
                  <SelectItem value="OUTBOUND">OUTBOUND</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Service (optional)</Label>
              <Input placeholder="BILL:ELECTRICITY" value={addForm.service} onChange={(e) => setAddForm({ ...addForm, service: e.target.value })} />
            </div>
            <div>
              <Label>Min amount (minor)</Label>
              <Input type="number" min={0} value={addForm.minAmountMinor} onChange={(e) => setAddForm({ ...addForm, minAmountMinor: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>Max amount (minor, 0 = ∞)</Label>
              <Input type="number" min={0} value={addForm.maxAmountMinor} onChange={(e) => setAddForm({ ...addForm, maxAmountMinor: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>Fee bps (0-10000)</Label>
              <Input type="number" min={0} max={10000} value={addForm.feeBps} onChange={(e) => setAddForm({ ...addForm, feeBps: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>Fee fixed (minor)</Label>
              <Input type="number" min={0} value={addForm.feeFixedMinor} onChange={(e) => setAddForm({ ...addForm, feeFixedMinor: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>Settle hours (0-720)</Label>
              <Input type="number" min={0} max={720} value={addForm.settleHours} onChange={(e) => setAddForm({ ...addForm, settleHours: Number(e.target.value) || 0 })} />
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
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
