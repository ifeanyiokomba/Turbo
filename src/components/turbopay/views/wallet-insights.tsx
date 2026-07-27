"use client";

import * as React from "react";
import { useApp } from "../store";
import { PageHeader, EmptyState } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Wallet as WalletIcon,
  PiggyBank,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  Repeat,
  Sparkles,
  RefreshCw,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import { naira, nairaCompact, nairaPlain, timeAgo, formatDate } from "@/lib/money";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types — mirror the API response shape
// ---------------------------------------------------------------------------

interface RecurringExpense {
  counterpartyName: string;
  averageAmountKobo: number;
  totalAmountKobo: number;
  count: number;
  frequency: "WEEKLY" | "MONTHLY" | "IRREGULAR";
  lastOccurrence: string;
  firstOccurrence: string;
}

interface IncomeSource {
  type: string;
  label: string;
  amountKobo: number;
  count: number;
}

interface Insights {
  currentBalance: number;
  avgMonthlyIncome: number;
  avgMonthlyExpense: number;
  projectedMonthEndBalance: number;
  burnRateDays: number | null;
  savingsRatePct: number | null;
  recurringExpenses: RecurringExpense[];
  spendingTrendPct: number | null;
  incomeSources: IncomeSource[];
}

// ---------------------------------------------------------------------------
// Brand palette — emerald + amber only (no indigo/blue)
// ---------------------------------------------------------------------------

const EMERALD = "oklch(0.62 0.14 162)";
const EMERALD_DARK = "oklch(0.45 0.11 162)";
const AMBER = "oklch(0.80 0.13 75)";
const AMBER_DEEP = "oklch(0.66 0.15 60)";
const RED = "oklch(0.62 0.22 25)";
const SLATE = "oklch(0.65 0.02 250)";

const INCOME_COLORS: Record<string, string> = {
  FUNDING: EMERALD,
  REFERRAL: AMBER,
  REWARD: AMBER_DEEP,
};

const FREQ_LABELS: Record<RecurringExpense["frequency"], string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  IRREGULAR: "Irregular",
};

