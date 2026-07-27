"use client";

// Admin tab — Compliance
// Three sections:
//   1) Top stats (open cases, sanctions entries, recent screenings, recent AML flags).
//   2) ComplianceCase list (assign/escalate/close actions) + recent ScreeningResult.
//   3) "Run sanctions fetch" button — POSTs to /api/cron/sanctions-fetch with the
//      x-cron-secret header.

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  ShieldAlert,
  RefreshCw,
  Loader2,
  Database,
  AlertTriangle,
  CheckCircle2,
  Play,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate, timeAgo } from "@/lib/money";
import { CASE_STATUS_TONE, SEVERITY_TONE } from "./shared";

interface ComplianceCaseRow {
  id: string;
  type: string;
  status: string;
  assignedTo: string | null;
  summary: string;
  metadataJSON: string;
  createdAt: string;
  closedAt: string | null;
  userId: string | null;
  transactionId: string | null;
  user: { fullName: string; username: string; email: string | null } | null;
}

interface ScreeningRow {
  id: string;
  entityType: string;
  entityName: string;
  hit: boolean;
  score: number;
  matchedEntryId: string | null;
  transactionId: string | null;
  userId: string | null;
  screenedAt: string;
  userName: string | null;
  userUsername: string | null;
}

interface AmlFlagRow {
  id: string;
  rule: string;
  severity: string;
  description: string;
  resolved: boolean;
  createdAt: string;
  userId: string;
  userName: string | null;
  userUsername: string | null;
}

interface ComplianceData {
  cases: ComplianceCaseRow[];
  screenings: ScreeningRow[];
  sanctionsCount: number;
  sanctionsByList: { listName: string; count: number }[];
  amlFlags: AmlFlagRow[];
}

