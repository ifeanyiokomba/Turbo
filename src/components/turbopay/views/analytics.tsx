"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  ArrowDownLeft,
  ArrowUpRight,
  Activity,
  Calendar,
  Clock,
  Users,
  BarChart3,
  Wallet,
  Zap,
  Trophy,
  Target,
  Plus,
  Trash2,
  AlertTriangle,
  RefreshCw,
  PiggyBank,
  Gauge,
  Flame,
  Crown,
  Scale,
  ArrowUp,
  ArrowDown,
  Minus,
  Sparkles,
} from "lucide-react";
import { naira, nairaCompact, timeAgo, parseKobo } from "@/lib/money";
import { PageHeader, EmptyState } from "../parts/layout";
import { AnimatedNumber } from "../parts/animated-number";
import { toast } from "sonner";

interface AnalyticsData {
  trends: { date: string; income: number; expense: number; net: number }[];
  stats: {
    totalIncome30: number;
    totalExpense30: number;
    netFlow30: number;
    txCount30: number;
    avgTxSize: number;
    thisWeekExpense: number;
    lastWeekExpense: number;
    weekChange: number;
    thisWeekIncome: number;
    lastWeekIncome: number;
    incomeWeekChange: number;
  };
  spendingByCategory: { name: string; value: number; count: number }[];
  incomeByCategory: { name: string; value: number; count: number }[];
  topCounterparties: { name: string; count: number; total: number }[];
  dowData: { day: string; income: number; expense: number }[];
  hourData: { hour: number; count: number }[];
  largest: {
    type: string;
    amountKobo: number;
    counterpartyName: string | null;
    description: string | null;
    createdAt: string;
    direction: string;
  } | null;
}

const SPEND_COLORS = [
  "oklch(0.62 0.14 162)",
  "oklch(0.80 0.13 75)",
  "oklch(0.65 0.18 250)",
  "oklch(0.70 0.20 18)",
  "oklch(0.60 0.14 155)",
  "oklch(0.65 0.18 303)",
  "oklch(0.75 0.15 200)",
];

const TYPE_LABELS: Record<string, string> = {
  FUNDING: "Funding",
  TRANSFER: "Transfer",
  AIRTIME: "Airtime",
  DATA: "Data",
  BILL: "Bills",
  CARD_FUND: "Card topup",
  CARD_WITHDRAW: "Card withdraw",
  REWARD: "Reward",
  REFERRAL: "Referral",
  SAVINGS_DEPOSIT: "Savings",
  SAVINGS_WITHDRAW: "Savings",
  INVESTMENT: "Investment",
};

