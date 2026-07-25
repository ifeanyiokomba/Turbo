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
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  ArrowDownLeft, ArrowUpRight, Activity, Wallet as WalletIcon, ArrowLeftRight,
  Smartphone, Receipt, CreditCard, PiggyBank, Plus, ChevronRight, ShieldAlert,
  QrCode,
  BarChart3,
} from "lucide-react";
import { naira, nairaCompact, timeAgo } from "@/lib/money";
import { toast } from "sonner";

interface DashData {
  wallet: { balanceKobo: number; currency: string; status: string } | null;
  virtualAccount: { accountNumber: string; accountName: string; bankName: string } | null;
  recent: any[];
  cashflow: { date: string; inflow: number; outflow: number }[];
  stats: { moneyIn: number; moneyOut: number; netFlow: number; txCount: number };
  spending: { name: string; value: number }[];
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

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => { load(); }, [load]);

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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <StatCard label="Money in (14d)" value={naira(data?.stats.moneyIn ?? 0)} icon={ArrowDownLeft} tone="success" />
            <StatCard label="Money out (14d)" value={naira(data?.stats.moneyOut ?? 0)} icon={ArrowUpRight} tone="warning" />
          </div>
          <StatCard
            label="Net flow"
            value={naira(data?.stats.netFlow ?? 0)}
            icon={Activity}
            hint={`${data?.stats.txCount ?? 0} successful transactions`}
          />

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
        </div>
      </div>
    </div>
  );
}
