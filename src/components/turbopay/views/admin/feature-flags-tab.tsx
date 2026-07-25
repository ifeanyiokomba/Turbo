"use client";

// Admin tab — Feature Flags
// Lists FeatureFlag rows. Inline-edit enabled (Switch) + value (depends on type:
//   BOOL = Switch, PERCENT = Slider, VARIANT = text Input).
// Per-flag override management: list + "Add override" dialog (USER | COUNTRY |
// KYC_TIER target + value).
// Add/delete flags.

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
  Plus, RefreshCw, Loader2, Trash2, Flag, ChevronDown, ChevronRight, Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/money";

interface FlagOverride {
  id: string;
  flagKey: string;
  targetType: string;
  targetId: string;
  valueJSON: string;
  createdAt: string;
}

interface FeatureFlagRow {
  id: string;
  key: string;
  description: string | null;
  type: string;
  valueJSON: string;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
  overrides: FlagOverride[];
}

export default function FeatureFlagsTab() {
  const [flags, setFlags] = React.useState<FeatureFlagRow[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const [addOpen, setAddOpen] = React.useState(false);
  const [addForm, setAddForm] = React.useState({
    key: "", description: "", type: "BOOL",
    boolValue: true, percentValue: 0, variantValue: "default", enabled: true,
  });
  const [adding, setAdding] = React.useState(false);

  // Override dialog
  const [overrideTarget, setOverrideTarget] = React.useState<FeatureFlagRow | null>(null);
  const [overrideForm, setOverrideForm] = React.useState({ targetType: "USER", targetId: "", value: "" });
  const [addingOverride, setAddingOverride] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/feature-flags", { cache: "no-store" });
      if (!res.ok) { toast.error("Failed to load feature flags"); return; }
      const data = await res.json();
      setFlags(data.flags);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  function parseValue(f: FeatureFlagRow): boolean | number | string {
    try {
      return JSON.parse(f.valueJSON);
    } catch {
      return f.type === "BOOL" ? false : f.type === "PERCENT" ? 0 : "";
    }
  }

  async function patchFlag(f: FeatureFlagRow, patch: Partial<Pick<FeatureFlagRow, "enabled" | "valueJSON">> & { override?: { targetType: string; targetId: string; valueJSON: string } }) {
    const body: Record<string, unknown> = { ...patch };
    const res = await fetch(`/api/admin/feature-flags/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error ?? "Failed");
    }
    return res.json();
  }

  async function toggleEnabled(f: FeatureFlagRow, next: boolean) {
    setFlags((cur) => cur?.map((x) => x.id === f.id ? { ...x, enabled: next } : x) ?? null);
    try {
      await patchFlag(f, { enabled: next });
      toast.success(`Flag "${f.key}" ${next ? "enabled" : "disabled"}`);
    } catch (e) {
      setFlags((cur) => cur?.map((x) => x.id === f.id ? { ...x, enabled: !next } : x) ?? null);
      toast.error(e instanceof Error ? e.message : "Failed to update flag");
    }
  }

  async function updateValue(f: FeatureFlagRow, value: boolean | number | string) {
    const valueJSON = JSON.stringify(value);
    setFlags((cur) => cur?.map((x) => x.id === f.id ? { ...x, valueJSON } : x) ?? null);
    try {
      await patchFlag(f, { valueJSON });
      toast.success(`Flag "${f.key}" value saved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update value");
      load();
    }
  }

  async function deleteFlag(f: FeatureFlagRow) {
    if (!confirm(`Delete flag "${f.key}"? This also removes all overrides.`)) return;
    setFlags((cur) => cur?.filter((x) => x.id !== f.id) ?? null);
    try {
      const res = await fetch(`/api/admin/feature-flags/${f.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(`Flag "${f.key}" deleted`);
    } catch {
      toast.error("Failed to delete flag");
      load();
    }
  }

  async function deleteOverride(f: FeatureFlagRow, overrideId: string) {
    setFlags((cur) => cur?.map((x) => x.id === f.id ? { ...x, overrides: x.overrides.filter((o) => o.id !== overrideId) } : x) ?? null);
    try {
      await fetch(`/api/admin/feature-flags/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteOverrideId: overrideId }),
      });
      toast.success("Override removed");
    } catch {
      toast.error("Failed to remove override");
      load();
    }
  }

  async function submitAdd() {
    if (!addForm.key.trim()) { toast.error("Flag key is required"); return; }
    const key = addForm.key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    let valueJSON: string;
    if (addForm.type === "BOOL") valueJSON = JSON.stringify(addForm.boolValue);
    else if (addForm.type === "PERCENT") valueJSON = JSON.stringify(Math.max(0, Math.min(1, addForm.percentValue / 100)));
    else valueJSON = JSON.stringify(addForm.variantValue);
    setAdding(true);
    try {
      const res = await fetch("/api/admin/feature-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          description: addForm.description.trim() || null,
          type: addForm.type,
          valueJSON,
          enabled: addForm.enabled,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed");
      }
      toast.success(`Flag "${key}" created`);
      setAddOpen(false);
      setAddForm({ ...addForm, key: "", description: "" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create flag");
    } finally {
      setAdding(false);
    }
  }

  async function submitOverride() {
    if (!overrideTarget) return;
    if (!overrideForm.targetId.trim()) { toast.error("Target ID is required"); return; }
    setAddingOverride(true);
    try {
      let valueJSON: string;
      if (overrideTarget.type === "BOOL") valueJSON = JSON.stringify(overrideForm.value === "true");
      else if (overrideTarget.type === "PERCENT") valueJSON = JSON.stringify(Math.max(0, Math.min(1, Number(overrideForm.value) / 100)));
      else valueJSON = JSON.stringify(overrideForm.value);
      await patchFlag(overrideTarget, {
        override: {
          targetType: overrideForm.targetType,
          targetId: overrideForm.targetId.trim(),
          valueJSON,
        },
      });
      toast.success("Override added");
      setOverrideTarget(null);
      setOverrideForm({ targetType: "USER", targetId: "", value: "" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add override");
    } finally {
      setAddingOverride(false);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Feature flags</h3>
            <p className="text-xs text-muted-foreground">Toggle platform behavior. Per-user/country/KYC-tier overrides supported.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add flag
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        {loading && !flags ? (
          <div className="space-y-2">
            {[0,1,2,3,4].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
          </div>
        ) : flags && flags.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-2 font-medium w-8"></th>
                  <th className="pb-2 pr-2 font-medium">Key</th>
                  <th className="pb-2 pr-2 font-medium">Type</th>
                  <th className="pb-2 pr-2 font-medium">Value</th>
                  <th className="pb-2 pr-2 font-medium">Enabled</th>
                  <th className="pb-2 pr-2 font-medium">Overrides</th>
                  <th className="pb-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {flags.map((f) => {
                  const isOpen = expanded.has(f.id);
                  const val = parseValue(f);
                  return (
                    <React.Fragment key={f.id}>
                      <tr className="border-t transition-colors hover:bg-muted/40">
                        <td className="py-2 pr-2">
                          {f.overrides.length > 0 && (
                            <button onClick={() => toggleExpand(f.id)} className="text-muted-foreground hover:text-foreground">
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          )}
                        </td>
                        <td className="py-2 pr-2">
                          <p className="font-mono text-xs font-semibold">{f.key}</p>
                          {f.description && <p className="text-[10px] text-muted-foreground">{f.description}</p>}
                        </td>
                        <td className="py-2 pr-2">
                          <Badge variant="outline" className="text-[10px]">{f.type}</Badge>
                        </td>
                        <td className="py-2 pr-2">
                          {f.type === "BOOL" ? (
                            <Switch
                              checked={val as boolean}
                              onCheckedChange={(v) => updateValue(f, v)}
                              aria-label="Flag value"
                            />
                          ) : f.type === "PERCENT" ? (
                            <div className="flex items-center gap-2 w-44">
                              <Slider
                                value={[Math.round((val as number) * 100)]}
                                min={0} max={100} step={1}
                                onValueCommit={(v) => updateValue(f, v[0] / 100)}
                                className="flex-1"
                              />
                              <span className="w-8 text-xs tabular-nums text-right">{Math.round((val as number) * 100)}%</span>
                            </div>
                          ) : (
                            <Input
                              className="h-7 w-32 text-xs"
                              defaultValue={val as string}
                              onBlur={(e) => updateValue(f, e.target.value)}
                            />
                          )}
                        </td>
                        <td className="py-2 pr-2">
                          <Switch checked={f.enabled} onCheckedChange={(v) => toggleEnabled(f, v)} aria-label="Toggle flag" />
                        </td>
                        <td className="py-2 pr-2 text-xs">
                          {f.overrides.length > 0 ? (
                            <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400">{f.overrides.length}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => { setOverrideTarget(f); setOverrideForm({ targetType: "USER", targetId: "", value: "" }); }}>
                              <Settings2 className="h-3.5 w-3.5" /> Override
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600" onClick={() => deleteFlag(f)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {isOpen && f.overrides.length > 0 && (
                        <tr className="bg-muted/30">
                          <td colSpan={7} className="py-2 px-6">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-muted-foreground">
                                  <th className="pb-1 pr-2 font-medium">Target type</th>
                                  <th className="pb-1 pr-2 font-medium">Target ID</th>
                                  <th className="pb-1 pr-2 font-medium">Value</th>
                                  <th className="pb-1 font-medium text-right">Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {f.overrides.map((o) => (
                                  <tr key={o.id} className="border-t">
                                    <td className="py-1 pr-2"><Badge variant="outline" className="text-[10px]">{o.targetType}</Badge></td>
                                    <td className="py-1 pr-2 font-mono">{o.targetId}</td>
                                    <td className="py-1 pr-2 font-mono">{o.valueJSON}</td>
                                    <td className="py-1 text-right">
                                      <Button size="sm" variant="ghost" className="h-6 px-2 text-red-600" onClick={() => deleteOverride(f, o.id)}>
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
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
            <Flag className="h-6 w-6 text-muted-foreground" />
            <p className="mt-3 font-medium">No feature flags configured</p>
            <p className="mt-1 text-sm text-muted-foreground">Add your first flag to start gating features.</p>
          </div>
        )}
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add feature flag</DialogTitle>
            <DialogDescription>BOOL = on/off · PERCENT = 0-100% rollout · VARIANT = pick a string bucket.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Key</Label>
              <Input placeholder="NEW_CHECKOUT_FLOW" value={addForm.key} onChange={(e) => setAddForm({ ...addForm, key: e.target.value })} />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input placeholder="What does this flag control?" value={addForm.description} onChange={(e) => setAddForm({ ...addForm, description: e.target.value })} />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={addForm.type} onValueChange={(v) => setAddForm({ ...addForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOOL">BOOL</SelectItem>
                  <SelectItem value="PERCENT">PERCENT</SelectItem>
                  <SelectItem value="VARIANT">VARIANT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Value</Label>
              {addForm.type === "BOOL" ? (
                <Select value={addForm.boolValue ? "true" : "false"} onValueChange={(v) => setAddForm({ ...addForm, boolValue: v === "true" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">true</SelectItem>
                    <SelectItem value="false">false</SelectItem>
                  </SelectContent>
                </Select>
              ) : addForm.type === "PERCENT" ? (
                <div className="flex items-center gap-2">
                  <Slider value={[addForm.percentValue]} min={0} max={100} step={1} onValueChange={(v) => setAddForm({ ...addForm, percentValue: v[0] })} className="flex-1" />
                  <span className="w-10 text-xs tabular-nums text-right">{addForm.percentValue}%</span>
                </div>
              ) : (
                <Input placeholder="variantA" value={addForm.variantValue} onChange={(e) => setAddForm({ ...addForm, variantValue: e.target.value })} />
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={addForm.enabled} onCheckedChange={(v) => setAddForm({ ...addForm, enabled: v })} /> Enabled
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={submitAdd} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create flag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!overrideTarget} onOpenChange={(o) => !o && setOverrideTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add override · {overrideTarget?.key}</DialogTitle>
            <DialogDescription>Override this flag for a specific user, country, or KYC tier.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Target type</Label>
              <Select value={overrideForm.targetType} onValueChange={(v) => setOverrideForm({ ...overrideForm, targetType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">USER</SelectItem>
                  <SelectItem value="COUNTRY">COUNTRY</SelectItem>
                  <SelectItem value="KYC_TIER">KYC_TIER</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target ID</Label>
              <Input
                placeholder={overrideForm.targetType === "USER" ? "user_abc123" : overrideForm.targetType === "COUNTRY" ? "NG" : "2"}
                value={overrideForm.targetId}
                onChange={(e) => setOverrideForm({ ...overrideForm, targetId: e.target.value })}
              />
            </div>
            <div>
              <Label>Value</Label>
              {overrideTarget?.type === "BOOL" ? (
                <Select value={overrideForm.value || "false"} onValueChange={(v) => setOverrideForm({ ...overrideForm, value: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">true</SelectItem>
                    <SelectItem value="false">false</SelectItem>
                  </SelectContent>
                </Select>
              ) : overrideTarget?.type === "PERCENT" ? (
                <Input type="number" min={0} max={100} placeholder="50" value={overrideForm.value} onChange={(e) => setOverrideForm({ ...overrideForm, value: e.target.value })} />
              ) : (
                <Input placeholder="variantA" value={overrideForm.value} onChange={(e) => setOverrideForm({ ...overrideForm, value: e.target.value })} />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideTarget(null)}>Cancel</Button>
            <Button onClick={submitOverride} disabled={addingOverride}>
              {addingOverride ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Add override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
