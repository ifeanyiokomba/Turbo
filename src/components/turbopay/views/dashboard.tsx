"use client";

import * as React from "react";
import { useApp } from "../store";
import { BalanceCard } from "../parts/balance-card";
import { TransactionItem } from "../parts/transaction-item";
import { StatCard, EmptyState } from "../parts/layout";
import { BalanceCardSkeleton, StatCardSkeleton } from "../parts/skeletons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from "recharts";
import {
  ArrowDownLeft, ArrowUpRight, Activity, Wallet as WalletIcon, ArrowLeftRight,
  Smartphone, Receipt, CreditCard, PiggyBank, Plus, ChevronRight, ShieldAlert,
  QrCode,
  BarChart3,
  TrendingUp, TrendingDown, CalendarDays, Lightbulb,
  Crown, Sparkles,
  CheckCircle2, Circle, KeyRound, Mail, Phone, BadgeCheck, PartyPopper,
  Award, Lock as LockIcon, Send, Coins, ShoppingBag, Bird, Gift, ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { naira, nairaCompact, formatDate } from "@/lib/money";
import { BADGE_COLOR_CLASSES, type BadgeKey } from "@/lib/badges";
import { toast } from "sonner";

interface DashData {
  wallet: { balanceKobo: number; currency: string; status: string } | null;
  virtualAccount: { accountNumber: string; accountName: string; bankName: string } | null;
  recent: any[];
  cashflow: { date: string; inflow: number; outflow: number }[];
  stats: { moneyIn: number; moneyOut: number; netFlow: number; txCount: number };
  spending: { name: string; value: number }[];
}

interface AnalyticsData {
  stats: {
    totalIncome30: number;
    totalExpense30: number;
    txCount30: number;
    thisWeekExpense: number;
    lastWeekExpense: number;
    weekChange: number;
    thisWeekIncome: number;
    lastWeekIncome: number;
    incomeWeekChange: number;
    avgTxSize: number;
  };
  spendingByCategory: { name: string; value: number; count: number }[];
  incomeByCategory: { name: string; value: number; count: number }[];
  dowData: { day: string; income: number; expense: number }[];
}

interface TxItem {
  id: string;
  type: string;
  status: string;
  direction: string;
  createdAt: string;
  amountKobo: number;
}

interface InsightsData {
  analytics: AnalyticsData | null;
  transactions: TxItem[];
}

interface BadgePayload {
  key: string;
  name: string;
  description: string;
  icon: string;
  color: "emerald" | "amber" | "violet" | "sky" | "rose";
  earned: boolean;
  earnedAt: string | null;
}

interface BadgesData {
  badges: BadgePayload[];
  stats: { earned: number; total: number; completionPct: number };
}

const SPEND_COLORS = ["oklch(0.62 0.14 162)", "oklch(0.80 0.13 75)", "oklch(0.65 0.18 250)", "oklch(0.70 0.20 18)", "oklch(0.60 0.14 155)", "oklch(0.65 0.18 303)"];

const TYPE_LABELS: Record<string, string> = {
  FUNDING: "Funding", TRANSFER: "Transfer", AIRTIME: "Airtime", DATA: "Data",
  BILL: "Bills", CARD_FUND: "Card topup", CARD_WITHDRAW: "Card withdraw",
  REWARD: "Reward", REFERRAL: "Referral", SAVINGS_DEPOSIT: "Savings", SAVINGS_WITHDRAW: "Savings", INVESTMENT: "Investment",
};

export default function DashboardView() {
  const { user, setView } = useApp();
  const [data, setData] = React.useState<DashData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [hideBalance, setHideBalance] = React.useState(false);
  const [insights, setInsights] = React.useState<InsightsData | null>(null);
  const [badges, setBadges] = React.useState<BadgesData | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  // Load insights (analytics + recent transactions for day-of-week counts) and
  // badges in parallel — both decorative, non-fatal.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [aRes, tRes, bRes] = await Promise.all([
          fetch("/api/analytics", { cache: "no-store" }),
          fetch("/api/transactions?limit=100", { cache: "no-store" }),
          fetch("/api/badges", { cache: "no-store" }),
        ]);
        const a = aRes.ok ? await aRes.json() : null;
        const t = tRes.ok ? await tRes.json() : null;
        const b = bRes.ok ? await bRes.json() : null;
        if (cancelled) return;
        if (a || t) setInsights({ analytics: a, transactions: t?.transactions ?? [] });
        if (b) setBadges(b);
      } catch {
        /* non-fatal — insights are decorative */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = user?.fullName.split(" ")[0] ?? "there";

  const quickActions = [
    { label: "Transfer", icon: ArrowLeftRight, view: "transfer" as const, color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    { label: "QR", icon: QrCode, view: "qr" as const, color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    { label: "Airtime", icon: Smartphone, view: "airtime" as const, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
    { label: "Bills", icon: Receipt, view: "bills" as const, color: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
    { label: "Cards", icon: CreditCard, view: "cards" as const, color: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
    { label: "Save", icon: PiggyBank, view: "savings" as const, color: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Greeting skeleton */}
        <div className="space-y-2">
          <div className="h-7 w-56 animate-pulse rounded-full bg-muted" />
          <div className="h-4 w-40 animate-pulse rounded-full bg-muted/70" />
        </div>
        <BalanceCardSkeleton />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        {/* Cashflow / recent placeholder */}
        <Card className="p-5">
          <div className="mb-4 h-4 w-32 animate-pulse rounded-full bg-muted" />
          <div className="h-[220px] w-full animate-pulse rounded-xl bg-muted/60" />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{greeting}, {firstName} 👋</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your money at a glance</p>
        </div>
        {user && user.kycStatus !== "VERIFIED" && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setView("kyc")}>
            <ShieldAlert className="h-4 w-4 text-amber-500" /> Upgrade KYC
          </Button>
        )}
      </div>

      {/* KYC banner */}
      {user && user.kycStatus !== "VERIFIED" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-sm font-medium">Complete your KYC to unlock higher limits</p>
              <p className="text-xs text-muted-foreground">Tier {user.kycTier} · Max ₦50,000 per transaction. Verify NIN or BVN to do more.</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setView("kyc")}>Verify now</Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Balance card */}
          {data?.wallet && (
            <BalanceCard
              balanceKobo={data.wallet.balanceKobo}
              accountNumber={data.virtualAccount?.accountNumber}
              accountName={data.virtualAccount?.accountName}
              onFund={() => setView("wallet")}
              onTransfer={() => setView("transfer")}
              hideBalance={hideBalance}
              onToggleHide={() => setHideBalance((v) => !v)}
            />
          )}

          {/* Quick actions */}
          <Card className="p-4">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {quickActions.map((a) => (
                <button
                  key={a.label}
                  onClick={() => setView(a.view)}
                  className="flex flex-col items-center gap-2 rounded-xl p-2 transition-colors hover:bg-muted/60"
                >
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${a.color}`}>
                    <a.icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-medium">{a.label}</span>
                </button>
              ))}
            </div>
          </Card>

          {/* Cashflow chart */}
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Cashflow</p>
                <p className="text-xs text-muted-foreground">Last 14 days</p>
              </div>
              <Badge variant="secondary" className="gap-1">
                <Activity className="h-3 w-3" /> {data?.stats.txCount ?? 0} transactions
              </Badge>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data?.cashflow ?? []} margin={{ left: -20, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="inflow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="oklch(0.62 0.14 162)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="oklch(0.62 0.14 162)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="outflow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="oklch(0.80 0.13 75)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="oklch(0.80 0.13 75)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => nairaCompact(v)} stroke="var(--muted-foreground)" width={50} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                  formatter={(v: number) => naira(v)}
                  labelFormatter={(d) => ` ${d}`}
                />
                <Area type="monotone" dataKey="inflow" stroke="oklch(0.62 0.14 162)" strokeWidth={2} fill="url(#inflow)" name="In" />
                <Area type="monotone" dataKey="outflow" stroke="oklch(0.80 0.13 75)" strokeWidth={2} fill="url(#outflow)" name="Out" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Spending insights */}
          <InsightsSection insights={insights} setView={setView} />

          {/* Recent transactions */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Recent transactions</p>
              <button onClick={() => setView("history")} className="flex items-center gap-1 text-xs text-primary hover:underline">
                View all <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            {data?.recent && data.recent.length > 0 ? (
              <div className="space-y-1">
                {data.recent.map((tx) => (
                  <TransactionItem key={tx.id} tx={tx} onClick={() => setView("history")} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={WalletIcon}
                title="No transactions yet"
                description="Fund your wallet to get started."
                action={<Button size="sm" onClick={() => setView("wallet")} className="gap-1.5"><Plus className="h-4 w-4" /> Fund wallet</Button>}
              />
            )}
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-2">
            <StatCard
              label="Money in (14d)"
              value={naira(data?.stats.moneyIn ?? 0)}
              icon={ArrowDownLeft}
              tone="success"
              animated
              numericValue={data?.stats.moneyIn ?? 0}
              format={naira}
            />
            <StatCard
              label="Money out (14d)"
              value={naira(data?.stats.moneyOut ?? 0)}
              icon={ArrowUpRight}
              tone="warning"
              animated
              numericValue={data?.stats.moneyOut ?? 0}
              format={naira}
            />
            <StatCard
              label="Net flow"
              value={naira(data?.stats.netFlow ?? 0)}
              icon={Activity}
              tone="default"
              animated
              numericValue={data?.stats.netFlow ?? 0}
              format={naira}
              hint={`${data?.stats.txCount ?? 0} successful`}
            />
            <StatCard
              label="Transactions"
              value={String(data?.stats.txCount ?? 0)}
              icon={ArrowLeftRight}
              tone="success"
              animated
              numericValue={data?.stats.txCount ?? 0}
              format={(n) => Math.round(n).toLocaleString()}
              hint="Last 14 days"
            />
          </div>

          {/* Quick analytics link */}
          <Card className="group cursor-pointer p-4 transition-all hover:-translate-y-0.5 hover:shadow-md" onClick={() => setView("analytics")}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-sky-500/10 text-violet-600 dark:text-violet-400">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">View full analytics</p>
                <p className="text-xs text-muted-foreground">Trends, categories, insights</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
          </Card>

          {/* Recent badges */}
          <RecentBadgesCard badges={badges} setView={setView} />

          {/* Monthly spending ring */}
          {data?.stats && data.stats.moneyOut > 0 && (
            <Card className="p-5">
              <p className="mb-1 text-sm font-semibold">Monthly spending</p>
              <p className="mb-3 text-xs text-muted-foreground">vs ₦500,000 budget</p>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={100} height={100}>
                  <RadialBarChart innerRadius="65%" outerRadius="100%" data={[{ name: "spent", value: Math.min(100, (data.stats.moneyOut / 5000000) * 100), fill: data.stats.moneyOut > 4000000 ? "oklch(0.70 0.20 18)" : "oklch(0.62 0.14 162)" }]} startAngle={90} endAngle={-270}>
                    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                    <RadialBar background={{ fill: "var(--muted)" }} dataKey="value" cornerRadius={8} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div>
                  <p className="text-lg font-bold tabular-nums">{naira(data.stats.moneyOut)}</p>
                  <p className="text-xs text-muted-foreground">of ₦50,000 (14d)</p>
                  <Badge variant="secondary" className="mt-1.5 text-[10px]">
                    {Math.round((data.stats.moneyOut / 5000000) * 100)}% used
                  </Badge>
                </div>
              </div>
            </Card>
          )}

          {/* Spending breakdown */}
          <Card className="p-5">
            <p className="mb-3 text-sm font-semibold">Spending breakdown</p>
            {data?.spending && data.spending.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={data.spending} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {data.spending.map((_, i) => (
                        <Cell key={i} fill={SPEND_COLORS[i % SPEND_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => naira(v)} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 space-y-1.5">
                  {data.spending.slice(0, 5).map((s, i) => (
                    <div key={s.name} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: SPEND_COLORS[i % SPEND_COLORS.length] }} />
                        {TYPE_LABELS[s.name] ?? s.name}
                      </span>
                      <span className="font-medium tabular-nums">{naira(s.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No spending yet</p>
            )}
          </Card>

          {/* Profile completion progress */}
          <ProfileCompletionCard setView={setView} />
        </div>
      </div>
    </div>
  );
}

/* ================================================================= */
/* Recent badges — small card in the dashboard right column            */
/* ================================================================= */

const DASHBOARD_BADGE_ICONS: Record<string, LucideIcon> = {
  Wallet: WalletIcon, Send, Smartphone, Receipt, CreditCard, PiggyBank, TrendingUp,
  BadgeCheck, LockIcon, Coins, ShoppingBag, Bird, Gift, ShieldCheck,
};

function resolveBadgeIcon(name: string): LucideIcon {
  return DASHBOARD_BADGE_ICONS[name] ?? Award;
}

function RecentBadgesCard({
  badges,
  setView,
}: {
  badges: BadgesData | null;
  setView: (v: "achievements") => void;
}) {
  // Loading skeleton
  if (!badges) {
    return (
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="tp-skeleton-shimmer h-4 w-28 rounded-full" />
          <div className="tp-skeleton-shimmer h-3 w-12 rounded-full" />
        </div>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="tp-skeleton-shimmer h-10 w-full rounded-xl" />
          ))}
        </div>
      </Card>
    );
  }

  const earned = badges.badges
    .filter((b) => b.earned)
    .sort((a, b) => (b.earnedAt ?? "").localeCompare(a.earnedAt ?? ""))
    .slice(0, 3);
  const stats = badges.stats;

  return (
    <Card className="relative overflow-hidden p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-amber-500/5"
      />
      <div className="relative">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Award className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">Your badges</p>
              <p className="text-[10px] text-muted-foreground">
                {stats.earned} of {stats.total} unlocked
              </p>
            </div>
          </div>
          <button
            onClick={() => setView("achievements")}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            View all <ChevronRight className="h-3 w-3" />
          </button>
        </div>

        {earned.length > 0 ? (
          <div className="space-y-2">
            {earned.map((b) => {
              const Icon = resolveBadgeIcon(b.icon);
              const colors = BADGE_COLOR_CLASSES[b.color as BadgeKey] ?? BADGE_COLOR_CLASSES.emerald;
              return (
                <div
                  key={b.key}
                  className={`flex items-center gap-3 rounded-xl bg-gradient-to-br ${colors.grad} p-2.5 ring-1 ${colors.ring}`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/70 dark:bg-white/10">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{b.name}</p>
                    {b.earnedAt && (
                      <p className="text-[10px] text-muted-foreground">
                        {formatDate(b.earnedAt)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            {/* Completion mini-bar */}
            <div className="pt-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Completion</span>
                <span className="font-medium tabular-nums">{stats.completionPct}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${stats.completionPct}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <LockIcon className="h-4 w-4" />
            </div>
            <p className="mt-2 text-xs font-medium">No badges yet</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Fund your wallet to earn your first badge.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-7 gap-1 px-2 text-[11px]"
              onClick={() => setView("achievements")}
            >
              See all badges <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ================================================================= */
/* Spending insights — 4 smart cards below the cashflow chart        */
/* ================================================================= */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_FULL: Record<string, string> = {
  Sun: "Sunday", Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday",
  Thu: "Thursday", Fri: "Friday", Sat: "Saturday",
};

function pickSmartTip(opts: {
  topCategory: { name: string; value: number } | null;
  weekChange: number;
  savingsRate: number;
  totalIncome: number;
  totalExpense: number;
}): { icon: React.ComponentType<{ className?: string }>; tone: string; tip: string } {
  const { topCategory, weekChange, savingsRate, totalExpense } = opts;

  if (totalExpense <= 0) {
    return {
      icon: Sparkles,
      tone: "from-emerald-500/15 to-emerald-600/5 text-emerald-600 dark:text-emerald-400",
      tip: "No spending in the last 30 days. Perfect time to set savings goals for the months ahead.",
    };
  }

  // Spending dropped significantly vs last week
  if (weekChange <= -10) {
    return {
      icon: TrendingDown,
      tone: "from-emerald-500/15 to-emerald-600/5 text-emerald-600 dark:text-emerald-400",
      tip: `You spent ${Math.abs(weekChange)}% less this week vs last week. Keep the momentum going!`,
    };
  }

  // Spending up significantly
  if (weekChange >= 20) {
    return {
      icon: TrendingUp,
      tone: "from-amber-500/15 to-orange-500/5 text-amber-600 dark:text-amber-400",
      tip: `Spending is up ${weekChange}% this week. Consider setting a budget to stay on track.`,
    };
  }

  // Low savings rate
  if (savingsRate >= 0 && savingsRate < 5) {
    return {
      icon: Lightbulb,
      tone: "from-amber-500/15 to-orange-500/5 text-amber-600 dark:text-amber-400",
      tip: "You're saving less than 5% of your income. Even ₦1,000 a month adds up over time.",
    };
  }

  // Great savings rate
  if (savingsRate >= 20) {
    return {
      icon: Crown,
      tone: "from-emerald-500/15 to-emerald-600/5 text-emerald-600 dark:text-emerald-400",
      tip: `You're saving ${savingsRate.toFixed(0)}% of your income — ahead of the curve. Keep it up!`,
    };
  }

  // Category-specific nudges
  if (topCategory?.name === "AIRTIME") {
    return {
      icon: Smartphone,
      tone: "from-amber-500/15 to-orange-500/5 text-amber-600 dark:text-amber-400",
      tip: "Airtime is your top spend this month. A data + voice bundle could save you up to 20%.",
    };
  }
  if (topCategory?.name === "BILL") {
    return {
      icon: Receipt,
      tone: "from-violet-500/15 to-violet-600/5 text-violet-600 dark:text-violet-400",
      tip: "Bills make up most of your spending. Schedule payments to avoid late fees.",
    };
  }
  if (topCategory?.name === "TRANSFER") {
    return {
      icon: ArrowLeftRight,
      tone: "from-sky-500/15 to-sky-600/5 text-sky-600 dark:text-sky-400",
      tip: "Transfers are your top category. Use Turbopay-to-Turbopay transfers — they're free and instant.",
    };
  }

  return {
    icon: Lightbulb,
    tone: "from-emerald-500/15 to-emerald-600/5 text-emerald-600 dark:text-emerald-400",
    tip: "Track your spending daily to spot hidden patterns and find easy ways to save.",
  };
}

function InsightsCard({
  icon: Icon,
  tone,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="tp-card-hover tp-card-gradient relative overflow-hidden p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${tone}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function InsightsSection({
  insights,
  setView,
}: {
  insights: InsightsData | null;
  setView: (v: "savings" | "analytics" | "history") => void;
}) {
  const a = insights?.analytics;

  // 1. Top spending category
  const topCat = a?.spendingByCategory?.[0] ?? null;
  const totalSpend = a?.spendingByCategory?.reduce((s, c) => s + c.value, 0) ?? 0;
  const topCatPct = topCat && totalSpend > 0 ? (topCat.value / totalSpend) * 100 : 0;
  const weekChange = a?.stats?.weekChange ?? 0;

  // 2. Busiest day of week — by transaction count from raw txns
  const dowCounts = React.useMemo(() => {
    const counts: Record<string, number> = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
    for (const t of insights?.transactions ?? []) {
      const d = new Date(t.createdAt);
      const dow = WEEKDAYS[d.getDay()];
      counts[dow]++;
    }
    return counts;
  }, [insights]);
  const busiestEntry = Object.entries(dowCounts).sort((x, y) => y[1] - x[1])[0];
  const busiestDay = busiestEntry?.[0] ?? null;
  const busiestCount = busiestEntry?.[1] ?? 0;

  // 3. Saving rate
  const savingsDeposits =
    a?.spendingByCategory?.find((c) => c.name === "SAVINGS_DEPOSIT")?.value ?? 0;
  const totalIncome = a?.stats?.totalIncome30 ?? 0;
  const savingsRate = totalIncome > 0 ? (savingsDeposits / totalIncome) * 100 : 0;

  // 4. Smart tip
  const tip = React.useMemo(
    () =>
      pickSmartTip({
        topCategory: topCat ? { name: topCat.name, value: topCat.value } : null,
        weekChange,
        savingsRate,
        totalIncome,
        totalExpense: totalSpend,
      }),
    [topCat, weekChange, savingsRate, totalIncome, totalSpend],
  );

  // Loading skeleton
  if (!insights) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-5">
            <div className="flex items-center justify-between">
              <div className="tp-skeleton-shimmer h-3 w-24 rounded-full" />
              <div className="tp-skeleton-shimmer h-9 w-9 rounded-lg" />
            </div>
            <div className="tp-skeleton-shimmer mt-3 h-6 w-32 rounded-full" />
            <div className="tp-skeleton-shimmer mt-2 h-3 w-40 rounded-full" />
          </Card>
        ))}
      </div>
    );
  }

  // No data state
  const hasNoData = !a || totalSpend <= 0;
  if (hasNoData) {
    return (
      <Card className="p-5">
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Lightbulb className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium">Spending insights appear here</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Make a few transactions and we&apos;ll surface smart insights about your spending patterns.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 gap-1.5"
            onClick={() => setView("history")}
          >
            View transactions <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Spending insights</p>
          <p className="text-xs text-muted-foreground">Smart observations from your last 30 days</p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Sparkles className="h-3 w-3 text-amber-500" /> AI-powered
        </Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Top spending category */}
        <InsightsCard
          icon={Crown}
          tone="from-amber-500/15 to-orange-500/5 text-amber-600 dark:text-amber-400"
          label="Top spending category"
        >
          {topCat ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xl font-bold">{TYPE_LABELS[topCat.name] ?? topCat.name}</p>
                <p className="text-sm font-bold tabular-nums">{naira(topCat.value)}</p>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Progress value={topCatPct} className="h-1.5" />
                <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                  {topCatPct.toFixed(0)}%
                </span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs">
                {weekChange < 0 ? (
                  <>
                    <TrendingDown className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Down {Math.abs(weekChange)}% vs last week
                    </span>
                  </>
                ) : weekChange > 0 ? (
                  <>
                    <TrendingUp className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-amber-600 dark:text-amber-400">
                      Up {weekChange}% vs last week
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">No change vs last week</span>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No spending yet</p>
          )}
        </InsightsCard>

        {/* Busiest day */}
        <InsightsCard
          icon={CalendarDays}
          tone="from-sky-500/15 to-sky-600/5 text-sky-600 dark:text-sky-400"
          label="Busiest day of week"
        >
          {busiestDay && busiestCount > 0 ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xl font-bold">{WEEKDAY_FULL[busiestDay] ?? busiestDay}</p>
                <p className="text-sm font-bold tabular-nums">{busiestCount} txn{busiestCount === 1 ? "" : "s"}</p>
              </div>
              <div className="mt-3 flex items-end justify-between gap-1.5">
                {WEEKDAYS.map((d) => {
                  const c = dowCounts[d] ?? 0;
                  const maxC = Math.max(busiestCount, 1);
                  const h = Math.max(4, (c / maxC) * 36);
                  const isBusiest = d === busiestDay;
                  return (
                    <div key={d} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className={`w-full rounded-sm transition-all ${
                          isBusiest ? "bg-sky-500" : "bg-sky-500/25"
                        }`}
                        style={{ height: `${h}px` }}
                        title={`${d}: ${c} txn${c === 1 ? "" : "s"}`}
                      />
                      <span className="text-[9px] text-muted-foreground">{d[0]}</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No transactions yet</p>
          )}
        </InsightsCard>

        {/* Saving rate */}
        <InsightsCard
          icon={PiggyBank}
          tone="from-emerald-500/15 to-emerald-600/5 text-emerald-600 dark:text-emerald-400"
          label="Saving rate (30d)"
        >
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xl font-bold tabular-nums">{savingsRate.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">
              of {nairaCompact(totalIncome)}
            </p>
          </div>
          <div className="mt-2">
            <Progress value={Math.min(100, savingsRate)} className="h-1.5" />
            <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Saved: {nairaCompact(savingsDeposits)}</span>
              <span>Target: 20%</span>
            </div>
          </div>
          {savingsRate < 20 && (
            <button
              onClick={() => setView("savings")}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Boost your savings <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </InsightsCard>

        {/* Smart tip */}
        <Card className="tp-tip-glow relative overflow-hidden p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Smart tip</p>
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${tip.tone}`}>
              <tip.icon className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed">{tip.tip}</p>
          <button
            onClick={() => setView("analytics")}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            See full breakdown <ChevronRight className="h-3 w-3" />
          </button>
        </Card>
      </div>
    </div>
  );
}

/* ================================================================= */
/* Profile completion — progress card in the dashboard right column   */
/* ================================================================= */

interface CompletionStep {
  key: string;
  label: string;
  done: boolean;
}

interface CompletionData {
  steps: CompletionStep[];
  completed: number;
  total: number;
  percent: number;
  hasPin: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  kycVerified: boolean;
}

const STEP_META: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; ctaView: "settings" | "kyc"; ctaLabel: string }
> = {
  pin: { icon: KeyRound, ctaView: "settings", ctaLabel: "Set PIN" },
  email: { icon: Mail, ctaView: "settings", ctaLabel: "Verify email" },
  phone: { icon: Phone, ctaView: "settings", ctaLabel: "Verify phone" },
  kyc: { icon: BadgeCheck, ctaView: "kyc", ctaLabel: "Complete KYC" },
};

function ProfileCompletionCard({
  setView,
}: {
  setView: (v: "settings" | "kyc") => void;
}) {
  const [data, setData] = React.useState<CompletionData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/profile/completion", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setData(json);
        }
      } catch {
        /* non-fatal — card is decorative */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <Card className="p-5">
        <div className="tp-skeleton-shimmer mb-3 h-4 w-40 rounded-full" />
        <div className="tp-skeleton-shimmer mb-4 h-2.5 w-full rounded-full" />
        <div className="space-y-2.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div className="tp-skeleton-shimmer h-5 w-5 rounded-full" />
              <div className="tp-skeleton-shimmer h-3 flex-1 rounded-full" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (!data) return null;

  const complete = data.percent >= 100;
  const incomplete = data.steps.filter((s) => !s.done);

  return (
    <Card className={`relative overflow-hidden p-5 ${complete ? "tp-card-gradient" : ""}`}>
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${
              complete
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
            }`}
          >
            {complete ? <PartyPopper className="h-4.5 w-4.5" /> : <ShieldAlert className="h-4.5 w-4.5" />}
          </div>
          <div>
            <p className="text-sm font-semibold">Profile completion</p>
            <p className="text-[11px] text-muted-foreground">
              {complete ? "All set — you're fully verified" : "Secure & unlock higher limits"}
            </p>
          </div>
        </div>
        <span
          className={`text-lg font-bold tabular-nums ${
            complete
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600 dark:text-amber-400"
          }`}
        >
          {data.percent}%
        </span>
      </div>

      {/* Gradient progress bar */}
      <div className="relative mb-4 h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out ${
            complete
              ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
              : "bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-500"
          }`}
          style={{ width: `${data.percent}%` }}
        />
        {complete && (
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 animate-pulse rounded-full bg-white/30"
            style={{ width: `${data.percent}%`, animationDuration: "2.5s" }}
          />
        )}
      </div>

      {/* Celebration state */}
      {complete ? (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-500/10 p-3 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">Profile complete!</p>
            <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80">
              You've unlocked all security & limit tiers.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {data.steps.map((s) => {
            const meta = STEP_META[s.key] ?? STEP_META[s.key === "kyc" ? "kyc" : "pin"];
            const Icon = meta.icon;
            return (
              <div
                key={s.key}
                className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${
                  s.done ? "" : "hover:bg-muted/50"
                }`}
              >
                {s.done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-amber-500" />
                )}
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Icon
                    className={`h-3.5 w-3.5 shrink-0 ${
                      s.done ? "text-emerald-500" : "text-muted-foreground"
                    }`}
                  />
                  <span
                    className={`truncate text-xs font-medium ${
                      s.done ? "text-muted-foreground line-through decoration-emerald-500/40" : "text-foreground"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {!s.done && (
                  <button
                    onClick={() => setView(meta.ctaView)}
                    className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-700 transition-colors hover:bg-amber-500/25 dark:text-amber-400"
                  >
                    {meta.ctaLabel}
                    <ChevronRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Footer nudge */}
          {incomplete.length > 0 && (
            <p className="pt-1 text-[10px] text-muted-foreground">
              {incomplete.length} step{incomplete.length === 1 ? "" : "s"} remaining · each adds 25% to your profile strength
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
