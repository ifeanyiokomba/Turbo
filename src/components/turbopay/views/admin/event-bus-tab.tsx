"use client";

// TurboCore — TEB (TurboCore Event Bus) Admin Tab (Chapter 9)
//
// The nervous system of TurboPay. This tab shows:
//   - Event Registry (canonical contracts for all event types)
//   - Event Streams (separate queues per domain)
//   - Live Monitoring (events/sec, queue length, consumer lag, DLQ)
//   - Dead Letter Queue inspector (replay / purge)
//   - Event Replay engine
//   - Recent events feed

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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
  Zap,
  Activity,
  AlertCircle,
  RefreshCw,
  RotateCw,
  Trash2,
  Play,
  Radio,
  Server,
  Database,
  Bell,
  Shield,
  GitBranch,
  Layers,
  Search,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

interface RegistryData {
  registry: {
    totalEvents: number;
    byCategory: Record<string, number>;
    byStream: Record<string, number>;
    byPriority: Record<string, number>;
    byClassification: Record<string, number>;
    totalConsumers: number;
    totalProducers: number;
    contracts: Array<{
      eventType: string;
      name: string;
      category: string;
      stream: string;
      priority: string;
      classification: string;
      owner: string;
      producer: string;
      consumers: string[];
      version: string;
      ordered: boolean;
      retention: { policy: string; value?: number; reason: string };
    }>;
  };
  streams: Array<{ id: string; name: string; description: string; orderingRequired: boolean }>;
  subscribers: Array<{
    id: string;
    name: string;
    stream: string;
    eventTypes: string | string[];
    priority: string;
    maxRetries: number;
  }>;
  monitoring: {
    published: number;
    processed: number;
    failed: number;
    queueLength: number;
    deadLetterCount: number;
    inboxSize: number;
    subscriberCount: number;
    queueByStream: Record<string, number>;
    recentEvents: Array<Record<string, unknown>>;
  };
  recentEvents: Array<Record<string, unknown>>;
  deadLetters: Array<{
    id: string;
    event: Record<string, unknown>;
    subscriberName: string;
    attempts: number;
    lastError: string;
    deadLetteredAt: string;
  }>;
}

const CATEGORY_COLORS: Record<string, string> = {
  BUSINESS: "bg-blue-100 text-blue-700",
  FINANCIAL: "bg-emerald-100 text-emerald-700",
  PROVIDER: "bg-cyan-100 text-cyan-700",
  COMPLIANCE: "bg-fuchsia-100 text-fuchsia-700",
  SYSTEM: "bg-slate-100 text-slate-700",
  ANALYTICS: "bg-lime-100 text-lime-700",
  SECURITY: "bg-rose-100 text-rose-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-rose-100 text-rose-700 border-rose-300",
  HIGH: "bg-amber-100 text-amber-700 border-amber-300",
  MEDIUM: "bg-blue-100 text-blue-700 border-blue-300",
  LOW: "bg-slate-100 text-slate-700 border-slate-300",
};

const CLASSIFICATION_COLORS: Record<string, string> = {
  PUBLIC: "bg-emerald-100 text-emerald-700",
  INTERNAL: "bg-blue-100 text-blue-700",
  CONFIDENTIAL: "bg-amber-100 text-amber-700",
  RESTRICTED: "bg-rose-100 text-rose-700",
};

type SubTab = "overview" | "registry" | "streams" | "monitoring" | "dlq" | "replay";