const FREQ_BADGE_CLASS: Record<RecurringExpense["frequency"], string> = {
  WEEKLY: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  MONTHLY: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  IRREGULAR: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
};

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function WalletInsightsView() {
  const { setView } = useApp();
  const [data, setData] = React.useState<Insights | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wallet/insights", { cache: "no-store" });
      if (res.ok) {
        setData(await res.json());
      } else if (res.status === 401) {
        toast.error("Session expired. Please log in again.");
      } else {
        toast.error("Failed to load insights.");
      }
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // 30-day projection series
  const projectionData = React.useMemo(() => {
    if (!data) return [];
    const days: { day: string; balance: number }[] = [];
    const dailyNet = data.avgMonthlyIncome / 30 - data.avgMonthlyExpense / 30;
    let bal = data.currentBalance;
    const today = new Date();
    for (let i = 0; i <= 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      days.push({
        day: d.toLocaleDateString("en-NG", { day: "numeric", month: "short" }),
        balance: Math.max(0, Math.round(bal)),
      });
      bal += dailyNet;
    }
    return days;
  }, [data]);

  const incomePieData = React.useMemo(() => {
    if (!data) return [];
    return data.incomeSources
      .filter((s) => s.amountKobo > 0)
      .map((s) => ({ name: s.label, value: s.amountKobo, type: s.type }));
  }, [data]);

  const totalIncomeSources = incomePieData.reduce((s, x) => s + x.value, 0);

  return (
    <div className="tp-fade-rise space-y-6">
      <PageHeader
        title="Wallet Insights"
        subtitle="Cash flow forecast, projections and recurring expense detection."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setView("wallet")}
              className="gap-1.5"
            >
              <WalletIcon className="h-4 w-4" /> Wallet
            </Button>
          </>
        }
      />

      {/* Top row — 4 gradient stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <>
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </>
        ) : data ? (
          <>
            <GradientStatCard
              label="Avg monthly income"
              value={naira(data.avgMonthlyIncome)}
              icon={TrendingUp}
              gradient="from-emerald-500 to-emerald-600"
              iconBg="bg-white/20 text-white"
              textTone="text-white"
              labelTone="text-white/80"
              hint="Last 3 months"
            />
            <GradientStatCard
              label="Avg monthly expense"
              value={naira(data.avgMonthlyExpense)}
              icon={TrendingDown}
              gradient="from-amber-500 to-amber-600"
              iconBg="bg-white/20 text-white"
              textTone="text-white"
              labelTone="text-white/80"
              hint="Last 3 months"
            />
            <GradientStatCard
              label="Projected month-end"
              value={naira(data.projectedMonthEndBalance)}
              icon={WalletIcon}
              gradient={
                data.projectedMonthEndBalance >= data.currentBalance
                  ? "from-emerald-600 to-emerald-700"
                  : "from-amber-600 to-rose-600"
              }
              iconBg="bg-white/20 text-white"
              textTone="text-white"
              labelTone="text-white/80"
              hint={
                data.projectedMonthEndBalance >= data.currentBalance
                  ? "↑ vs current"
                  : "↓ vs current"
              }
            />
            <GradientStatCard
              label="Savings rate"
              value={
                data.savingsRatePct === null
                  ? "—"
                  : `${data.savingsRatePct >= 0 ? "+" : ""}${data.savingsRatePct}%`
              }
              icon={PiggyBank}
              gradient={
                data.savingsRatePct === null
                  ? "from-slate-600 to-slate-700"
                  : data.savingsRatePct >= 20
                    ? "from-emerald-500 to-emerald-700"
                    : data.savingsRatePct >= 0
                      ? "from-amber-500 to-amber-700"
                      : "from-rose-500 to-rose-700"
              }
              iconBg="bg-white/20 text-white"
              textTone="text-white"
              labelTone="text-white/80"
              hint={
                data.savingsRatePct === null
                  ? "No income yet"
                  : data.savingsRatePct >= 20
                    ? "Healthy"
                    : data.savingsRatePct >= 0
                      ? "Building up"
                      : "Spending > income"
              }
            />
          </>
        ) : null}
      </div>

      {/* Cash flow projection chart + Burn rate side card */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">30-day cash flow projection</p>
              <p className="text-muted-foreground text-xs">
                Forecast based on your 3-month income & spend rate
              </p>
            </div>
            <Badge
              variant="secondary"
              className={
                data && data.avgMonthlyIncome >= data.avgMonthlyExpense
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              }
            >
              {data && data.avgMonthlyIncome >= data.avgMonthlyExpense ? (
                <TrendingUp className="mr-1 h-3 w-3" />
              ) : (
                <TrendingDown className="mr-1 h-3 w-3" />
              )}
              {data && data.avgMonthlyIncome >= data.avgMonthlyExpense ? "Growing" : "Declining"}
            </Badge>
          </div>
          {loading ? (
            <Skeleton className="h-72 w-full rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={projectionData} margin={{ left: -10, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={
                        data && data.avgMonthlyIncome >= data.avgMonthlyExpense ? EMERALD : AMBER
                      }
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="95%"
                      stopColor={
                        data && data.avgMonthlyIncome >= data.avgMonthlyExpense ? EMERALD : AMBER
                      }
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10 }}
                  stroke="var(--muted-foreground)"
                  interval={3}
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
                  labelFormatter={(l) => `Day ${l}`}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke={data && data.avgMonthlyIncome >= data.avgMonthlyExpense ? EMERALD : AMBER}
                  strokeWidth={2.5}
                  fill="url(#balFill)"
                  name="Projected balance"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Burn rate card */}
        <BurnRateCard data={data} loading={loading} />
      </div>

      {/* Recurring expenses + spending trend */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <Repeat className="text-primary h-4 w-4" />
            <p className="text-sm font-semibold">Top recurring expenses</p>
            <span className="text-muted-foreground ml-auto text-xs">Last 90 days</span>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : data && data.recurringExpenses.length > 0 ? (
            <div className="space-y-2.5">
              {data.recurringExpenses.map((r, i) => (
                <div
                  key={`${r.counterpartyName}-${i}`}
                  className="bg-card hover:bg-muted/40 flex items-center gap-3 rounded-xl border p-3 transition-colors"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    <Repeat className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{r.counterpartyName}</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {naira(r.averageAmountKobo)}
                      </p>
                    </div>
                    <div className="text-muted-foreground mt-0.5 flex items-center justify-between gap-2 text-xs">
                      <span>
                        {r.count}× · last {timeAgo(r.lastOccurrence)}
                      </span>
                      <Badge
                        variant="secondary"
                        className={`h-5 gap-1 px-1.5 text-[10px] ${FREQ_BADGE_CLASS[r.frequency]}`}
                      >
                        <Calendar className="h-2.5 w-2.5" />
                        {FREQ_LABELS[r.frequency]}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Repeat}
              title="No recurring expenses detected"
              description="We'll spot your repeat payments (same recipient, similar amount) over the last 90 days."
            />
          )}
        </Card>

        {/* Spending trend card */}
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="text-primary h-4 w-4" />
            <p className="text-sm font-semibold">Spending trend</p>
          </div>
          {loading ? (
            <Skeleton className="h-32 w-full rounded-xl" />
          ) : data ? (
            <SpendingTrendBlock pct={data.spendingTrendPct} />
          ) : null}
        </Card>
      </div>

      {/* Income sources donut */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="text-primary h-4 w-4" />
          <p className="text-sm font-semibold">Income sources</p>
          <span className="text-muted-foreground ml-auto text-xs">Last 3 months</span>
        </div>
        {loading ? (
          <Skeleton className="h-56 w-full rounded-xl" />
        ) : totalIncomeSources > 0 ? (
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <ResponsiveContainer width="100%" height={220} className="sm:!w-1/2">
              <PieChart>
                <Pie
                  data={incomePieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {incomePieData.map((entry) => (
                    <Cell key={entry.type} fill={INCOME_COLORS[entry.type] ?? SLATE} />
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
            <div className="w-full flex-1 space-y-3">
              {incomePieData.map((s) => {
                const pct =
                  totalIncomeSources > 0 ? Math.round((s.value / totalIncomeSources) * 100) : 0;
                return (
                  <div key={s.type} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: INCOME_COLORS[s.type] ?? SLATE }}
                        />
                        <span className="font-medium">{s.name}</span>
                        <span className="text-muted-foreground text-xs">({pct}%)</span>
                      </span>
                      <span className="font-semibold tabular-nums">{naira(s.value)}</span>
                    </div>
                    <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: INCOME_COLORS[s.type] ?? SLATE,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="mt-2 flex items-center justify-between border-t pt-3 text-sm">
                <span className="text-muted-foreground">Total income (3mo)</span>
                <span className="font-bold tabular-nums">{naira(totalIncomeSources)}</span>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Sparkles}
            title="No income recorded yet"
            description="Fund your wallet or earn referral / reward credits to see income sources here."
            action={
              <Button size="sm" onClick={() => setView("wallet")} className="gap-1.5">
                <WalletIcon className="h-4 w-4" /> Fund wallet
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            }
          />
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GradientStatCard({
  label,
  value,
  icon: Icon,
  gradient,
  iconBg,
  textTone,
  labelTone,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  iconBg: string;
  textTone: string;
  labelTone: string;
  hint?: string;
}) {
  return (
    <Card className={`relative overflow-hidden bg-gradient-to-br p-5 ${gradient} border-0`}>
      <div className="absolute -top-4 -right-4 h-20 w-20 rounded-full bg-white/10 blur-xl" />
      <div className="relative flex items-center justify-between">
        <p className={`text-xs font-medium ${labelTone}`}>{label}</p>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className={`relative mt-3 text-xl font-bold tabular-nums ${textTone}`}>{value}</p>
      {hint && <p className={`relative mt-0.5 text-[11px] ${labelTone}`}>{hint}</p>}
    </Card>
  );
}

function BurnRateCard({ data, loading }: { data: Insights | null; loading: boolean }) {
  if (loading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-40 w-full rounded-xl" />
      </Card>
    );
  }

  const growing = data?.burnRateDays === null;
  const days = data?.burnRateDays ?? 0;

  return (
    <Card
      className={`relative overflow-hidden p-5 ${
        growing
          ? "border-emerald-500/30 bg-emerald-500/5"
          : days <= 14
            ? "border-rose-500/30 bg-rose-500/5"
            : "border-amber-500/30 bg-amber-500/5"
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl ${
            growing
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : days <= 14
                ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          }`}
        >
          {growing ? <CheckCircle2 className="h-5 w-5" /> : <Flame className="h-5 w-5" />}
        </div>
        <p className="text-sm font-semibold">Burn rate</p>
      </div>

      {growing ? (
        <div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            Your wallet is growing
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            On average, you earn more than you spend. Keep it up — your balance is trending upward.
          </p>
          <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
            <ArrowUpRight className="h-3.5 w-3.5" />
            Net positive cash flow
          </div>
        </div>
      ) : (
        <div>
          <p className="text-2xl font-bold tabular-nums">
            {days}{" "}
            <span className="text-muted-foreground text-base font-medium">
              {days === 1 ? "day" : "days"}
            </span>
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            At your current spend rate, your wallet will be empty in{" "}
            <span className="text-foreground font-medium">{days} days</span>.
          </p>
          <div
            className={`mt-3 flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs ${
              days <= 14
                ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
            }`}
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {days <= 14
                ? "Critical — consider reducing discretionary spending."
                : "Slow burn — review recurring expenses soon."}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

function SpendingTrendBlock({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        Not enough data to compute a trend.
      </p>
    );
  }
  const up = pct > 0;
  const flat = pct === 0;
  const tone = flat
    ? "text-slate-600 dark:text-slate-300"
    : up
      ? "text-rose-600 dark:text-rose-400"
      : "text-emerald-600 dark:text-emerald-400";
  const Icon = flat ? TrendingUp : up ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="flex flex-col items-center justify-center py-2 text-center">
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-full ${
          flat ? "bg-slate-500/15" : up ? "bg-rose-500/15" : "bg-emerald-500/15"
        } ${tone}`}
      >
        <Icon className="h-7 w-7" />
      </div>
      <p className={`mt-3 text-3xl font-bold tabular-nums ${tone}`}>
        {flat ? "0%" : `${up ? "+" : "−"}${Math.abs(pct)}%`}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">This month vs last month</p>
      <p className="text-muted-foreground mt-2 text-[11px]">
        {flat
          ? "Spending is steady"
          : up
            ? "You're spending more than last month"
            : "You're spending less than last month"}
      </p>
    </div>
  );
}
