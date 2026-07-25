"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadialBarChart, RadialBar,
} from "recharts";
import {
  TrendingUp, TrendingDown, ArrowDownLeft, ArrowUpRight, Activity,
  Calendar, Clock, Users, BarChart3, Wallet, Zap, Trophy,
} from "lucide-react";
import { naira, nairaCompact, timeAgo } from "@/lib/money";
import { PageHeader, StatCard, EmptyState } from "../parts/layout";
import { useApp } from "../store";

interface AnalyticsData {
  trends: { date: string; income: number; expense: number; net: number }[];
  stats: {
    totalIncome30: number; totalExpense30: number; netFlow30: number; txCount30: number;
    avgTxSize: number; thisWeekExpense: number; lastWeekExpense: number; weekChange: number;
    thisWeekIncome: number; lastWeekIncome: number; incomeWeekChange: number;
  };
  spendingByCategory: { name: string; value: number; count: number }[];
  incomeByCategory: { name: string; value: number; count: number }[];
  topCounterparties: { name: string; count: number; total: number }[];
  dowData: { day: string; income: number; expense: number }[];
  hourData: { hour: number; count: number }[];
  largest: { type: string; amountKobo: number; counterpartyName: string | null; description: string | null; createdAt: string; direction: string } | null;
}

const SPEND_COLORS = ["oklch(0.62 0.14 162)", "oklch(0.80 0.13 75)", "oklch(0.65 0.18 250)", "oklch(0.70 0.20 18)", "oklch(0.60 0.14 155)", "oklch(0.65 0.18 303)", "oklch(0.75 0.15 200)"];

const TYPE_LABELS: Record<string, string> = {
  FUNDING: "Funding", TRANSFER: "Transfer", AIRTIME: "Airtime", DATA: "Data",
  BILL: "Bills", CARD_FUND: "Card topup", CARD_WITHDRAW: "Card withdraw",
  REWARD: "Reward", REFERRAL: "Referral", SAVINGS_DEPOSIT: "Savings", SAVINGS_WITHDRAW: "Savings", INVESTMENT: "Investment",
};