export default function ComplianceTab() {
  const [data, setData] = React.useState<ComplianceData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const [patching, setPatching] = React.useState<string | null>(null);

  // Assign dialog
  const [assignTarget, setAssignTarget] = React.useState<ComplianceCaseRow | null>(null);
  const [assignTo, setAssignTo] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/compliance", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load compliance data");
        return;
      }
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function patchCase(
    c: ComplianceCaseRow,
    patch: { status?: string; assignedTo?: string | null }
  ) {
    setPatching(c.id);
    try {
      const res = await fetch(`/api/admin/compliance/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed");
      }
      toast.success(`Case ${c.id.slice(-6)} updated`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update case");
    } finally {
      setPatching(null);
    }
  }

  async function runSanctionsFetch() {
    setFetching(true);
    try {
      const secret = process.env.NEXT_PUBLIC_CRON_SECRET ?? "dev-cron-secret";
      const res = await fetch("/api/cron/sanctions-fetch", {
        method: "POST",
        headers: { "x-cron-secret": secret },
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed");
      }
      const data = await res.json();
      toast.success(
        `Sanctions fetch complete: ${data.upserted} entries upserted (source: ${data.source})`
      );
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to run sanctions fetch");
    } finally {
      setFetching(false);
    }
  }

  function submitAssign() {
    if (!assignTarget) return;
    patchCase(assignTarget, { assignedTo: assignTo.trim() || null });
    setAssignTarget(null);
    setAssignTo("");
  }

  return (
    <div className="space-y-4">
      {/* Top stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs">Open cases</p>
            <ShieldAlert className="h-4 w-4 text-red-500" />
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">{data?.cases.length ?? 0}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs">Sanctions entries</p>
            <Database className="text-primary h-4 w-4" />
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">{data?.sanctionsCount ?? 0}</p>
          {data && data.sanctionsByList.length > 0 && (
            <p className="text-muted-foreground mt-0.5 text-xs">
              {data.sanctionsByList.map((s) => `${s.listName}: ${s.count}`).join(" · ")}
            </p>
          )}
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs">Recent screenings</p>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">{data?.screenings.length ?? 0}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {data ? `${data.screenings.filter((s) => s.hit).length} hits` : ""}
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs">Recent AML flags</p>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">{data?.amlFlags.length ?? 0}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Sanctions list sync</h3>
            <p className="text-muted-foreground text-xs">
              Pulls OFAC SDN + UN + CBN watchlist entries into the screening engine.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button size="sm" className="gap-1.5" onClick={runSanctionsFetch} disabled={fetching}>
              {fetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Run sanctions fetch
            </Button>
          </div>
        </div>
      </Card>

      {/* Open cases */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <ShieldAlert className="text-primary h-5 w-5" />
          <h3 className="text-sm font-semibold">Open compliance cases</h3>
          <Badge variant="secondary" className="ml-auto">
            {data?.cases.length ?? 0}
          </Badge>
        </div>
        {loading && !data ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : data && data.cases.length > 0 ? (
          <ul className="space-y-2">
            {data.cases.map((c) => (
              <li key={c.id} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {c.type}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] ${CASE_STATUS_TONE[c.status] ?? ""}`}
                      >
                        {c.status}
                      </Badge>
                      {c.assignedTo && (
                        <span className="text-muted-foreground text-[10px]">
                          Assigned to {c.assignedTo}
                        </span>
                      )}
                      <span className="text-muted-foreground text-[10px]">
                        · {timeAgo(c.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">{c.summary}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Case #{c.id.slice(-8)} ·{" "}
                      {c.user ? `${c.user.fullName} (@${c.user.username})` : "—"}
                      {c.transactionId && ` · tx ${c.transactionId.slice(-8)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Select
                      value={c.status}
                      onValueChange={(v) => patchCase(c, { status: v })}
                      disabled={patching === c.id}
                    >
                      <SelectTrigger className="h-7 w-32 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OPEN">OPEN</SelectItem>
                        <SelectItem value="IN_REVIEW">IN_REVIEW</SelectItem>
                        <SelectItem value="ESCALATED">ESCALATED</SelectItem>
                        <SelectItem value="CLOSED">CLOSED</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => {
                        setAssignTarget(c);
                        setAssignTo(c.assignedTo ?? "");
                      }}
                      disabled={patching === c.id}
                    >
                      <UserCog className="h-3.5 w-3.5" /> Assign
                    </Button>
                    {patching === c.id && <Loader2 className="h-3 w-3 animate-spin" />}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-14 text-center">
            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            <p className="mt-3 font-medium">No open compliance cases</p>
            <p className="text-muted-foreground mt-1 text-sm">
              All clear — cases will appear here when AML or sanctions rules trip.
            </p>
          </div>
        )}
      </Card>

      {/* Recent screenings */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Database className="text-primary h-5 w-5" />
          <h3 className="text-sm font-semibold">Recent screening results</h3>
          <Badge variant="secondary" className="ml-auto">
            {data?.screenings.length ?? 0}
          </Badge>
        </div>
        {data && data.screenings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left text-xs">
                  <th className="pr-2 pb-2 font-medium">Entity</th>
                  <th className="pr-2 pb-2 font-medium">Type</th>
                  <th className="pr-2 pb-2 font-medium">Score</th>
                  <th className="pr-2 pb-2 font-medium">Result</th>
                  <th className="pr-2 pb-2 font-medium">User/Tx</th>
                  <th className="pb-2 font-medium">Screened</th>
                </tr>
              </thead>
              <tbody>
                {data.screenings.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/40 border-t transition-colors">
                    <td className="py-2 pr-2 text-xs font-medium">{s.entityName}</td>
                    <td className="py-2 pr-2 text-xs">{s.entityType}</td>
                    <td className="py-2 pr-2 text-xs tabular-nums">
                      {(s.score * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 pr-2">
                      <Badge
                        variant="secondary"
                        className={`text-[10px] ${s.hit ? "bg-red-500/15 font-bold text-red-700 dark:text-red-300" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}
                      >
                        {s.hit ? "HIT" : "MISS"}
                      </Badge>
                    </td>
                    <td className="text-muted-foreground py-2 pr-2 text-xs">
                      {s.userName ?? "—"}
                      {s.transactionId && (
                        <span className="font-mono"> · tx{s.transactionId.slice(-6)}</span>
                      )}
                    </td>
                    <td
                      className="text-muted-foreground py-2 text-xs"
                      title={formatDate(s.screenedAt, true)}
                    >
                      {timeAgo(s.screenedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No screenings recorded yet.</p>
        )}
      </Card>

      {/* Recent AML flags */}
      {data && data.amlFlags.length > 0 && (
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h3 className="text-sm font-semibold">Recent AML flags</h3>
            <Badge variant="secondary" className="ml-auto">
              {data.amlFlags.length}
            </Badge>
          </div>
          <ul className="space-y-2">
            {data.amlFlags.slice(0, 10).map((f) => (
              <li key={f.id} className="flex items-center gap-3 rounded-xl border p-3">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${SEVERITY_TONE[f.severity] ?? "bg-muted text-muted-foreground"}`}
                >
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {f.rule
                      .replace(/_/g, " ")
                      .toLowerCase()
                      .replace(/\b\w/g, (c) => c.toUpperCase())}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {f.userName ?? "Unknown"}
                    {f.userUsername ? ` · @${f.userUsername}` : ""} · {f.description}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${SEVERITY_TONE[f.severity] ?? ""}`}
                >
                  {f.severity}
                </Badge>
                <span className="text-muted-foreground text-[10px]">{timeAgo(f.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Dialog open={!!assignTarget} onOpenChange={(o) => !o && setAssignTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign case</DialogTitle>
            <DialogDescription>
              Assign case #{assignTarget?.id.slice(-8)} to an operator.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="operator username or email"
            value={assignTo}
            onChange={(e) => setAssignTo(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitAssign}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
