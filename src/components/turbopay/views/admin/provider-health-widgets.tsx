"use client";

// TurboCore admin — provider health visualisation widgets.
//
// HealthSparkline: a tiny inline area+line chart of the last N ProviderHealthCheck
//   samples, drawn with Recharts. Green when the latest sample was ok, red when
//   the latest sample was a failure. Hovering reveals the latency + ok/error.
//
// FailoverStatsCard: a 24h / 7d switchable card showing total failovers, top
//   providers that failovers landed on, top reasons, and the operational
//   "success rate after failover" metric. Used in the Providers tab header.

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { RefreshCw, TrendingUp, AlertTriangle, Activity, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { healthTone, CIRCUIT_TONE } from "./shared";

interface HealthSample {
  id: string;
  ok: boolean;
  latencyMs: number;
  errorCode: string | null;
  healthScore: number;
  sampledAt: string;
}

interface FailoverStatsResponse {
  windowHours: number;
  totalFailovers: number;
  uniqueTxns: number;
  byToProvider: Record<string, number>;
  byFromProvider: Record<string, number>;
  byReason: Record<string, number>;
  successRateAfterFailover: number;
  reversedAfterFailover: number;
  topFailoverChains: { from: string; to: string; reason: string; count: number }[];
}

// --- HealthSparkline --------------------------------------------------------

export function HealthSparkline({
  samples,
  height = 60,
}: {
  samples: HealthSample[];
  height?: number;
}) {
  // Recharts likes chronological order for area charts; samples come in desc.
  const ordered = [...samples].reverse();
  const data = ordered.map((s, i) => ({
    idx: i,
    latency: s.latencyMs,
    score: s.healthScore,
    ok: s.ok,
    errorCode: s.errorCode,
    sampledAt: s.sampledAt,
  }));

  const latestOk = data.length > 0 ? data[data.length - 1].ok : true;
  const lineColor = latestOk ? "#10b981" : "#ef4444"; // emerald-500 / red-500
  const gradId = latestOk ? "sparkOk" : "sparkFail";

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.4} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="idx" hide />
          <YAxis hide domain={[0, "dataMax + 50"]} />
          <ReferenceLine y={2000} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.4} />
          <Tooltip
            cursor={{ stroke: lineColor, strokeOpacity: 0.3 }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--popover))",
              color: "hsl(var(--popover-foreground))",
              fontSize: 11,
              padding: "6px 8px",
            }}
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload as HealthSample | undefined;
              return p ? new Date(p.sampledAt).toLocaleTimeString() : "";
            }}
            formatter={(value, name, item) => {
              const p = item?.payload as HealthSample | undefined;
              if (name === "latency") {
                return [`${value}ms${p && !p.ok ? ` · ${p.errorCode ?? "FAIL"}` : ""}`, "Latency"];
              }
              return [String(value), name];
            }}
          />
          <Area
            type="monotone"
            dataKey="latency"
            stroke={lineColor}
            strokeWidth={1.5}
            fill={`url(#${gradId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- FailoverStatsCard ------------------------------------------------------

export function FailoverStatsCard() {
  const [stats, setStats] = React.useState<FailoverStatsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [window_, setWindow] = React.useState<"24h" | "7d">("24h");

  const load = React.useCallback(async (w: "24h" | "7d") => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/failover-stats?window=${w}`, { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load failover stats");
        return;
      }
      const data: FailoverStatsResponse = await res.json();
      setStats(data);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load(window_);
  }, [window_, load]);

  const successRate = stats?.successRateAfterFailover ?? 0;
  const successTone =
    successRate >= 70
      ? "text-emerald-600 dark:text-emerald-400"
      : successRate >= 40
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Activity className="text-primary h-4 w-4" /> Failover stats
          </h3>
          <p className="text-muted-foreground text-xs">
            How often the orchestrator switched providers, and whether the failover saved the
            transaction.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border p-0.5">
            <button
              type="button"
              onClick={() => setWindow("24h")}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                window_ === "24h"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              24h
            </button>
            <button
              type="button"
              onClick={() => setWindow("7d")}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                window_ === "7d"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              7d
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => load(window_)}
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : stats && stats.totalFailovers === 0 ? (
        <div className="bg-muted/20 flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="h-4 w-4" />
          </span>
          <div>
            <p className="font-medium">No failovers in the last {window_}</p>
            <p className="text-muted-foreground text-xs">
              All providers handled their traffic without retrying.
            </p>
          </div>
        </div>
      ) : stats ? (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-4">
            <StatTile
              label="Total failovers"
              value={String(stats.totalFailovers)}
              hint={`${stats.uniqueTxns} unique txns`}
              tone="default"
            />
            <StatTile
              label="Success after failover"
              value={`${successRate}%`}
              hint={`${stats.reversedAfterFailover} reversed`}
              tone={successRate >= 70 ? "emerald" : successRate >= 40 ? "amber" : "red"}
            />
            <div className="bg-background rounded-xl border p-3 md:col-span-2">
              <h4 className="text-muted-foreground mb-2 text-[10px] font-semibold uppercase">
                Top providers failed over to
              </h4>
              {Object.keys(stats.byToProvider).length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(stats.byToProvider)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 8)
                    .map(([code, count]) => (
                      <Badge
                        key={code}
                        variant="secondary"
                        className="gap-1 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400"
                      >
                        {code} <span className="tabular-nums">×{count}</span>
                      </Badge>
                    ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">—</p>
              )}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="bg-background rounded-xl border p-3">
              <h4 className="text-muted-foreground mb-2 text-[10px] font-semibold uppercase">
                Top reasons
              </h4>
              {Object.keys(stats.byReason).length > 0 ? (
                <div className="space-y-1.5">
                  {Object.entries(stats.byReason)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 6)
                    .map(([reason, count]) => (
                      <div key={reason} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="h-3 w-3 text-amber-500" />
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {reason}
                          </Badge>
                        </span>
                        <span className="font-medium tabular-nums">{count}×</span>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">—</p>
              )}
            </div>
            <div className="bg-background rounded-xl border p-3">
              <h4 className="text-muted-foreground mb-2 text-[10px] font-semibold uppercase">
                Most common failover chains
              </h4>
              {stats.topFailoverChains.length > 0 ? (
                <div className="space-y-1.5">
                  {stats.topFailoverChains.slice(0, 5).map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-mono">
                        <span className="text-red-600 dark:text-red-400">{c.from}</span>
                        <ArrowRight className="text-muted-foreground h-3 w-3" />
                        <span className="text-emerald-600 dark:text-emerald-400">{c.to}</span>
                      </span>
                      <span className="font-medium tabular-nums">{c.count}×</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">—</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "default" | "emerald" | "amber" | "red";
}) {
  const toneText =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "red"
          ? "text-red-600 dark:text-red-400"
          : "text-foreground";
  return (
    <div className="bg-background rounded-xl border p-3">
      <p className="text-muted-foreground text-[10px] font-semibold uppercase">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${toneText}`}>{value}</p>
      {hint ? <p className="text-muted-foreground text-[10px]">{hint}</p> : null}
    </div>
  );
}

// Re-export for callers that want the underlying circuit tone map.
export { healthTone, CIRCUIT_TONE };
