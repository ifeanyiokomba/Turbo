"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadialBarChart, RadialBar,
} from "recharts";
import {
  TrendingUp, TrendingDown, ArrowDownLeft, ArrowUpRight, Activity,
  Calendar, Clock, Users, BarChart3, Wallet, Zap, Trophy,
  Target, Plus, Trash2, AlertTriangle, RefreshCw, PiggyBank,
} from "lucide-react";
import { naira, nairaCompact, timeAgo, parseKobo } from "@/lib/money";
import { PageHeader, EmptyState } from "../parts/layout";
import { AnimatedNumber } from "../parts/animated-number";
import { toast } from "sonner";

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
        <BudgetsSection />
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

      {/* Budgets section */}
      <BudgetsSection />

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

      {/* 365-day spending activity heatmap */}
      <SpendingHeatmap />

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

/* ------------------------------------------------------------------ */
/* Budgets section                                                     */
/* ------------------------------------------------------------------ */

interface BudgetRow {
  id: string;
  category: string;
  categoryLabel: string;
  monthlyLimitKobo: number;
  periodStart: string;
  alertThreshold: number;
  enabled: boolean;
  spentKobo: number;
  pct: number;
  remainingKobo: number;
  overThreshold: boolean;
  overBudget: boolean;
  createdAt: string;
  updatedAt: string;
}

const BUDGET_CATEGORY_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "TOTAL", label: "Total spending", hint: "All debits combined" },
  { value: "TRANSFER", label: "Transfers", hint: "P2P transfers" },
  { value: "AIRTIME", label: "Airtime", hint: "Airtime purchases" },
  { value: "DATA", label: "Data", hint: "Data bundles" },
  { value: "BILL", label: "Bills", hint: "Bill payments" },
  { value: "CARD_FUND", label: "Card funding", hint: "Virtual card topups" },
];

function toneForPct(pct: number, overBudget: boolean): {
  barClass: string;
  textClass: string;
  ringClass: string;
  label: string;
} {
  if (overBudget || pct >= 100) {
    return {
      barClass: "bg-red-500",
      textClass: "text-red-600 dark:text-red-400",
      ringClass: "ring-red-500/30",
      label: "Over budget",
    };
  }
  if (pct >= 80) {
    return {
      barClass: "bg-red-500",
      textClass: "text-red-600 dark:text-red-400",
      ringClass: "ring-red-500/30",
      label: "Near limit",
    };
  }
  if (pct >= 50) {
    return {
      barClass: "bg-amber-500",
      textClass: "text-amber-600 dark:text-amber-400",
      ringClass: "ring-amber-500/30",
      label: "On track",
    };
  }
  return {
    barClass: "bg-emerald-500",
    textClass: "text-emerald-600 dark:text-emerald-400",
    ringClass: "ring-emerald-500/30",
    label: "Healthy",
  };
}

function BudgetRowCard({
  budget,
  onEdit,
  onDelete,
}: {
  budget: BudgetRow;
  onEdit: (b: BudgetRow) => void;
  onDelete: (b: BudgetRow) => void;
}) {
  const tone = toneForPct(budget.pct, budget.overBudget);
  const pctClamped = Math.min(100, budget.pct);
  return (
    <div className={`rounded-2xl border bg-card p-5 shadow-sm ring-1 ${budget.overThreshold ? tone.ringClass : "ring-transparent"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{budget.categoryLabel}</p>
            {budget.overThreshold && (
              <Badge variant="destructive" className="gap-1 text-[10px]">
                <AlertTriangle className="h-3 w-3" /> {budget.overBudget ? "Over" : `${budget.pct}%`}
              </Badge>
            )}
            {!budget.enabled && (
              <Badge variant="secondary" className="text-[10px]">Disabled</Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Spent <span className="font-medium text-foreground">
              <AnimatedNumber value={budget.spentKobo} format={naira} duration={600} />
            </span> of {naira(budget.monthlyLimitKobo)} this month
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(budget)} aria-label="Edit budget">
            <Target className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-red-600" onClick={() => onDelete(budget)} aria-label="Delete budget">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs">
          <span className={tone.textClass}>{budget.pct}% used</span>
          <span className="text-muted-foreground">
            {budget.overBudget ? (
              <>Over by <span className="font-medium text-red-600 dark:text-red-400">{naira(budget.spentKobo - budget.monthlyLimitKobo)}</span></>
            ) : (
              <><span className="font-medium">{naira(budget.remainingKobo)}</span> left</>
            )}
          </span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all duration-500 ${tone.barClass}`}
            style={{ width: `${Math.max(0, Math.min(100, pctClamped))}%` }}
          />
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Alert at {budget.alertThreshold}% · resets monthly
        </p>
      </div>
    </div>
  );
}

