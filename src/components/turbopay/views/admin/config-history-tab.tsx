"use client";

// Admin tab — Config History
// Timeline of ConfigVersion snapshots. Each entry shows scope/version/changedBy/
// changedAt/reason. Actions per version:
//   - "View snapshot" → opens a dialog with the pretty-printed JSON.
//   - "Rollback" → POST /api/admin/config-history/[id]/rollback (restores the
//     snapshot to the live tables and captures a new version recording the rollback).
// Top toolbar:
//   - "Snapshot now" → POST /api/admin/config-history with scope+reason (creates
//     a fresh snapshot of the live tables).

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { History, RefreshCw, Loader2, Eye, RotateCcw, Camera, GitBranch } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/money";
import { prettyJSON } from "./shared";

interface ConfigVersionRow {
  id: string;
  scope: string;
  version: number;
  snapshotJSON: string;
  changedBy: string | null;
  changedAt: string;
  reason: string | null;
}

const SCOPES = [
  "PROVIDERS",
  "CAPABILITIES",
  "ROUTING",
  "FX",
  "FEES",
  "FEATURE_FLAGS",
  "WEBHOOKS",
] as const;

const SCOPE_TONE: Record<string, string> = {
  PROVIDERS: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  CAPABILITIES: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  ROUTING: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  FX: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  FEES: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  FEATURE_FLAGS: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  WEBHOOKS: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
};

export default function ConfigHistoryTab() {
  const [versions, setVersions] = React.useState<ConfigVersionRow[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [snapshotOpen, setSnapshotOpen] = React.useState(false);
  const [snapForm, setSnapForm] = React.useState({ scope: "PROVIDERS", reason: "" });
  const [snapshotting, setSnapshotting] = React.useState(false);

  const [viewTarget, setViewTarget] = React.useState<ConfigVersionRow | null>(null);
  const [rollingBack, setRollingBack] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/config-history", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load config history");
        return;
      }
      const data = await res.json();
      setVersions(data.versions);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function submitSnapshot() {
    setSnapshotting(true);
    try {
      const res = await fetch("/api/admin/config-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: snapForm.scope,
          reason: snapForm.reason.trim() || null,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed");
      }
      const data = await res.json();
      toast.success(`Snapshot created — ${snapForm.scope} v${data.version.version}`);
      setSnapshotOpen(false);
      setSnapForm({ scope: "PROVIDERS", reason: "" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to snapshot");
    } finally {
      setSnapshotting(false);
    }
  }

  async function rollback(v: ConfigVersionRow) {
    if (
      !confirm(
        `Rollback ${v.scope} to v${v.version}? This will OVERWRITE the live ${v.scope} tables with the snapshot contents.`
      )
    )
      return;
    setRollingBack(v.id);
    try {
      const res = await fetch(`/api/admin/config-history/${v.id}/rollback`, {
        method: "POST",
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed");
      }
      const data = await res.json();
      toast.success(
        `${v.scope} rolled back to v${v.version} (restored ${data.restored} rows). New snapshot v${data.newSnapshotVersion} recorded.`
      );
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rollback");
    } finally {
      setRollingBack(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Config version history</h3>
            <p className="text-muted-foreground text-xs">
              Audit trail of every config change with snapshot + rollback capability.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setSnapshotOpen(true)}>
              <Camera className="h-4 w-4" /> Snapshot now
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        {loading && !versions ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : versions && versions.length > 0 ? (
          <ol className="before:bg-border relative space-y-3 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px">
            {versions.map((v) => (
              <li key={v.id} className="relative flex items-start gap-3 pl-10">
                <span
                  className={`absolute top-2 left-0 flex h-8 w-8 items-center justify-center rounded-full ${SCOPE_TONE[v.scope] ?? "bg-muted text-muted-foreground"}`}
                >
                  <GitBranch className="h-3.5 w-3.5" />
                </span>
                <div className="hover:bg-muted/40 min-w-0 flex-1 rounded-xl border p-3 transition-colors">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={`text-[10px] ${SCOPE_TONE[v.scope] ?? ""}`}
                    >
                      {v.scope}
                    </Badge>
                    <span className="text-xs font-semibold tabular-nums">v{v.version}</span>
                    {v.reason && (
                      <span className="text-muted-foreground truncate text-xs">· {v.reason}</span>
                    )}
                    <span
                      className="text-muted-foreground ml-auto text-[10px]"
                      title={formatDate(v.changedAt, true)}
                    >
                      {formatDate(v.changedAt, true)}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Changed by <span className="font-mono">{v.changedBy ?? "system"}</span> ·{" "}
                    {v.snapshotJSON.length.toLocaleString()} bytes snapshot
                  </p>
                  <div className="mt-2 flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => setViewTarget(v)}
                    >
                      <Eye className="h-3.5 w-3.5" /> View
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 border-amber-500/30 px-2 text-xs text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
                      onClick={() => rollback(v)}
                      disabled={rollingBack === v.id}
                    >
                      {rollingBack === v.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      Rollback
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-14 text-center">
            <History className="text-muted-foreground h-6 w-6" />
            <p className="mt-3 font-medium">No config snapshots yet</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Take your first snapshot to start tracking config history.
            </p>
          </div>
        )}
      </Card>

      <Dialog open={snapshotOpen} onOpenChange={setSnapshotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Take config snapshot</DialogTitle>
            <DialogDescription>
              Captures the live state of the selected scope into a versioned snapshot.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Scope</Label>
              <Select
                value={snapForm.scope}
                onValueChange={(v) => setSnapForm({ ...snapForm, scope: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reason (optional)</Label>
              <Textarea
                placeholder="e.g. Before paystack routing weights change"
                value={snapForm.reason}
                onChange={(e) => setSnapForm({ ...snapForm, reason: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSnapshotOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitSnapshot} disabled={snapshotting}>
              {snapshotting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              Capture snapshot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewTarget} onOpenChange={(o) => !o && setViewTarget(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Snapshot · {viewTarget?.scope} v{viewTarget?.version}
            </DialogTitle>
            <DialogDescription>
              {viewTarget?.reason ?? "No reason provided"} · captured{" "}
              {viewTarget ? formatDate(viewTarget.changedAt, true) : ""}
            </DialogDescription>
          </DialogHeader>
          <pre className="scrollbar-thin bg-muted/40 max-h-[60vh] overflow-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed">
            {viewTarget ? prettyJSON(viewTarget.snapshotJSON) : ""}
          </pre>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewTarget(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