export default function AnalyticsView() {
  const [data, setData] = React.useState<AnalyticsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [period, setPeriod] = React.useState<"30d" | "90d" | "1y">("30d");

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
        <div className="bg-muted h-8 w-48 animate-pulse rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-muted h-24 animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="bg-muted h-72 animate-pulse rounded-xl" />
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

      {/* Advanced analytics — Financial Health Score + Period selector + trends + peer comparison + day-of-month */}
      <AdvancedAnalyticsSection period={period} onPeriodChange={setPeriod} />

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
            <p className="text-muted-foreground text-xs">Last 30 days</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: "oklch(0.62 0.14 162)" }}
              />{" "}
              Income
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: "oklch(0.80 0.13 75)" }}
              />{" "}
              Spending
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
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              tickFormatter={(d) => d.slice(5)}
              stroke="var(--muted-foreground)"
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => nairaCompact(v)}
              stroke="var(--muted-foreground)"
              width={55}
            />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={(v: number) => naira(v)}
            />
            <Area
              type="monotone"
              dataKey="income"
              stroke="oklch(0.62 0.14 162)"
              strokeWidth={2}
              fill="url(#inc)"
              name="Income"
            />
            <Area
              type="monotone"
              dataKey="expense"
              stroke="oklch(0.80 0.13 75)"
              strokeWidth={2}
              fill="url(#exp)"
              name="Spending"
            />
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
                  <Pie
                    data={data.spendingByCategory}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {data.spendingByCategory.map((_, i) => (
                      <Cell key={i} fill={SPEND_COLORS[i % SPEND_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => naira(v)}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="w-full flex-1 space-y-2">
                {data.spendingByCategory.slice(0, 6).map((c, i) => (
                  <div key={c.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: SPEND_COLORS[i % SPEND_COLORS.length] }}
                      />
                      {TYPE_LABELS[c.name] ?? c.name}
                      <span className="text-muted-foreground">({c.count})</span>
                    </span>
                    <span className="font-medium tabular-nums">{naira(c.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground py-8 text-center text-sm">No spending recorded</p>
          )}
        </Card>

        {/* Day-of-week pattern */}
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Calendar className="text-primary h-4 w-4" />
            <p className="text-sm font-semibold">Spending by day of week</p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.dowData} margin={{ left: -20, right: 8 }}>
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <YAxis
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => nairaCompact(v)}
                stroke="var(--muted-foreground)"
                width={50}
              />
              <Tooltip
                formatter={(v: number) => naira(v)}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Bar
                dataKey="income"
                fill="oklch(0.62 0.14 162)"
                radius={[4, 4, 0, 0]}
                name="Income"
              />
              <Bar
                dataKey="expense"
                fill="oklch(0.80 0.13 75)"
                radius={[4, 4, 0, 0]}
                name="Expense"
              />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Hour-of-day activity heat strip */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Clock className="text-primary h-4 w-4" />
          <p className="text-sm font-semibold">Activity by hour of day</p>
        </div>
        <div className="flex items-end gap-1">
          {data.hourData.map((h) => (
            <div key={h.hour} className="group relative flex-1">
              <div
                className="w-full rounded-t-sm transition-all hover:opacity-80"
                style={{
                  height: `${Math.max(4, (h.count / maxHour) * 80)}px`,
                  background:
                    h.count > 0
                      ? "linear-gradient(180deg, oklch(0.62 0.14 162), oklch(0.45 0.11 162))"
                      : "var(--muted)",
                }}
              />
              <div className="bg-popover absolute -top-7 left-1/2 z-10 -translate-x-1/2 rounded px-1.5 py-0.5 text-[10px] opacity-0 shadow group-hover:opacity-100">
                {h.hour}:00 — {h.count} tx
              </div>
              {h.hour % 4 === 0 && (
                <span className="text-muted-foreground mt-1 block text-center text-[9px]">
                  {h.hour}h
                </span>
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
            <Users className="text-primary h-4 w-4" />
            <p className="text-sm font-semibold">Top counterparties</p>
          </div>
          {data.topCounterparties.length > 0 ? (
            <div className="space-y-3">
              {data.topCounterparties.map((c, i) => {
                const maxTotal = data.topCounterparties[0].total;
                return (
                  <div key={c.name} className="flex items-center gap-3">
                    <div className="bg-primary/10 text-primary flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold">
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="text-sm font-semibold tabular-nums">{naira(c.total)}</p>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                          <div
                            className="tp-emerald-grad h-full rounded-full"
                            style={{ width: `${(c.total / maxTotal) * 100}%` }}
                          />
                        </div>
                        <span className="text-muted-foreground text-[10px]">{c.count} tx</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground py-6 text-center text-sm">No counterparties yet</p>
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
                  <p>
                    <span className="text-muted-foreground">Type:</span>{" "}
                    {TYPE_LABELS[data.largest.type] ?? data.largest.type}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Counterparty:</span>{" "}
                    {data.largest.counterpartyName ?? "—"}
                  </p>
                  {data.largest.description && (
                    <p>
                      <span className="text-muted-foreground">Note:</span>{" "}
                      {data.largest.description}
                    </p>
                  )}
                  <p>
                    <span className="text-muted-foreground">Date:</span>{" "}
                    {timeAgo(data.largest.createdAt)}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Weekly comparison */}
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <Zap className="text-primary h-4 w-4" />
              <p className="text-sm font-semibold">This week vs last week</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-emerald-500/5 p-3">
                <p className="text-muted-foreground text-xs">Income</p>
                <p className="mt-1 text-lg font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                  {naira(s.thisWeekIncome)}
                </p>
                {s.incomeWeekChange !== 0 && (
                  <p
                    className={`text-[11px] ${s.incomeWeekChange > 0 ? "text-emerald-500" : "text-red-500"}`}
                  >
                    {s.incomeWeekChange > 0 ? "↑" : "↓"} {Math.abs(s.incomeWeekChange)}% vs last
                    week
                  </p>
                )}
              </div>
              <div className="rounded-xl bg-amber-500/5 p-3">
                <p className="text-muted-foreground text-xs">Spending</p>
                <p className="mt-1 text-lg font-bold text-amber-600 tabular-nums dark:text-amber-400">
                  {naira(s.thisWeekExpense)}
                </p>
                {s.weekChange !== 0 && (
                  <p
                    className={`text-[11px] ${s.weekChange > 0 ? "text-red-500" : "text-emerald-500"}`}
                  >
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
    <Card className={`relative overflow-hidden bg-gradient-to-br p-4 ${gradient}`}>
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs">{label}</p>
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

function toneForPct(
  pct: number,
  overBudget: boolean
): {
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
    <div
      className={`bg-card rounded-2xl border p-5 shadow-sm ring-1 ${budget.overThreshold ? tone.ringClass : "ring-transparent"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{budget.categoryLabel}</p>
            {budget.overThreshold && (
              <Badge variant="destructive" className="gap-1 text-[10px]">
                <AlertTriangle className="h-3 w-3" />{" "}
                {budget.overBudget ? "Over" : `${budget.pct}%`}
              </Badge>
            )}
            {!budget.enabled && (
              <Badge variant="secondary" className="text-[10px]">
                Disabled
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Spent{" "}
            <span className="text-foreground font-medium">
              <AnimatedNumber value={budget.spentKobo} format={naira} duration={600} />
            </span>{" "}
            of {naira(budget.monthlyLimitKobo)} this month
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => onEdit(budget)}
            aria-label="Edit budget"
          >
            <Target className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-muted-foreground h-7 w-7 hover:text-red-600"
            onClick={() => onDelete(budget)}
            aria-label="Delete budget"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs">
          <span className={tone.textClass}>{budget.pct}% used</span>
          <span className="text-muted-foreground">
            {budget.overBudget ? (
              <>
                Over by{" "}
                <span className="font-medium text-red-600 dark:text-red-400">
                  {naira(budget.spentKobo - budget.monthlyLimitKobo)}
                </span>
              </>
            ) : (
              <>
                <span className="font-medium">{naira(budget.remainingKobo)}</span> left
              </>
            )}
          </span>
        </div>
        <div className="bg-muted mt-1.5 h-2 w-full overflow-hidden rounded-full">
          <div
            className={`h-full rounded-full transition-all duration-500 ${tone.barClass}`}
            style={{ width: `${Math.max(0, Math.min(100, pctClamped))}%` }}
          />
        </div>
        <p className="text-muted-foreground mt-1 text-[10px]">
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

  const totalSpent = budgets.reduce(
    (sum, b) => sum + (b.category === "TOTAL" ? b.spentKobo : 0),
    0
  );
  const totalLimit = budgets.find((b) => b.category === "TOTAL")?.monthlyLimitKobo ?? 0;

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-xl">
            <PiggyBank className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Spending budgets</p>
            <p className="text-muted-foreground text-xs">
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
            <div key={i} className="bg-muted/60 h-32 animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : budgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center">
          <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-2xl">
            <Target className="h-6 w-6" />
          </div>
          <p className="mt-3 font-medium">No budgets yet</p>
          <p className="text-muted-foreground mt-1 max-w-xs text-sm">
            Set a monthly spending cap per category and we&apos;ll alert you when you cross the
            threshold.
          </p>
          <Button size="sm" className="mt-4 gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Set your first budget
          </Button>
        </div>
      ) : (
        <>
          {/* Summary banner */}
          {totalLimit > 0 && (
            <div className="bg-muted/40 mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl p-3">
              <span className="text-muted-foreground text-xs">Total spent this month</span>
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
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditing(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="text-primary h-4 w-4" />
              {editing ? "Edit budget" : "Set a budget"}
            </DialogTitle>
            <DialogDescription>
              Choose a category, monthly limit, and the alert threshold.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="budget-cat">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v)} disabled={!!editing}>
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
                        <span className="text-muted-foreground text-[10px]">{opt.hint}</span>
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
                <p className="text-muted-foreground text-xs">
                  ={" "}
                  <span className="text-foreground font-medium">
                    {naira(parseKobo(limitInput))}
                  </span>
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
                    className="border-border bg-background hover:border-primary hover:bg-primary/5 rounded-full border px-2.5 py-1 text-xs font-medium"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="budget-threshold">Alert threshold</Label>
                <span className="text-primary text-sm font-semibold tabular-nums">
                  {threshold}%
                </span>
              </div>
              <Slider
                id="budget-threshold"
                value={[threshold]}
                min={10}
                max={100}
                step={5}
                onValueChange={(v) => setThreshold(v[0] ?? 80)}
              />
              <p className="text-muted-foreground text-[11px]">
                We&apos;ll flag the budget when usage crosses this percentage.
              </p>
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button onClick={save} disabled={saving} className="gap-1.5">
              {saving ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {editing ? "Save changes" : "Create budget"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Delete budget?
            </DialogTitle>
            <DialogDescription>
              This removes the{" "}
              <span className="text-foreground font-medium">{deleteTarget?.categoryLabel}</span>{" "}
              budget. You can always set a new one later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
              className="gap-1.5"
            >
              {deleting ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
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
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// 5-step emerald intensity scale (index 0 = no spend, 4 = heaviest).
const HEAT_LEVELS = [
  "var(--muted)", // 0 — no spending
  "oklch(0.92 0.04 162)", // 1 — light
  "oklch(0.78 0.10 162)", // 2 — medium-light
  "oklch(0.62 0.14 162)", // 3 — medium-dark
  "oklch(0.45 0.11 162)", // 4 — darkest
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
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Calendar className="text-primary h-4 w-4" />
          <p className="text-sm font-semibold">Spending activity</p>
        </div>
        <div className="bg-muted/60 h-32 w-full animate-pulse rounded-xl" />
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
  const weeks: {
    date: string;
    totalKobo: number;
    inRange: boolean;
    monthLabel: string | null;
  }[][] = [];
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
          <Calendar className="text-primary h-4 w-4" />
          <div>
            <p className="text-sm font-semibold">Spending activity</p>
            <p className="text-muted-foreground text-xs">
              Last 365 days · {activeDays} active days
            </p>
          </div>
        </div>
        <div className="text-muted-foreground flex items-center gap-3 text-xs">
          <span>
            Total:{" "}
            <span className="text-foreground font-semibold tabular-nums">
              {nairaCompact(totalKobo)}
            </span>
          </span>
          {maxDayKobo > 0 && (
            <span>
              Busiest day:{" "}
              <span className="text-foreground font-semibold tabular-nums">
                {nairaCompact(maxDayKobo)}
              </span>
            </span>
          )}
        </div>
      </div>

      {nonzeroTotals.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-10 text-center">
          <div className="bg-primary/10 text-primary flex h-11 w-11 items-center justify-center rounded-xl">
            <Calendar className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-medium">No spending in the last year</p>
          <p className="text-muted-foreground mt-1 max-w-xs text-xs">
            Once you start spending, this calendar will light up to show your daily activity.
          </p>
        </div>
      ) : (
        <>
          {/* Heatmap grid — horizontally scrollable on small screens */}
          <div className="scrollbar-thin overflow-x-auto pb-1">
            <div className="inline-flex min-w-max flex-col gap-1">
              {/* Month labels row */}
              <div className="text-muted-foreground flex gap-[3px] pl-8 text-[10px]">
                {weeks.map((week, i) => (
                  <div key={i} className="relative h-3 w-[13px]">
                    {week[0]?.monthLabel && (
                      <span className="absolute top-0 left-0 whitespace-nowrap">
                        {week[0].monthLabel}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Day-of-week labels + grid */}
              <div className="flex gap-1">
                {/* Weekday labels column */}
                <div className="text-muted-foreground flex flex-col gap-[3px] pr-1 text-[10px]">
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
                          className="group hover:ring-foreground/40 relative h-[13px] w-[13px] cursor-default rounded-[2px] transition-all hover:ring-1"
                          style={{
                            background: isFuture ? "transparent" : HEAT_LEVELS[level],
                            opacity: isFuture ? 0 : 1,
                          }}
                        >
                          {/* Hover tooltip */}
                          <div className="bg-popover ring-border pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 rounded-md px-2 py-1 text-[10px] whitespace-nowrap shadow-md ring-1 group-hover:block">
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
          <div className="text-muted-foreground mt-3 flex items-center justify-end gap-1.5 text-[10px]">
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

/* ================================================================== */
/* Advanced analytics — Financial Health Score, period selector,      */
/* category trends, peer comparison, day-of-month heat strip          */
/* ================================================================== */

interface AdvancedData {
  period: string;
  generatedAt: string;
  cashFlow: {
    totalIncome: number;
    totalExpense: number;
    netFlow: number;
    byCategory: { category: string; label: string; income: number; expense: number; net: number }[];
  };
  spendingVelocity: {
    avgDailySpend: number;
    thisWeekSpend: number;
    lastWeekSpend: number;
    weekChangePct: number;
    thisMonthSpend: number;
    lastMonthSpend: number;
    monthChangePct: number;
  };
  financialHealth: {
    score: number;
    letterGrade: string;
    factors: { key: string; label: string; points: number; maxPoints: number; detail: string }[];
  };
  predictions: {
    projectedMonthEndBalance: number;
    projectedMonthlySavings: number;
    projectedMonthIncome: number;
    projectedMonthExpense: number;
    burnRateDays: number | null;
    netDailyFlow: number;
  };
  topMerchants: { name: string; count: number; total: number }[];
  categoryTrends: {
    category: string;
    label: string;
    thisMonthKobo: number;
    lastMonthKobo: number;
    changePct: number;
    direction: "up" | "down" | "flat";
  }[];
  dayOfMonthSpend: { day: number; total: number }[];
  peerComparison: {
    monthlySpend: { you: number; peer: number; diffPct: number; label: string; better: boolean };
    airtime: { you: number; peer: number; diffPct: number; label: string; better: boolean };
    bills: { you: number; peer: number; diffPct: number; label: string; better: boolean };
    savingsRate: { you: number; peer: number; diffPct: number; label: string; better: boolean };
  };
  currentBalanceKobo: number;
  savingsBalanceKobo: number;
  txCount: number;
}

const PERIOD_OPTIONS: { value: "30d" | "90d" | "1y"; label: string }[] = [
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "1y", label: "1 year" },
];

function gradeColor(grade: string): { text: string; ring: string; bg: string } {
  switch (grade) {
    case "A":
      return {
        text: "text-emerald-600 dark:text-emerald-400",
        ring: "oklch(0.62 0.14 162)",
        bg: "bg-emerald-500/10",
      };
    case "B":
      return {
        text: "text-emerald-600 dark:text-emerald-400",
        ring: "oklch(0.65 0.12 155)",
        bg: "bg-emerald-500/10",
      };
    case "C":
      return {
        text: "text-amber-600 dark:text-amber-400",
        ring: "oklch(0.80 0.13 75)",
        bg: "bg-amber-500/10",
      };
    case "D":
      return {
        text: "text-amber-600 dark:text-amber-400",
        ring: "oklch(0.70 0.15 50)",
        bg: "bg-amber-500/10",
      };
    default:
      return {
        text: "text-red-600 dark:text-red-400",
        ring: "oklch(0.65 0.20 25)",
        bg: "bg-red-500/10",
      };
  }
}

function AdvancedAnalyticsSection({
  period,
  onPeriodChange,
}: {
  period: "30d" | "90d" | "1y";
  onPeriodChange: (p: "30d" | "90d" | "1y") => void;
}) {
  const [data, setData] = React.useState<AdvancedData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/analytics/advanced?period=${period}`, { cache: "no-store" });
        if (res.ok && !cancelled) setData(await res.json());
      } catch {
        /* non-fatal */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-56 rounded-2xl lg:col-span-1" />
          <Skeleton className="h-56 rounded-2xl lg:col-span-2" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const health = data.financialHealth;
  const grade = gradeColor(health.letterGrade);
  const circumference = 2 * Math.PI * 56; // r=56
  const dashOffset = circumference * (1 - Math.max(0, Math.min(100, health.score)) / 100);

  // Day-of-month heat strip
  const maxDaySpend = Math.max(...data.dayOfMonthSpend.map((d) => d.total), 1);
  const dayColor = (total: number) => {
    if (total <= 0) return "var(--muted)";
    const ratio = total / maxDaySpend;
    if (ratio > 0.75) return "oklch(0.45 0.11 162)";
    if (ratio > 0.5) return "oklch(0.62 0.14 162)";
    if (ratio > 0.25) return "oklch(0.78 0.10 162)";
    return "oklch(0.92 0.04 162)";
  };

  return (
    <div className="space-y-4">
      {/* Period selector row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="text-primary h-4 w-4" />
          <h2 className="text-sm font-semibold">Advanced insights</h2>
          <span className="text-muted-foreground text-xs">
            · {data.txCount} transactions · updated {timeAgo(data.generatedAt)}
          </span>
        </div>
        <div className="bg-card flex items-center gap-1 rounded-full border p-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onPeriodChange(opt.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                period === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top row: Financial Health Score + Predictions + Cash flow */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Financial Health Score — circular ring + 4 factors */}
        <Card className="p-5 lg:col-span-1">
          <div className="mb-3 flex items-center gap-2">
            <Gauge className="text-primary h-4 w-4" />
            <p className="text-sm font-semibold">Financial health score</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative h-32 w-32 shrink-0">
              <svg className="h-32 w-32 -rotate-90" viewBox="0 0 128 128">
                <circle cx="64" cy="64" r="56" fill="none" stroke="var(--muted)" strokeWidth="10" />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  fill="none"
                  stroke={grade.ring}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-3xl font-bold ${grade.text}`}>{health.score}</span>
                <span className="text-muted-foreground text-[10px]">/ 100</span>
                <span
                  className={`mt-0.5 rounded-full px-2 py-0.5 text-xs font-bold ${grade.bg} ${grade.text}`}
                >
                  Grade {health.letterGrade}
                </span>
              </div>
            </div>
            <div className="flex-1 space-y-2">
              {health.factors.map((f) => {
                const pct = Math.round((f.points / f.maxPoints) * 100);
                return (
                  <div key={f.key}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium">{f.label}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {f.points}/{f.maxPoints}
                      </span>
                    </div>
                    <div className="bg-muted mt-0.5 h-1.5 overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.max(0, Math.min(100, pct))}%`,
                          background:
                            pct >= 70
                              ? "oklch(0.62 0.14 162)"
                              : pct >= 40
                                ? "oklch(0.80 0.13 75)"
                                : "oklch(0.65 0.18 25)",
                        }}
                      />
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-[10px]">{f.detail}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Predictions */}
        <Card className="p-5 lg:col-span-1">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="text-primary h-4 w-4" />
            <p className="text-sm font-semibold">30-day forecast</p>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl bg-emerald-500/5 p-3">
              <p className="text-muted-foreground text-xs">Projected month-end balance</p>
              <p className="mt-0.5 text-xl font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                {naira(data.predictions.projectedMonthEndBalance)}
              </p>
              <p className="text-muted-foreground mt-0.5 text-[10px]">
                Current {naira(data.currentBalanceKobo)} · net/day{" "}
                <span
                  className={
                    data.predictions.netDailyFlow >= 0 ? "text-emerald-600" : "text-red-500"
                  }
                >
                  {data.predictions.netDailyFlow >= 0 ? "+" : "−"}
                  {nairaCompact(Math.abs(data.predictions.netDailyFlow))}
                </span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted/40 rounded-lg p-2">
                <p className="text-muted-foreground text-[10px]">Projected income</p>
                <p className="text-sm font-semibold tabular-nums">
                  {nairaCompact(data.predictions.projectedMonthIncome)}
                </p>
              </div>
              <div className="bg-muted/40 rounded-lg p-2">
                <p className="text-muted-foreground text-[10px]">Projected savings</p>
                <p className="text-sm font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
                  {nairaCompact(data.predictions.projectedMonthlySavings)}
                </p>
              </div>
            </div>
            {data.predictions.burnRateDays !== null && (
              <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-600 dark:text-red-400">
                <Flame className="h-3.5 w-3.5 shrink-0" />
                <span>
                  At current pace, funds run out in{" "}
                  <span className="font-bold">{data.predictions.burnRateDays} days</span>.
                </span>
              </div>
            )}
          </div>
        </Card>

        {/* Peer comparison */}
        <Card className="p-5 lg:col-span-1">
          <div className="mb-3 flex items-center gap-2">
            <Scale className="text-primary h-4 w-4" />
            <p className="text-sm font-semibold">You vs average Turbopay user</p>
          </div>
          <div className="space-y-2">
            {[
              data.peerComparison.monthlySpend,
              data.peerComparison.airtime,
              data.peerComparison.bills,
              data.peerComparison.savingsRate,
            ].map((m, i) => (
              <div key={i} className="rounded-lg border p-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{m.label}</span>
                  <span
                    className={`font-semibold tabular-nums ${m.better ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}
                  >
                    {m.diffPct > 0 ? "+" : ""}
                    {m.diffPct}% vs peer
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1">
                    <div className="text-muted-foreground flex items-center justify-between text-[10px]">
                      <span>You</span>
                      <span>Peer</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1">
                      <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                        <div
                          className="bg-primary h-full rounded-full"
                          style={{
                            width: `${Math.min(100, (m.you / Math.max(1, Math.max(m.you, m.peer))) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                        <div
                          className="bg-muted-foreground/40 h-full rounded-full"
                          style={{
                            width: `${Math.min(100, (m.peer / Math.max(1, Math.max(m.you, m.peer))) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-muted-foreground mt-1 text-[10px] tabular-nums">
                  You: {m.label === "Savings rate" ? `${m.you}%` : nairaCompact(m.you)} · Peer:{" "}
                  {m.label === "Savings rate" ? `${m.peer}%` : nairaCompact(m.peer)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Category trends (MoM up/down) */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="text-primary h-4 w-4" />
          <p className="text-sm font-semibold">Category trends — month over month</p>
          <span className="text-muted-foreground ml-auto text-xs">
            {data.categoryTrends.length} categories tracked
          </span>
        </div>
        {data.categoryTrends.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.categoryTrends.slice(0, 9).map((c) => {
              const Icon =
                c.direction === "up" ? ArrowUp : c.direction === "down" ? ArrowDown : Minus;
              const tone =
                c.direction === "up"
                  ? "text-red-600 dark:text-red-400 bg-red-500/10"
                  : c.direction === "down"
                    ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                    : "text-muted-foreground bg-muted";
              return (
                <div key={c.category} className="flex items-center gap-3 rounded-xl border p-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.label}</p>
                    <p className="text-muted-foreground text-[11px] tabular-nums">
                      {nairaCompact(c.thisMonthKobo)} this month
                      {c.lastMonthKobo > 0 && <> · {nairaCompact(c.lastMonthKobo)} last</>}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold tabular-nums ${tone.split(" ")[0]}`}>
                    {c.changePct > 0 ? "+" : ""}
                    {c.changePct}%
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Not enough history to compute month-over-month trends yet.
          </p>
        )}
      </Card>

      {/* Day-of-month heat strip */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Calendar className="text-primary h-4 w-4" />
          <div>
            <p className="text-sm font-semibold">Spending by day of month</p>
            <p className="text-muted-foreground text-xs">
              See which days of the month you spend most — helps spot pay-cycle patterns.
            </p>
          </div>
        </div>
        <div className="scrollbar-thin flex items-end gap-0.5 overflow-x-auto pb-1">
          {data.dayOfMonthSpend.map((d) => (
            <div key={d.day} className="group relative min-w-[14px] flex-1">
              <div
                className="w-full rounded-t-sm transition-all hover:opacity-80"
                style={{
                  height: `${Math.max(4, (d.total / maxDaySpend) * 70)}px`,
                  background: dayColor(d.total),
                }}
              />
              <div className="bg-popover absolute -top-7 left-1/2 z-10 -translate-x-1/2 rounded px-1.5 py-0.5 text-[10px] whitespace-nowrap opacity-0 shadow group-hover:opacity-100">
                Day {d.day} · {nairaCompact(d.total)}
              </div>
              {(d.day === 1 || d.day % 5 === 0) && (
                <span className="text-muted-foreground mt-1 block text-center text-[9px]">
                  {d.day}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="text-muted-foreground mt-3 flex items-center justify-end gap-1.5 text-[10px]">
          <span>Less</span>
          {[
            "var(--muted)",
            "oklch(0.92 0.04 162)",
            "oklch(0.78 0.10 162)",
            "oklch(0.62 0.14 162)",
            "oklch(0.45 0.11 162)",
          ].map((bg, i) => (
            <span key={i} className="h-[11px] w-[11px] rounded-[2px]" style={{ background: bg }} />
          ))}
          <span>More</span>
        </div>
      </Card>

      {/* Top merchants + cash flow velocity summary */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-semibold">Top 5 merchants</p>
          </div>
          {data.topMerchants.length > 0 ? (
            <div className="space-y-2">
              {data.topMerchants.map((m, i) => {
                const maxTotal = data.topMerchants[0].total;
                return (
                  <div key={m.name} className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                        i === 0
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : i === 1
                            ? "bg-muted text-muted-foreground"
                            : "bg-muted/60 text-muted-foreground"
                      }`}
                    >
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="truncate text-sm font-medium">{m.name}</p>
                        <p className="text-sm font-semibold tabular-nums">{naira(m.total)}</p>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                          <div
                            className="tp-amber-grad h-full rounded-full"
                            style={{ width: `${(m.total / maxTotal) * 100}%` }}
                          />
                        </div>
                        <span className="text-muted-foreground text-[10px]">{m.count} tx</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No merchant activity in this period
            </p>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Zap className="text-primary h-4 w-4" />
            <p className="text-sm font-semibold">Spending velocity</p>
          </div>
          <div className="space-y-3">
            <div className="bg-muted/40 rounded-xl p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Avg daily spend</span>
                <span className="font-bold tabular-nums">
                  {naira(data.spendingVelocity.avgDailySpend)}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-[10px]">This week</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums">
                  {nairaCompact(data.spendingVelocity.thisWeekSpend)}
                </p>
                {data.spendingVelocity.weekChangePct !== 0 && (
                  <p
                    className={`text-[10px] ${data.spendingVelocity.weekChangePct > 0 ? "text-red-500" : "text-emerald-500"}`}
                  >
                    {data.spendingVelocity.weekChangePct > 0 ? "↑" : "↓"}{" "}
                    {Math.abs(data.spendingVelocity.weekChangePct)}% vs last week
                  </p>
                )}
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-[10px]">This month</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums">
                  {nairaCompact(data.spendingVelocity.thisMonthSpend)}
                </p>
                {data.spendingVelocity.monthChangePct !== 0 && (
                  <p
                    className={`text-[10px] ${data.spendingVelocity.monthChangePct > 0 ? "text-red-500" : "text-emerald-500"}`}
                  >
                    {data.spendingVelocity.monthChangePct > 0 ? "↑" : "↓"}{" "}
                    {Math.abs(data.spendingVelocity.monthChangePct)}% vs last month
                  </p>
                )}
              </div>
            </div>
            <div className="border-primary/20 bg-primary/5 rounded-xl border p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Net cash flow ({period})</span>
                <span
                  className={`font-bold tabular-nums ${data.cashFlow.netFlow >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                >
                  {data.cashFlow.netFlow >= 0 ? "+" : "−"}
                  {nairaCompact(Math.abs(data.cashFlow.netFlow))}
                </span>
              </div>
              <div className="text-muted-foreground mt-1 flex items-center justify-between text-[10px]">
                <span>Income: {nairaCompact(data.cashFlow.totalIncome)}</span>
                <span>Expense: {nairaCompact(data.cashFlow.totalExpense)}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