export default function EventBusTab() {
  const [data, setData] = React.useState<RegistryData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [subTab, setSubTab] = React.useState<SubTab>("overview");
  const [expandedContract, setExpandedContract] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [filterCategory, setFilterCategory] = React.useState("ALL");
  const [filterStream, setFilterStream] = React.useState("ALL");
  const [replaying, setReplaying] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/event-bus", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load event bus data");
        return;
      }
      const d = await res.json();
      setData(d);
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleDlqAction = React.useCallback(
    async (action: string, entryId?: string) => {
      try {
        const res = await fetch("/api/admin/event-bus/dlq", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, entryId }),
        });
        const d = await res.json();
        if (d.success) {
          toast.success(d.message);
          load();
        } else {
          toast.error(d.message);
        }
      } catch {
        toast.error("Network error");
      }
    },
    [load]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-20 w-full" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const { registry: reg, monitoring: mon } = data;

  const subTabs: Array<{
    id: SubTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "registry", label: "Registry", icon: Database },
    { id: "streams", label: "Streams", icon: Layers },
    { id: "monitoring", label: "Monitoring", icon: Zap },
    { id: "dlq", label: "Dead Letters", icon: AlertCircle },
    { id: "replay", label: "Replay", icon: RotateCw },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
            <Zap className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">TurboCore Event Bus</h2>
            <p className="text-muted-foreground text-sm">
              The nervous system — {reg.totalEvents} event contracts, {mon.subscriberCount}{" "}
              subscribers
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
                  ? "bg-amber-500/10 text-amber-600"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {t.id === "dlq" && mon.deadLetterCount > 0 && (
                <Badge variant="destructive" className="ml-1 text-xs">
                  {mon.deadLetterCount}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Overview */}
      {subTab === "overview" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-l-4 border-l-emerald-500 p-4">
              <div className="text-2xl font-bold text-emerald-600">{mon.published}</div>
              <div className="text-muted-foreground text-xs">Events Published</div>
            </Card>
            <Card className="border-l-4 border-l-blue-500 p-4">
              <div className="text-2xl font-bold text-blue-600">{mon.processed}</div>
              <div className="text-muted-foreground text-xs">Events Processed</div>
            </Card>
            <Card className="border-l-4 border-l-amber-500 p-4">
              <div className="text-2xl font-bold text-amber-600">{mon.queueLength}</div>
              <div className="text-muted-foreground text-xs">Queue Length</div>
            </Card>
            <Card className="border-l-4 border-l-rose-500 p-4">
              <div className="text-2xl font-bold text-rose-600">{mon.deadLetterCount}</div>
              <div className="text-muted-foreground text-xs">Dead Letters</div>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <Database className="text-muted-foreground h-4 w-4" />
                <span className="text-sm font-medium">Event Contracts</span>
              </div>
              <div className="text-2xl font-bold">{reg.totalEvents}</div>
              <div className="text-muted-foreground text-xs">
                {reg.totalProducers} producers, {reg.totalConsumers} consumers
              </div>
            </Card>
            <Card className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <Radio className="text-muted-foreground h-4 w-4" />
                <span className="text-sm font-medium">Subscribers</span>
              </div>
              <div className="text-2xl font-bold">{mon.subscriberCount}</div>
              <div className="text-muted-foreground text-xs">Active consumers</div>
            </Card>
            <Card className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <CheckCircle2 className="text-muted-foreground h-4 w-4" />
                <span className="text-sm font-medium">Inbox Size</span>
              </div>
              <div className="text-2xl font-bold">{mon.inboxSize}</div>
              <div className="text-muted-foreground text-xs">Processed event IDs (idempotency)</div>
            </Card>
            <Card className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <Layers className="text-muted-foreground h-4 w-4" />
                <span className="text-sm font-medium">Streams</span>
              </div>
              <div className="text-2xl font-bold">{data.streams.length}</div>
              <div className="text-muted-foreground text-xs">Separate queues</div>
            </Card>
          </div>

          {/* Categories breakdown */}
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Events by Category</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(reg.byCategory).map(([cat, count]) => (
                <Badge key={cat} className={CATEGORY_COLORS[cat] ?? "bg-slate-100 text-slate-700"}>
                  {cat}: {count}
                </Badge>
              ))}
            </div>
          </Card>

          {/* Recent events */}
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Recent Events (last 20)</h3>
            <ScrollArea className="max-h-96">
              <div className="space-y-2">
                {data.recentEvents.length === 0 && (
                  <p className="text-muted-foreground py-4 text-center text-sm">
                    No events published yet
                  </p>
                )}
                {data.recentEvents.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border p-2 text-xs">
                    <Badge variant="outline" className={CATEGORY_COLORS[String(e.category)] ?? ""}>
                      {String(e.category)}
                    </Badge>
                    <span className="font-mono font-medium">{String(e.eventType)}</span>
                    <span className="text-muted-foreground flex-1 truncate">
                      {String(e.aggregateId).slice(0, 30)}
                    </span>
                    <span className="text-muted-foreground">
                      {String(e.timestamp).slice(11, 19)}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>
        </div>
      )}

      {/* Registry */}
      {subTab === "registry" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Search events..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Categories</SelectItem>
                {Object.keys(reg.byCategory).map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStream} onValueChange={setFilterStream}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Stream" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Streams</SelectItem>
                {Object.keys(reg.byStream).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="max-h-[600px] space-y-2 overflow-y-auto">
            {reg.contracts
              .filter((c) => {
                if (
                  search &&
                  !c.eventType.toLowerCase().includes(search.toLowerCase()) &&
                  !c.name.toLowerCase().includes(search.toLowerCase())
                )
                  return false;
                if (filterCategory !== "ALL" && c.category !== filterCategory) return false;
                if (filterStream !== "ALL" && c.stream !== filterStream) return false;
                return true;
              })
              .map((contract) => {
                const isExpanded = expandedContract === contract.eventType;
                return (
                  <Card key={contract.eventType} className="p-3">
                    <div
                      className="flex cursor-pointer items-center gap-2"
                      onClick={() => setExpandedContract(isExpanded ? null : contract.eventType)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <Badge className={CATEGORY_COLORS[contract.category] ?? ""}>
                        {contract.category}
                      </Badge>
                      <span className="font-mono text-sm font-medium">{contract.eventType}</span>
                      <Badge
                        variant="outline"
                        className={`text-xs ${PRIORITY_COLORS[contract.priority] ?? ""}`}
                      >
                        {contract.priority}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-xs ${CLASSIFICATION_COLORS[contract.classification] ?? ""}`}
                      >
                        {contract.classification}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {contract.version}
                      </Badge>
                      {contract.ordered && (
                        <Badge variant="outline" className="bg-amber-50 text-xs">
                          ORDERED
                        </Badge>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="mt-3 ml-6 space-y-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Name:</span> {contract.name}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Owner:</span> {contract.owner}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Producer:</span>{" "}
                          {contract.producer}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Consumers:</span>{" "}
                          <div className="mt-1 flex flex-wrap gap-1">
                            {contract.consumers.map((c) => (
                              <Badge key={c} variant="outline" className="text-xs">
                                {c}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Stream:</span> {contract.stream}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Retention:</span>{" "}
                          {contract.retention.policy}
                          {contract.retention.value ? ` (${contract.retention.value})` : ""} —{" "}
                          {contract.retention.reason}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
          </div>
        </div>
      )}

      {/* Streams */}
      {subTab === "streams" && (
        <div className="space-y-3">
          {data.streams.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-amber-600" />
                    <span className="font-medium">{s.name}</span>
                    {s.orderingRequired && (
                      <Badge variant="outline" className="bg-amber-50 text-xs">
                        ORDERED
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">{s.description}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">{mon.queueByStream[s.id] ?? 0}</div>
                  <div className="text-muted-foreground text-xs">in queue</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Monitoring */}
      {subTab === "monitoring" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <div className="text-3xl font-bold text-emerald-600">{mon.processed}</div>
              <div className="text-muted-foreground text-xs">Total Processed</div>
            </Card>
            <Card className="p-4">
              <div className="text-3xl font-bold text-rose-600">{mon.failed}</div>
              <div className="text-muted-foreground text-xs">Total Failed</div>
            </Card>
            <Card className="p-4">
              <div className="text-3xl font-bold text-amber-600">{mon.queueLength}</div>
              <div className="text-muted-foreground text-xs">Current Queue Length</div>
            </Card>
          </div>

          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Queue by Stream</h3>
            <div className="space-y-2">
              {data.streams.map((s) => {
                const count = mon.queueByStream[s.id] ?? 0;
                const maxCount = Math.max(...Object.values(mon.queueByStream), 1);
                return (
                  <div key={s.id} className="flex items-center gap-3">
                    <span className="w-24 text-xs font-medium">{s.id}</span>
                    <div className="bg-muted h-6 flex-1 overflow-hidden rounded-full">
                      <div
                        className="h-full bg-amber-500 transition-all"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right font-mono text-xs">{count}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Active Subscribers</h3>
            <div className="space-y-2">
              {data.subscribers.length === 0 && (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  No active subscribers
                </p>
              )}
              {data.subscribers.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-lg border p-2">
                  <Radio className="h-3 w-3 text-emerald-500" />
                  <span className="text-sm font-medium">{s.name}</span>
                  <Badge variant="outline" className="text-xs">
                    stream: {s.stream}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    priority: {s.priority}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    max retries: {s.maxRetries}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Dead Letter Queue */}
      {subTab === "dlq" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Dead Letter Queue</h3>
              <p className="text-muted-foreground text-sm">
                Events that exhausted all retry attempts. Inspect, replay, or purge.
              </p>
            </div>
            {data.deadLetters.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDlqAction("purgeAll")}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" /> Purge All
              </Button>
            )}
          </div>

          {data.deadLetters.length === 0 ? (
            <Card className="p-8 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-12 w-12 text-emerald-500" />
              <p className="text-muted-foreground text-sm">No dead-lettered events. All good!</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {data.deadLetters.map((dl) => (
                <Card key={dl.id} className="p-3">
                  <div className="flex items-start gap-3">
                    <XCircle className="mt-0.5 h-5 w-5 text-rose-500" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">
                          {String(dl.event.eventType)}
                        </span>
                        <Badge variant="destructive" className="text-xs">
                          {dl.attempts} attempts
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-rose-600">{dl.lastError}</p>
                      <div className="text-muted-foreground mt-1 flex gap-3 text-xs">
                        <span>Subscriber: {dl.subscriberName}</span>
                        <span>At: {dl.deadLetteredAt.slice(11, 19)}</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDlqAction("replay", dl.id)}
                        className="gap-1"
                      >
                        <Play className="h-3 w-3" /> Replay
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDlqAction("purge", dl.id)}
                        className="gap-1"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Replay */}
      {subTab === "replay" && (
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-3">
            <RotateCw className="h-5 w-5 text-amber-600" />
            <div>
              <h3 className="text-lg font-semibold">Event Replay</h3>
              <p className="text-muted-foreground text-sm">
                Replay events through the bus to rebuild read models. Inbox pattern prevents
                duplicate processing.
              </p>
            </div>
          </div>
          <Separator className="my-4" />
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              Replay uses the Inbox pattern — events that have already been processed by a
              subscriber are skipped, ensuring idempotency. This is safe to run multiple times.
            </p>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
              <strong>How it works:</strong> The replay engine takes a list of events and
              re-delivers them to all matching subscribers. Each subscriber checks its inbox — if
              the event was already processed, it&apos;s skipped. Failed events are retried with
              exponential backoff (1min → 5min → 15min → 1hour).
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