export default function AnalyticsView() {
  const [data, setData] = React.useState<AnalyticsData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/analytics", { cache: "no-store" });
        if (res.ok) setData(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}
        </div>
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!data || data.stats.txCount30 === 0) {
    return (
      <>
        <PageHeader title="Analytics" subtitle="Deep-dive into your spending patterns" />
        <EmptyState
          icon={BarChart3}
          title="No data to analyze yet"
          description="Start transacting to see your spending trends, category breakdowns, and insights here."
        />
      </>
    );
  }

  const s = data.stats;
  const maxHour = Math.max(...data.hourData.map((h) => h.count), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        subtitle="Deep-dive into your spending patterns"
        actions={
          <Badge variant="secondary" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" /> {s.txCount30} transactions (30d)
          </Badge>
        }
      />

      {/* Stat tiles with gradient accents */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <GradientStatCard
          label="Total income (30d)"
          value={naira(s.totalIncome30)}
          icon={ArrowDownLeft}
          gradient="from-emerald-500/20 to-emerald-600/5"
          iconBg="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          change={s.incomeWeekChange}
          changeLabel="vs last week"
        />
        <GradientStatCard
          label="Total spending (30d)"
          value={naira(s.totalExpense30)}
          icon={ArrowUpRight}
          gradient="from-amber-500/20 to-amber-600/5"
          iconBg="bg-amber-500/15 text-amber-600 dark:text-amber-400"
          change={s.weekChange}
          changeLabel="vs last week"
        />
        <GradientStatCard
          label="Net flow (30d)"
          value={naira(s.netFlow30)}
          icon={Wallet}
          gradient="from-sky-500/20 to-sky-600/5"
          iconBg="bg-sky-500/15 text-sky-600 dark:text-sky-400"
        />
        <GradientStatCard
          label="Avg. transaction"
          value={naira(s.avgTxSize)}
          icon={TrendingUp}
          gradient="from-violet-500/20 to-violet-600/5"
          iconBg="bg-violet-500/15 text-violet-600 dark:text-violet-400"
        />
      </div>

      {/* Income vs Expense trend */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Income vs Spending</p>
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "oklch(0.62 0.14 162)" }} /> Income
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "oklch(0.80 0.13 75)" }} /> Spending
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data.trends} margin={{ left: -10, right: 8, top: 4 }}>
            <defs>
              <linearGradient id="inc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="oklch(0.62 0.14 162)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="oklch(0.62 0.14 162)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="oklch(0.80 0.13 75)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="oklch(0.80 0.13 75)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} stroke="var(--muted-foreground)" />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => nairaCompact(v)} stroke="var(--muted-foreground)" width={55} />
            <Tooltip
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
              formatter={(v: number) => naira(v)}
            />
            <Area type="monotone" dataKey="income" stroke="oklch(0.62 0.14 162)" strokeWidth={2} fill="url(#inc)" name="Income" />
            <Area type="monotone" dataKey="expense" stroke="oklch(0.80 0.13 75)" strokeWidth={2} fill="url(#exp)" name="Spending" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Spending by category — donut */}
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-semibold">Spending by category</p>
          </div>
          {data.spendingByCategory.length > 0 ? (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <ResponsiveContainer width="100%" height={180} className="sm:!w-1/2">
                <PieChart>
                  <Pie data={data.spendingByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {data.spendingByCategory.map((_, i) => (
                      <Cell key={i} fill={SPEND_COLORS[i % SPEND_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => naira(v)} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2 w-full">
                {data.spendingByCategory.slice(0, 6).map((c, i) => (
                  <div key={c.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: SPEND_COLORS[i % SPEND_COLORS.length] }} />
                      {TYPE_LABELS[c.name] ?? c.name}
                      <span className="text-muted-foreground">({c.count})</span>
                    </span>
                    <span className="font-medium tabular-nums">{naira(c.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No spending recorded</p>
          )}
        </Card>

        {/* Day-of-week pattern */}
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Spending by day of week</p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.dowData} margin={{ left: -20, right: 8 }}>
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => nairaCompact(v)} stroke="var(--muted-foreground)" width={50} />
              <Tooltip formatter={(v: number) => naira(v)} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="income" fill="oklch(0.62 0.14 162)" radius={[4, 4, 0, 0]} name="Income" />
              <Bar dataKey="expense" fill="oklch(0.80 0.13 75)" radius={[4, 4, 0, 0]} name="Expense" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Hour-of-day activity heat strip */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Activity by hour of day</p>
        </div>
        <div className="flex items-end gap-1">
          {data.hourData.map((h) => (
            <div key={h.hour} className="group relative flex-1">
              <div
                className="w-full rounded-t-sm transition-all hover:opacity-80"
                style={{
                  height: `${Math.max(4, (h.count / maxHour) * 80)}px`,
                  background: h.count > 0 ? "linear-gradient(180deg, oklch(0.62 0.14 162), oklch(0.45 0.11 162))" : "var(--muted)",
                }}
              />
              <div className="absolute -top-7 left-1/2 z-10 -translate-x-1/2 rounded bg-popover px-1.5 py-0.5 text-[10px] opacity-0 shadow group-hover:opacity-100">
                {h.hour}:00 — {h.count} tx
              </div>
              {(h.hour % 4 === 0) && (
                <span className="mt-1 block text-center text-[9px] text-muted-foreground">{h.hour}h</span>
              )}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top counterparties */}
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Top counterparties</p>
          </div>
          {data.topCounterparties.length > 0 ? (
            <div className="space-y-3">
              {data.topCounterparties.map((c, i) => {
                const maxTotal = data.topCounterparties[0].total;
                return (
                  <div key={c.name} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="text-sm font-semibold tabular-nums">{naira(c.total)}</p>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full tp-emerald-grad" style={{ width: `${(c.total / maxTotal) * 100}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{c.count} tx</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">No counterparties yet</p>
          )}
        </Card>

        {/* Largest transaction + highlights */}
        <div className="space-y-4">
          {data.largest && (
            <Card className="overflow-hidden p-0">
              <div className="tp-amber-grad px-5 py-3 text-white">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4" />
                  <p className="text-sm font-semibold">Largest transaction (30d)</p>
                </div>
              </div>
              <div className="p-5">
                <p className="text-2xl font-bold tabular-nums">{naira(data.largest.amountKobo)}</p>
                <div className="mt-2 space-y-1 text-sm">
                  <p><span className="text-muted-foreground">Type:</span> {TYPE_LABELS[data.largest.type] ?? data.largest.type}</p>
                  <p><span className="text-muted-foreground">Counterparty:</span> {data.largest.counterpartyName ?? "—"}</p>
                  {data.largest.description && <p><span className="text-muted-foreground">Note:</span> {data.largest.description}</p>}
                  <p><span className="text-muted-foreground">Date:</span> {timeAgo(data.largest.createdAt)}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Weekly comparison */}
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">This week vs last week</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-emerald-500/5 p-3">
                <p className="text-xs text-muted-foreground">Income</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{naira(s.thisWeekIncome)}</p>
                {s.incomeWeekChange !== 0 && (
                  <p className={`text-[11px] ${s.incomeWeekChange > 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {s.incomeWeekChange > 0 ? "↑" : "↓"} {Math.abs(s.incomeWeekChange)}% vs last week
                  </p>
                )}
              </div>
              <div className="rounded-xl bg-amber-500/5 p-3">
                <p className="text-xs text-muted-foreground">Spending</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">{naira(s.thisWeekExpense)}</p>
                {s.weekChange !== 0 && (
                  <p className={`text-[11px] ${s.weekChange > 0 ? "text-red-500" : "text-emerald-500"}`}>
                    {s.weekChange > 0 ? "↑" : "↓"} {Math.abs(s.weekChange)}% vs last week
                  </p>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function GradientStatCard({
  label,
  value,
  icon: Icon,
  gradient,
  iconBg,
  change,
  changeLabel,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  iconBg: string;
  change?: number;
  changeLabel?: string;
}) {
  return (
    <Card className={`relative overflow-hidden p-4 bg-gradient-to-br ${gradient}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums">{value}</p>
      {change !== undefined && change !== 0 && (
        <p className={`mt-0.5 text-xs ${change > 0 ? "text-emerald-500" : "text-red-500"}`}>
          {change > 0 ? "↑" : "↓"} {Math.abs(change)}% {changeLabel}
        </p>
      )}
    </Card>
  );
}