function BudgetsSection() {
  const [budgets, setBudgets] = React.useState<BudgetRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BudgetRow | null>(null);
  const [category, setCategory] = React.useState<string>("TOTAL");
  const [limitInput, setLimitInput] = React.useState<string>("");
  const [threshold, setThreshold] = React.useState<number>(80);
  const [saving, setSaving] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<BudgetRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/budgets", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setBudgets(data.budgets ?? []);
      }
    } catch {
      /* swallow */
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const existingCats = React.useMemo(() => new Set(budgets.map((b) => b.category)), [budgets]);

  function openCreate() {
    setEditing(null);
    // Default to first category user doesn't have yet
    const next = BUDGET_CATEGORY_OPTIONS.find((c) => !existingCats.has(c.value))?.value ?? "TOTAL";
    setCategory(next);
    setLimitInput("");
    setThreshold(80);
    setDialogOpen(true);
  }

  function openEdit(b: BudgetRow) {
    setEditing(b);
    setCategory(b.category);
    setLimitInput(String((b.monthlyLimitKobo / 100).toFixed(2)));
    setThreshold(b.alertThreshold);
    setDialogOpen(true);
  }

  async function save() {
    const limitKobo = parseKobo(limitInput);
    if (limitKobo < 1000) {
      toast.error("Monthly limit must be at least ₦10");
      return;
    }
    if (threshold < 10 || threshold > 100) {
      toast.error("Alert threshold must be between 10% and 100%");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          monthlyLimitKobo: limitKobo,
          alertThreshold: threshold,
          enabled: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? "Failed to save budget");
        return;
      }
      toast.success(editing ? "Budget updated" : "Budget created");
      setDialogOpen(false);
      load();
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/budgets/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j?.error ?? "Failed to delete budget");
        return;
      }
      toast.success("Budget deleted");
      setDeleteTarget(null);
      load();
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  const totalSpent = budgets.reduce((sum, b) => sum + (b.category === "TOTAL" ? b.spentKobo : 0), 0);
  const totalLimit = budgets.find((b) => b.category === "TOTAL")?.monthlyLimitKobo ?? 0;

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <PiggyBank className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Spending budgets</p>
            <p className="text-xs text-muted-foreground">
              Track monthly spend against the limits you set.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={load} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" /> Set budget
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted/60" />
          ))}
        </div>
      ) : budgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Target className="h-6 w-6" />
          </div>
          <p className="mt-3 font-medium">No budgets yet</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Set a monthly spending cap per category and we&apos;ll alert you when you cross the threshold.
          </p>
          <Button size="sm" className="mt-4 gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Set your first budget
          </Button>
        </div>
      ) : (
        <>
          {/* Summary banner */}
          {totalLimit > 0 && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 p-3">
              <span className="text-xs text-muted-foreground">Total spent this month</span>
              <span className="text-sm font-semibold tabular-nums">
                <AnimatedNumber value={totalSpent} format={naira} duration={600} />
                <span className="text-muted-foreground"> / {naira(totalLimit)}</span>
              </span>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {budgets.map((b) => (
              <BudgetRowCard key={b.id} budget={b} onEdit={openEdit} onDelete={setDeleteTarget} />
            ))}
          </div>
        </>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              {editing ? "Edit budget" : "Set a budget"}
            </DialogTitle>
            <DialogDescription>
              Choose a category, monthly limit, and the alert threshold.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="budget-cat">Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v)}
                disabled={!!editing}
              >
                <SelectTrigger id="budget-cat" className="w-full">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {BUDGET_CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt.value}
                      value={opt.value}
                      disabled={!editing && existingCats.has(opt.value)}
                    >
                      <div className="flex flex-col">
                        <span>{opt.label}</span>
                        <span className="text-[10px] text-muted-foreground">{opt.hint}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget-limit">Monthly limit (₦)</Label>
              <Input
                id="budget-limit"
                inputMode="decimal"
                placeholder="e.g. 50000"
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
              />
              {parseKobo(limitInput) > 0 && (
                <p className="text-xs text-muted-foreground">
                  = <span className="font-medium text-foreground">{naira(parseKobo(limitInput))}</span>
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "₦10K", v: "10000" },
                  { label: "₦50K", v: "50000" },
                  { label: "₦100K", v: "100000" },
                  { label: "₦500K", v: "500000" },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => setLimitInput(chip.v)}
                    className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium hover:border-primary hover:bg-primary/5"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="budget-threshold">Alert threshold</Label>
                <span className="text-sm font-semibold text-primary tabular-nums">{threshold}%</span>
              </div>
              <Slider
                id="budget-threshold"
                value={[threshold]}
                min={10}
                max={100}
                step={5}
                onValueChange={(v) => setThreshold(v[0] ?? 80)}
              />
              <p className="text-[11px] text-muted-foreground">
                We&apos;ll flag the budget when usage crosses this percentage.
              </p>
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button onClick={save} disabled={saving} className="gap-1.5">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {editing ? "Save changes" : "Create budget"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Delete budget?
            </DialogTitle>
            <DialogDescription>
              This removes the <span className="font-medium text-foreground">{deleteTarget?.categoryLabel}</span> budget. You can always set a new one later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting} className="gap-1.5">
              {deleting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete budget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ================================================================== */
/* Spending activity heatmap — GitHub-style 365-day contribution grid  */
/* ================================================================== */

interface HeatmapDay {
  date: string; // YYYY-MM-DD
  totalKobo: number;
}

interface HeatmapResponse {
  days: HeatmapDay[];
  totalKobo: number;
  maxDayKobo: number;
  activeDays: number;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// 5-step emerald intensity scale (index 0 = no spend, 4 = heaviest).
const HEAT_LEVELS = [
  "var(--muted)",                              // 0 — no spending
  "oklch(0.92 0.04 162)",                      // 1 — light
  "oklch(0.78 0.10 162)",                      // 2 — medium-light
  "oklch(0.62 0.14 162)",                      // 3 — medium-dark
  "oklch(0.45 0.11 162)",                      // 4 — darkest
];

function levelFor(totalKobo: number, thresholds: number[]): number {
  if (totalKobo <= 0) return 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (totalKobo <= thresholds[i]) return i + 1;
  }
  return 4;
}

function SpendingHeatmap() {
  const [data, setData] = React.useState<HeatmapResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/analytics/heatmap", { cache: "no-store" });
        if (res.ok) {
          const json: HeatmapResponse = await res.json();
          if (!cancelled) setData(json);
        }
      } catch {
        /* non-fatal */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Spending activity</p>
        </div>
        <div className="h-32 w-full animate-pulse rounded-xl bg-muted/60" />
      </Card>
    );
  }

  // Build the date→total lookup
  const lookup = new Map<string, number>();
  for (const d of data?.days ?? []) lookup.set(d.date, d.totalKobo);

  // Determine non-zero thresholds (quartiles) so the colors adapt to the
  // user's actual spending range. If there's no spending at all we just
  // render an empty grid.
  const nonzeroTotals = (data?.days ?? [])
    .map((d) => d.totalKobo)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  let thresholds: number[] = [];
  if (nonzeroTotals.length > 0) {
    const q = (p: number) => {
      const idx = Math.min(nonzeroTotals.length - 1, Math.floor((p / 100) * nonzeroTotals.length));
      return nonzeroTotals[idx];
    };
    thresholds = [q(25), q(50), q(75)];
  }

  // Build the calendar grid: 53 columns of 7 days (Sun→Sat).
  // We anchor to "today" and walk back 364 days, then pad to align the
  // first column to a Sunday so weeks line up cleanly.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const firstDataDate = new Date(today);
  firstDataDate.setDate(firstDataDate.getDate() - 364);

  // Pad start backward to nearest Sunday
  const gridStart = new Date(firstDataDate);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  // Pad end forward to nearest Saturday
  const gridEnd = new Date(today);
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

  // Build week columns
  const weeks: { date: string; totalKobo: number; inRange: boolean; monthLabel: string | null }[][] = [];
  let lastMonth = -1;
  for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow === 0) weeks.push([]);
    const week = weeks[weeks.length - 1];
    const dateStr = d.toISOString().slice(0, 10);
    const inRange = d >= firstDataDate && d <= today;
    const monthIdx = d.getMonth();
    // Show the month label on the first week where the month starts (or changes)
    const monthLabel = dow === 0 && monthIdx !== lastMonth ? MONTH_LABELS[monthIdx] : null;
    if (dow === 0) lastMonth = monthIdx;
    week.push({
      date: dateStr,
      totalKobo: lookup.get(dateStr) ?? 0,
      inRange,
      monthLabel,
    });
  }

  const totalKobo = data?.totalKobo ?? 0;
  const activeDays = data?.activeDays ?? 0;
  const maxDayKobo = data?.maxDayKobo ?? 0;

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-semibold">Spending activity</p>
            <p className="text-xs text-muted-foreground">Last 365 days · {activeDays} active days</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Total: <span className="font-semibold text-foreground tabular-nums">{nairaCompact(totalKobo)}</span></span>
          {maxDayKobo > 0 && (
            <span>Busiest day: <span className="font-semibold text-foreground tabular-nums">{nairaCompact(maxDayKobo)}</span></span>
          )}
        </div>
      </div>

      {nonzeroTotals.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-10 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Calendar className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-medium">No spending in the last year</p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            Once you start spending, this calendar will light up to show your daily activity.
          </p>
        </div>
      ) : (
        <>
          {/* Heatmap grid — horizontally scrollable on small screens */}
          <div className="overflow-x-auto scrollbar-thin pb-1">
            <div className="inline-flex flex-col gap-1 min-w-max">
              {/* Month labels row */}
              <div className="flex gap-[3px] pl-8 text-[10px] text-muted-foreground">
                {weeks.map((week, i) => (
                  <div key={i} className="w-[13px] relative h-3">
                    {week[0]?.monthLabel && (
                      <span className="absolute left-0 top-0 whitespace-nowrap">{week[0].monthLabel}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Day-of-week labels + grid */}
              <div className="flex gap-1">
                {/* Weekday labels column */}
                <div className="flex flex-col gap-[3px] pr-1 text-[10px] text-muted-foreground">
                  {WEEKDAY_LABELS.map((d, i) => (
                    <div key={d} className="h-[13px] leading-[13px]">
                      {i % 2 === 1 ? d : ""}
                    </div>
                  ))}
                </div>

                {/* Week columns */}
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[3px]">
                    {Array.from({ length: 7 }).map((_, di) => {
                      const cell = week[di];
                      if (!cell) {
                        return <div key={di} className="h-[13px] w-[13px]" />;
                      }
                      const level = cell.inRange ? levelFor(cell.totalKobo, thresholds) : 0;
                      const isFuture = !cell.inRange;
                      return (
                        <div
                          key={di}
                          className="group relative h-[13px] w-[13px] cursor-default rounded-[2px] transition-all hover:ring-1 hover:ring-foreground/40"
                          style={{
                            background: isFuture ? "transparent" : HEAT_LEVELS[level],
                            opacity: isFuture ? 0 : 1,
                          }}
                        >
                          {/* Hover tooltip */}
                          <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-[10px] shadow-md ring-1 ring-border group-hover:block">
                            <p className="font-medium">{formatHeatDate(cell.date)}</p>
                            <p className="text-muted-foreground">
                              {cell.totalKobo > 0 ? naira(cell.totalKobo) : "No spending"}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
            <span>Less</span>
            {HEAT_LEVELS.map((bg, i) => (
              <span
                key={i}
                className="h-[11px] w-[11px] rounded-[2px]"
                style={{ background: bg }}
              />
            ))}
            <span>More</span>
          </div>
        </>
      )}
    </Card>
  );
}

function formatHeatDate(dateStr: string): string {
  // dateStr is YYYY-MM-DD; render as e.g. "12 Mar 2025"
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}
