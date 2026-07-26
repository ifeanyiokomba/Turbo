"use client";

import * as React from "react";
import { usePin } from "../parts/pin-dialog";
import { PageHeader, EmptyState, StatCard } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  PiggyBank,
  RefreshCw,
  Plus,
  ArrowDownToLine,
  ArrowUpFromLine,
  Lock,
  Sparkles,
  Target,
  Coins,
  TrendingUp,
  Check,
  Clock,
  Zap,
  Repeat,
  Percent,
  Trophy,
  Calendar,
  Calculator,
  Trash2,
  CircleDot,
} from "lucide-react";
import { naira, parseKobo, formatDate, timeAgo } from "@/lib/money";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

interface SavingsProduct {
  id: string;
  name: string;
  type: string;
  interestBps: number;
  minAmountKobo: number;
  lockDays: number;
  description: string | null;
}

interface MySavingsTx {
  id: string;
  type: string;
  amountKobo: number;
  balanceAfterKobo: number;
  status: string;
  reference: string;
  createdAt: string;
}

interface MySavings {
  product: SavingsProduct;
  balanceKobo: number;
  lastActivityAt: string | null;
  lockedUntil: string | null;
  transactions: MySavingsTx[];
}

interface SavingsData {
  products: SavingsProduct[];
  mySavings: MySavings[];
  totalSaved: number;
  estInterest: number;
}

const TYPE_BADGE: Record<string, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  FLEXIBLE: { label: "Flexible", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", icon: Sparkles },
  LOCKED: { label: "Locked", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400", icon: Lock },
  TARGET: { label: "Target", cls: "bg-violet-500/15 text-violet-600 dark:text-violet-400", icon: Target },
};

function interestPct(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

function lockLabel(days: number): string {
  if (days === 0) return "No lock";
  if (days === 365) return "1 year";
  if (days % 30 === 0) return `${days / 30} months`;
  return `${days} days`;
}

export default function SavingsView() {
  const pin = usePin();
  const [data, setData] = React.useState<SavingsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const [modal, setModal] = React.useState<{
    product: SavingsProduct;
    mode: "DEPOSIT" | "WITHDRAW";
    currentBalance: number;
    locked: boolean;
  } | null>(null);
  const [amountInput, setAmountInput] = React.useState("");
  const amountKobo = parseKobo(amountInput);

  const [txModal, setTxModal] = React.useState<MySavings | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/savings", { cache: "no-store" });
      if (res.ok) setData(await res.json());
      else if (res.status === 401) toast.error("Session expired. Please log in again.");
      else toast.error("Failed to load savings.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  function openDeposit(product: SavingsProduct, currentBalance: number, locked: boolean) {
    setModal({ product, mode: "DEPOSIT", currentBalance, locked });
    setAmountInput("");
  }
  function openWithdraw(s: MySavings) {
    if (s.lockedUntil && new Date(s.lockedUntil) > new Date()) {
      toast.error(`Locked until ${formatDate(s.lockedUntil)}`);
      return;
    }
    if (s.balanceKobo <= 0) {
      toast.error("No balance to withdraw");
      return;
    }
    setModal({
      product: s.product,
      mode: "WITHDRAW",
      currentBalance: s.balanceKobo,
      locked: false,
    });
    setAmountInput("");
  }

  async function submit() {
    if (!modal) return;
    if (amountKobo <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (modal.mode === "DEPOSIT" && amountKobo < modal.product.minAmountKobo) {
      toast.error(`Minimum is ${naira(modal.product.minAmountKobo)}`);
      return;
    }
    if (modal.mode === "WITHDRAW" && amountKobo > modal.currentBalance) {
      toast.error("Amount exceeds savings balance");
      return;
    }
    const pinVal = await pin.request({
      title: modal.mode === "DEPOSIT" ? "Confirm deposit" : "Confirm withdrawal",
      description: `${naira(amountKobo)} · ${modal.product.name}`,
    });
    if (!pinVal) return;

    setBusy(true);
    try {
      const res = await fetch("/api/savings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: modal.product.id,
          amountKobo,
          type: modal.mode,
          pin: pinVal,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j?.error ?? "Transaction failed");
        return;
      }
      toast.success(
        modal.mode === "DEPOSIT"
          ? `Deposited ${naira(amountKobo)} to ${modal.product.name}`
          : `Withdrew ${naira(amountKobo)} from ${modal.product.name}`,
      );
      setModal(null);
      setAmountInput("");
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 tp-fade-rise">
      <PageHeader
        title="Savings"
        subtitle="Grow your money with flexible, locked and target plans."
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh
          </Button>
        }
      />

      {/* Portfolio summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        {loading ? (
          <>
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </>
        ) : (
          <>
            <StatCard
              label="Total saved"
              value={naira(data?.totalSaved ?? 0)}
              icon={PiggyBank}
              tone="success"
              hint="Across all active plans"
            />
            <StatCard
              label="Est. annual interest"
              value={naira(data?.estInterest ?? 0)}
              icon={TrendingUp}
              tone="warning"
              hint="At current balance & rates"
            />
            <StatCard
              label="Active plans"
              value={String(data?.mySavings.length ?? 0)}
              icon={Target}
            />
          </>
        )}
      </div>

      {/* Savings Goals */}
      <SavingsGoalsSection />

      {/* Auto-save rules */}
      <AutoSaveRulesSection products={data?.products ?? []} />

      {/* Savings challenges */}
      <SavingsChallengesSection totalSaved={data?.totalSaved ?? 0} />

      {/* Interest projection */}
      <InterestProjectionSection />

      {/* Products grid */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Savings products</h2>
          <span className="text-xs text-muted-foreground">{data?.products.length ?? 0} available</span>
        </div>
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-52 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data?.products.map((p) => {
              const meta = TYPE_BADGE[p.type] ?? TYPE_BADGE.FLEXIBLE;
              const Icon = meta.icon;
              const mine = data?.mySavings.find((s) => s.product.id === p.id);
              return (
                <Card key={p.id} className="flex flex-col p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{meta.label}</p>
                      </div>
                    </div>
                    <Badge className={meta.cls}>{interestPct(p.interestBps)}</Badge>
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
                    {p.description ?? "Earn competitive returns on your savings."}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-muted-foreground">Min. amount</p>
                      <p className="font-semibold tabular-nums">{naira(p.minAmountKobo)}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-muted-foreground">Lock period</p>
                      <p className="font-semibold">{lockLabel(p.lockDays)}</p>
                    </div>
                  </div>
                  <div className="mt-auto pt-4">
                    {mine ? (
                      <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Your balance</p>
                          <p className="font-semibold tabular-nums">{naira(mine.balanceKobo)}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => openDeposit(p, mine.balanceKobo, false)}
                        >
                          <Plus className="h-3.5 w-3.5" /> Add
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full gap-1.5"
                        onClick={() => openDeposit(p, 0, p.lockDays > 0)}
                      >
                        <ArrowDownToLine className="h-4 w-4" /> Start saving
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* My savings */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">My savings</h2>
          <span className="text-xs text-muted-foreground">{data?.mySavings.length ?? 0} active</span>
        </div>
        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        ) : data && data.mySavings.length > 0 ? (
          <div className="space-y-3">
            {data.mySavings.map((s) => {
              const meta = TYPE_BADGE[s.product.type] ?? TYPE_BADGE.FLEXIBLE;
              const isLocked = s.lockedUntil && new Date(s.lockedUntil) > new Date();
              const totalInterest = Math.round((s.balanceKobo * s.product.interestBps) / 10_000);
              return (
                <Card key={s.product.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${meta.cls}`}>
                        <PiggyBank className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{s.product.name}</p>
                          <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
                          {isLocked && (
                            <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-600">
                              <Clock className="h-3 w-3" /> Until {formatDate(s.lockedUntil!)}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {s.product.interestBps / 100}% p.a. · last activity{" "}
                          {s.lastActivityAt ? timeAgo(s.lastActivityAt) : "—"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Current balance</p>
                      <p className="text-xl font-bold tabular-nums">{naira(s.balanceKobo)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Est. {naira(totalInterest)}/yr
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => openDeposit(s.product, s.balanceKobo, false)} className="gap-1.5">
                      <Plus className="h-4 w-4" /> Deposit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openWithdraw(s)}
                      disabled={s.balanceKobo <= 0}
                      className="gap-1.5"
                    >
                      <ArrowUpFromLine className="h-4 w-4" /> Withdraw
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setTxModal(s)}
                      className="gap-1.5"
                    >
                      <Coins className="h-4 w-4" /> History ({s.transactions.length})
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          !loading && (
            <EmptyState
              icon={PiggyBank}
              title="No active savings yet"
              description="Pick a product above to start earning interest."
            />
          )
        )}
      </div>

      {/* Deposit / Withdraw dialog */}
      <Dialog open={!!modal} onOpenChange={(o) => !busy && !o && setModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {modal?.mode === "DEPOSIT" ? "Deposit to" : "Withdraw from"}{" "}
              {modal?.product.name ?? ""}
            </DialogTitle>
            <DialogDescription>
              {modal?.mode === "DEPOSIT"
                ? `Funds are debited from your wallet. ${modal.product.interestBps / 100}% p.a. interest.`
                : "Funds are credited back to your wallet instantly."}
            </DialogDescription>
          </DialogHeader>
          {modal && (
            <div className="space-y-3 py-1">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-muted-foreground">{modal.mode === "DEPOSIT" ? "Min. deposit" : "Available"}</p>
                  <p className="font-semibold tabular-nums">
                    {naira(modal.mode === "DEPOSIT" ? modal.product.minAmountKobo : modal.currentBalance)}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-muted-foreground">Rate</p>
                  <p className="font-semibold">{interestPct(modal.product.interestBps)} p.a.</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sav-amt">Amount (₦)</Label>
                <Input
                  id="sav-amt"
                  inputMode="numeric"
                  placeholder="0.00"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                />
                {modal.mode === "DEPOSIT" && (
                  <div className="flex flex-wrap gap-1.5">
                    {[1000, 5000, 10000, 50000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setAmountInput(String(amt))}
                        className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium hover:border-primary hover:bg-primary/5"
                      >
                        ₦{amt.toLocaleString()}
                      </button>
                    ))}
                  </div>
                )}
                {modal.mode === "WITHDRAW" && (
                  <button
                    type="button"
                    onClick={() => setAmountInput(String(modal.currentBalance / 100))}
                    className="text-xs text-primary hover:underline"
                  >
                    Withdraw all ({naira(modal.currentBalance)})
                  </button>
                )}
              </div>
              {amountKobo > 0 && (
                <div className="rounded-xl border bg-muted/40 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">New savings balance</span>
                    <span className="font-semibold tabular-nums">
                      {naira(modal.currentBalance + (modal.mode === "DEPOSIT" ? amountKobo : -amountKobo))}
                    </span>
                  </div>
                  {modal.mode === "DEPOSIT" && (
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Est. annual interest</span>
                      <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                        +{naira(Math.round(((modal.currentBalance + amountKobo) * modal.product.interestBps) / 10_000))}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModal(null)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy || amountKobo <= 0} className="gap-1.5">
              {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {modal?.mode === "DEPOSIT" ? "Deposit" : "Withdraw"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transactions modal */}
      <Dialog open={!!txModal} onOpenChange={(o) => !o && setTxModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{txModal?.product.name ?? ""} history</DialogTitle>
            <DialogDescription>
              {txModal?.transactions.length ?? 0} transactions on this plan.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            {txModal && txModal.transactions.length > 0 ? (
              <div className="space-y-1">
                {txModal.transactions.map((t) => {
                  const isDeposit = t.type === "DEPOSIT";
                  return (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-muted/60"
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          isDeposit
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {isDeposit ? (
                          <ArrowDownToLine className="h-4 w-4" />
                        ) : (
                          <ArrowUpFromLine className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{t.type}</p>
                        <p className="text-xs text-muted-foreground">{timeAgo(t.createdAt)}</p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-sm font-semibold tabular-nums ${
                            isDeposit ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                          }`}
                        >
                          {isDeposit ? "+" : "−"}
                          {naira(t.amountKobo)}
                        </p>
                        <p className="text-[10px] text-muted-foreground tabular-nums">
                          Bal {naira(t.balanceAfterKobo)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">No transactions yet.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ===== Savings Goals Section =====
interface SavingsGoal {
  id: string;
  name: string;
  targetKobo: number;
  currentKobo: number;
  targetDate: string | null;
  color: string;
  icon: string;
  status: string;
  createdAt: string;
}

function SavingsGoalsSection() {
  const pin = usePin();
  const [goals, setGoals] = React.useState<SavingsGoal[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  const [contribGoal, setContribGoal] = React.useState<{ goal: SavingsGoal; mode: "DEPOSIT" | "WITHDRAW" } | null>(null);
  const [amountInput, setAmountInput] = React.useState("");
  const amountKobo = parseKobo(amountInput);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/savings-goals", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setGoals(data.goals ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  async function createGoal(name: string, targetKobo: number, targetDate: string | null, color: string, initialKobo: number) {
    const res = await fetch("/api/savings-goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, targetKobo, targetDate, color, initialDepositKobo: initialKobo }),
    });
    if (!res.ok) { const e = await res.json(); toast.error(e.error || "Failed"); return; }
    toast.success("Goal created!");
    setShowCreate(false);
    load();
  }

  async function contribute(goal: SavingsGoal, mode: "DEPOSIT" | "WITHDRAW", amount: number) {
    const pinVal = await pin.request({ title: mode === "DEPOSIT" ? "Deposit to goal" : "Withdraw from goal", description: `₦${(amount / 100).toLocaleString()}` });
    if (!pinVal) return;
    const res = await fetch(`/api/savings-goals/${goal.id}/contribute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountKobo: amount, pin: pinVal, type: mode }),
    });
    if (!res.ok) { const e = await res.json(); toast.error(e.error || "Failed"); return; }
    toast.success(mode === "DEPOSIT" ? "Deposited!" : "Withdrawn!");
    setContribGoal(null);
    setAmountInput("");
    load();
  }

  async function deleteGoal(id: string) {
    const res = await fetch(`/api/savings-goals/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Failed to delete"); return; }
    toast.success("Goal deleted");
    load();
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">My Savings Goals</h2>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> New goal
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      ) : goals.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <Target className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium">No savings goals yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Create a goal to track your progress toward a target.</p>
          <Button size="sm" className="mt-4 gap-1.5" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Create your first goal
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((g) => {
            const pct = g.targetKobo > 0 ? Math.min(100, Math.round((g.currentKobo / g.targetKobo) * 100)) : 0;
            const completed = pct >= 100;
            return (
              <Card key={g.id} className="p-5 tp-card-hover">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${completed ? "bg-emerald-500/15 text-emerald-600" : "bg-primary/10 text-primary"}`}>
                      {completed ? <Check className="h-4 w-4" /> : <Target className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{g.name}</p>
                      <p className="text-xs text-muted-foreground">{completed ? "Completed!" : g.targetDate ? `By ${formatDate(g.targetDate)}` : "No deadline"}</p>
                    </div>
                  </div>
                  {completed && <Badge className="bg-emerald-500/15 text-emerald-600 text-[10px]">100%</Badge>}
                </div>

                {/* Progress ring */}
                <div className="mb-3 flex items-center gap-3">
                  <div className="relative h-16 w-16">
                    <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="28" fill="none" stroke="var(--muted)" strokeWidth="6" />
                      <circle cx="32" cy="32" r="28" fill="none" stroke={completed ? "oklch(0.60 0.14 155)" : pct >= 75 ? "oklch(0.62 0.14 162)" : pct >= 50 ? "oklch(0.80 0.13 75)" : "oklch(0.62 0.14 162)"} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 176} 176`} className="transition-all duration-700" />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{pct}%</span>
                  </div>
                  <div>
                    <p className="text-lg font-bold tabular-nums">{naira(g.currentKobo)}</p>
                    <p className="text-xs text-muted-foreground">of {naira(g.targetKobo)}</p>
                  </div>
                </div>

                {/* Milestones */}
                <div className="mb-3 flex items-center gap-1.5">
                  {[25, 50, 75, 100].map((m) => (
                    <div key={m} className={`flex-1 rounded-full py-0.5 text-center text-[9px] font-medium ${pct >= m ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                      {pct >= m ? "✓" : `${m}%`}
                    </div>
                  ))}
                </div>

                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" onClick={() => { setContribGoal({ goal: g, mode: "DEPOSIT" }); setAmountInput(""); }}>
                    <ArrowDownToLine className="h-3.5 w-3.5" /> Add
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" onClick={() => { setContribGoal({ goal: g, mode: "WITHDRAW" }); setAmountInput(""); }}>
                    <ArrowUpFromLine className="h-3.5 w-3.5" /> Withdraw
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive px-2" onClick={() => deleteGoal(g.id)}>
                    ✕
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create goal dialog */}
      {showCreate && (
        <CreateGoalDialog onClose={() => setShowCreate(false)} onCreate={createGoal} />
      )}

      {/* Contribute dialog */}
      {contribGoal && (
        <Dialog open onOpenChange={() => setContribGoal(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{contribGoal.mode === "DEPOSIT" ? "Add to" : "Withdraw from"} {contribGoal.goal.name}</DialogTitle>
              <DialogDescription>Current: {naira(contribGoal.goal.currentKobo)} of {naira(contribGoal.goal.targetKobo)}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Label>Amount (₦)</Label>
              <Input type="number" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} placeholder="5000" />
              <div className="flex gap-2">
                {[1000, 5000, 10000, 50000].map((v) => (
                  <button key={v} onClick={() => setAmountInput(String(v))} className="rounded-full bg-muted px-3 py-1 text-xs hover:bg-muted/70">{naira(v * 100).replace(".00", "")}</button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setContribGoal(null)}>Cancel</Button>
              <Button disabled={amountKobo <= 0} onClick={() => contribute(contribGoal.goal, contribGoal.mode, amountKobo)}>
                {contribGoal.mode === "DEPOSIT" ? "Deposit" : "Withdraw"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function CreateGoalDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, target: number, date: string | null, color: string, initial: number) => void }) {
  const [name, setName] = React.useState("");
  const [target, setTarget] = React.useState("");
  const [date, setDate] = React.useState("");
  const [color, setColor] = React.useState("emerald");
  const [initial, setInitial] = React.useState("");
  const targetKobo = parseKobo(target);
  const initialKobo = parseKobo(initial);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create savings goal</DialogTitle>
          <DialogDescription>Set a target and track your progress.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Goal name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New laptop, Vacation, Emergency fund" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Target amount (₦)</Label>
              <Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="100000" />
            </div>
            <div className="space-y-1.5">
              <Label>Target date (optional)</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Initial deposit (₦, optional)</Label>
            <Input type="number" value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex gap-2">
              {["emerald", "amber", "violet", "sky", "rose"].map((c) => (
                <button key={c} onClick={() => setColor(c)} className={`h-8 w-8 rounded-full border-2 ${color === c ? "border-foreground" : "border-transparent"}`} style={{ background: `var(--color-${c === "emerald" ? "primary" : c})` }} />
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!name.trim() || targetKobo <= 0} onClick={() => onCreate(name.trim(), targetKobo, date || null, color, initialKobo)}>
            Create goal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ================================================================== */
/* Auto-save rules — round-up, percentage, fixed schedule              */
/* ================================================================== */

interface AutoSaveRule {
  id: string;
  type: string; // ROUND_UP | PERCENTAGE | FIXED
  amountKobo: number;
  productId: string;
  productName: string;
  productInterestBps: number;
  enabled: boolean;
  totalSavedKobo: number;
  lastRunAt: string | null;
  createdAt: string;
}

const RULE_TYPE_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  ROUND_UP: { label: "Round-up", icon: CircleDot, tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  PERCENTAGE: { label: "Percentage", icon: Percent, tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  FIXED: { label: "Fixed schedule", icon: Repeat, tone: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
};

function AutoSaveRulesSection({ products }: { products: { id: string; name: string; interestBps: number }[] }) {
  const [rules, setRules] = React.useState<AutoSaveRule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);

  const [type, setType] = React.useState<"ROUND_UP" | "PERCENTAGE" | "FIXED">("ROUND_UP");
  const [productId, setProductId] = React.useState<string>("");
  const [amountInput, setAmountInput] = React.useState<string>("");
  const [frequency, setFrequency] = React.useState<"DAILY" | "WEEKLY" | "MONTHLY">("DAILY");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/savings/auto-rules", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules ?? []);
      }
    } catch {
      /* swallow */
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    if (products.length > 0 && !productId) setProductId(products[0].id);
  }, [products, productId]);

  async function createRule() {
    if (!productId) {
      toast.error("Pick a savings product");
      return;
    }
    const amountKobo = parseKobo(amountInput);
    if (amountKobo <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (type === "ROUND_UP" && ![100, 500, 1000].includes(amountKobo)) {
      toast.error("Round-up unit must be ₦1 (100), ₦5 (500) or ₦10 (1000)");
      return;
    }
    if (type === "PERCENTAGE" && (amountKobo < 1 || amountKobo > 50)) {
      toast.error("Percentage must be between 1% and 50%");
      return;
    }
    if (type === "FIXED" && amountKobo < 1000) {
      toast.error("Fixed amount must be at least ₦10");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/savings/auto-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, amountKobo, productId, frequency }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j?.error ?? "Failed to create rule");
        return;
      }
      toast.success("Auto-save rule created");
      setShowCreate(false);
      setAmountInput("");
      load();
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule(rule: AutoSaveRule, enabled: boolean) {
    setRules((arr) => arr.map((r) => r.id === rule.id ? { ...r, enabled } : r));
    try {
      const res = await fetch(`/api/savings/auto-rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        setRules((arr) => arr.map((r) => r.id === rule.id ? { ...r, enabled: !enabled } : r));
        toast.error("Failed to update rule");
        return;
      }
      toast.success(enabled ? "Rule enabled" : "Rule paused");
    } catch {
      setRules((arr) => arr.map((r) => r.id === rule.id ? { ...r, enabled: !enabled } : r));
      toast.error("Network error");
    }
  }

  async function deleteRule(rule: AutoSaveRule) {
    const prev = rules;
    setRules((arr) => arr.filter((r) => r.id !== rule.id));
    try {
      const res = await fetch(`/api/savings/auto-rules/${rule.id}`, { method: "DELETE" });
      if (!res.ok) {
        setRules(prev);
        toast.error("Failed to delete rule");
        return;
      }
      toast.success("Rule deleted");
    } catch {
      setRules(prev);
      toast.error("Network error");
    }
  }

  const totalSavedAll = rules.reduce((s, r) => s + r.totalSavedKobo, 0);
  const activeCount = rules.filter((r) => r.enabled).length;

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Auto-save rules</p>
            <p className="text-xs text-muted-foreground">
              Automatically sweep spare change or a fixed amount into savings.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={load} className="gap-1.5">
            <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> New rule
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-8 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Zap className="h-5 w-5" />
          </div>
          <p className="mt-3 font-medium">No auto-save rules yet</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Round up transactions, save a percentage of deposits, or stash a fixed amount on a schedule.
          </p>
          <Button size="sm" className="mt-4 gap-1.5" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Create your first rule
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-3">
            <div>
              <p className="text-[10px] text-muted-foreground">Total auto-saved</p>
              <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{naira(totalSavedAll)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Active rules</p>
              <p className="text-sm font-bold tabular-nums">{activeCount}/{rules.length}</p>
            </div>
            <div className="hidden sm:block">
              <p className="text-[10px] text-muted-foreground">Last run</p>
              <p className="text-sm font-medium">
                {rules.find((r) => r.lastRunAt)?.lastRunAt ? timeAgo(rules.find((r) => r.lastRunAt)!.lastRunAt!) : "—"}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {rules.map((r) => {
              const meta = RULE_TYPE_META[r.type] ?? RULE_TYPE_META.FIXED;
              const Icon = meta.icon;
              const amountLabel =
                r.type === "ROUND_UP"
                  ? `Round to ₦${(r.amountKobo / 100).toFixed(0)}`
                  : r.type === "PERCENTAGE"
                  ? `${r.amountKobo}% of deposits`
                  : `${naira(r.amountKobo)} per run`;
              return (
                <div key={r.id} className={`rounded-2xl border bg-card p-4 transition-all ${r.enabled ? "" : "opacity-60"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${meta.tone}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{meta.label}</p>
                        <p className="text-xs text-muted-foreground">{r.productName}</p>
                      </div>
                    </div>
                    <Switch checked={r.enabled} onCheckedChange={(v) => toggleRule(r, v)} aria-label="Toggle rule" />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-muted-foreground">Rule</p>
                      <p className="font-semibold">{amountLabel}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-muted-foreground">Saved via this rule</p>
                      <p className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{naira(r.totalSavedKobo)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>
                      {r.lastRunAt ? `Last run ${timeAgo(r.lastRunAt)}` : "Never run"}
                    </span>
                    <button
                      onClick={() => deleteRule(r)}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-red-500/10 hover:text-red-600"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <Dialog open={showCreate} onOpenChange={(o) => !saving && setShowCreate(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Create auto-save rule
            </DialogTitle>
            <DialogDescription>
              Set up an automatic transfer to your savings product.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Rule type</Label>
              <Select value={type} onValueChange={(v) => setType(v as "ROUND_UP" | "PERCENTAGE" | "FIXED")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ROUND_UP">
                    <div className="flex flex-col">
                      <span>Round-up</span>
                      <span className="text-[10px] text-muted-foreground">Round every transaction to the nearest ₦1/₦5/₦10</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="PERCENTAGE">
                    <div className="flex flex-col">
                      <span>Percentage of deposits</span>
                      <span className="text-[10px] text-muted-foreground">Save X% of every incoming deposit</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="FIXED">
                    <div className="flex flex-col">
                      <span>Fixed amount on schedule</span>
                      <span className="text-[10px] text-muted-foreground">Save a fixed amount daily/weekly/monthly</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                {type === "ROUND_UP" ? "Round-up unit" : type === "PERCENTAGE" ? "Percentage (%)" : "Amount per run (₦)"}
              </Label>
              {type === "ROUND_UP" ? (
                <div className="flex gap-2">
                  {[100, 500, 1000].map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setAmountInput(String(u))}
                      className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                        amountInput === String(u) ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted/40"
                      }`}
                    >
                      ₦{u / 100}
                    </button>
                  ))}
                </div>
              ) : type === "PERCENTAGE" ? (
                <>
                  <Slider value={[parseKobo(amountInput) || 5]} min={1} max={50} step={1}
                    onValueChange={(v) => setAmountInput(String(v[0] ?? 5))} />
                  <p className="text-center text-sm font-semibold text-primary">{parseKobo(amountInput) || 5}%</p>
                </>
              ) : (
                <Input
                  inputMode="numeric"
                  placeholder="1000"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                />
              )}
              {type === "FIXED" && (
                <div className="space-y-1.5">
                  <Label>Frequency</Label>
                  <Select value={frequency} onValueChange={(v) => setFrequency(v as "DAILY" | "WEEKLY" | "MONTHLY")}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DAILY">Daily</SelectItem>
                      <SelectItem value="WEEKLY">Weekly</SelectItem>
                      <SelectItem value="MONTHLY">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Target savings product</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {(p.interestBps / 100).toFixed(1)}% p.a.
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {amountInput && parseKobo(amountInput) > 0 && (
              <div className="rounded-xl border bg-muted/40 p-3 text-sm">
                <p className="text-xs text-muted-foreground">Preview</p>
                <p className="mt-0.5 font-medium">
                  {type === "ROUND_UP" && `Every debit rounds up to ₦${(parseKobo(amountInput) / 100).toFixed(0)}; the difference goes to savings.`}
                  {type === "PERCENTAGE" && `${parseKobo(amountInput)}% of every incoming deposit auto-saved.`}
                  {type === "FIXED" && `${naira(parseKobo(amountInput))} moved to savings ${frequency.toLowerCase()}.`}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)} disabled={saving}>Cancel</Button>
            <Button onClick={createRule} disabled={saving} className="gap-1.5">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Create rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ================================================================== */
/* Savings challenges — 30-day / 90-day with community comparison      */
/* ================================================================== */

interface Challenge {
  id: string;
  title: string;
  durationDays: number;
  dailyTargetKobo: number;
  totalTargetKobo: number;
  participants: number;
  avgSavedKobo: number;
  completionRatePct: number;
  joined: boolean;
  progressKobo: number;
}

const CHALLENGE_SEEDS: Omit<Challenge, "joined" | "progressKobo">[] = [
  {
    id: "30day-starter",
    title: "30-Day Starter",
    durationDays: 30,
    dailyTargetKobo: 500_00,
    totalTargetKobo: 15_000_00,
    participants: 8421,
    avgSavedKobo: 12_800_00,
    completionRatePct: 67,
  },
  {
    id: "90day-builder",
    title: "90-Day Builder",
    durationDays: 90,
    dailyTargetKobo: 1000_00,
    totalTargetKobo: 90_000_00,
    participants: 4128,
    avgSavedKobo: 71_500_00,
    completionRatePct: 54,
  },
  {
    id: "52week-money",
    title: "₦10K in 100 Days",
    durationDays: 100,
    dailyTargetKobo: 1000_00,
    totalTargetKobo: 100_000_00,
    participants: 2103,
    avgSavedKobo: 64_300_00,
    completionRatePct: 48,
  },
];

function SavingsChallengesSection({ totalSaved }: { totalSaved: number }) {
  const [joined, setJoined] = React.useState<Record<string, boolean>>({});

  const challenges: Challenge[] = CHALLENGE_SEEDS.map((c) => ({
    ...c,
    joined: joined[c.id] ?? false,
    progressKobo: joined[c.id] ? Math.min(c.totalTargetKobo, totalSaved) : 0,
  }));

  function toggleJoin(id: string) {
    setJoined((prev) => {
      const newState = { ...prev, [id]: !prev[id] };
      toast.success(newState[id] ? "Challenge joined! Save daily to stay on track." : "Challenge left");
      return newState;
    });
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <Trophy className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold">Savings challenges</p>
          <p className="text-xs text-muted-foreground">Join a community challenge and build a saving habit.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {challenges.map((c) => {
          const pct = c.totalTargetKobo > 0 ? Math.min(100, Math.round((c.progressKobo / c.totalTargetKobo) * 100)) : 0;
          const avgPct = c.totalTargetKobo > 0 ? Math.round((c.avgSavedKobo / c.totalTargetKobo) * 100) : 0;
          return (
            <div key={c.id} className={`rounded-2xl border bg-card p-4 transition-all ${c.joined ? "ring-1 ring-emerald-500/30" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{c.title}</p>
                    {c.joined && (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 text-[9px]">
                        Joined
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{c.durationDays} days · {naira(c.dailyTargetKobo)}/day</p>
                </div>
                <Trophy className={`h-5 w-5 ${c.joined ? "text-amber-500" : "text-muted-foreground/40"}`} />
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Target: {naira(c.totalTargetKobo)}</span>
                  <span>{pct}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {c.joined && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    You: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{naira(c.progressKobo)}</span>
                  </p>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                <div className="rounded-lg bg-muted/40 p-1.5">
                  <p className="font-semibold text-foreground">{c.participants.toLocaleString()}</p>
                  <p>participants</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-1.5">
                  <p className="font-semibold text-foreground">{c.completionRatePct}%</p>
                  <p>completion</p>
                </div>
              </div>

              <div className="mt-2 text-[10px] text-muted-foreground">
                Avg member saved <span className="font-semibold">{naira(c.avgSavedKobo)}</span> ({avgPct}%)
              </div>

              <Button
                size="sm"
                variant={c.joined ? "outline" : "default"}
                className="mt-3 w-full gap-1.5"
                onClick={() => toggleJoin(c.id)}
              >
                {c.joined ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {c.joined ? "Joined" : "Join challenge"}
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ================================================================== */
/* Interest projection calculator                                       */
/* ================================================================== */

function InterestProjectionSection() {
  const [monthlyKobo, setMonthlyKobo] = React.useState<number>(20_000_00); // ₦20,000
  const [annualRateBps, setAnnualRateBps] = React.useState<number>(1200); // 12% p.a.
  const [years, setYears] = React.useState<number>(1);

  const monthlyRate = annualRateBps / 10000 / 12;
  const n = years * 12;
  const fv = monthlyRate === 0
    ? monthlyKobo * n
    : Math.round(monthlyKobo * ((Math.pow(1 + monthlyRate, n) - 1) / monthlyRate));
  const totalContributions = monthlyKobo * n;
  const totalInterest = fv - totalContributions;

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Calculator className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold">Interest projection</p>
          <p className="text-xs text-muted-foreground">See how regular saving compounds over time.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Monthly contribution</Label>
              <span className="text-sm font-semibold text-primary tabular-nums">{naira(monthlyKobo)}</span>
            </div>
            <Slider
              value={[monthlyKobo]}
              min={1_000_00}
              max={500_000_00}
              step={1_000_00}
              onValueChange={(v) => setMonthlyKobo(v[0] ?? 1_000_00)}
            />
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: "₦5K", v: 5_000_00 },
                { label: "₦20K", v: 20_000_00 },
                { label: "₦50K", v: 50_000_00 },
                { label: "₦100K", v: 100_000_00 },
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => setMonthlyKobo(chip.v)}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium hover:border-primary hover:bg-primary/5"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Annual interest rate</Label>
              <span className="text-sm font-semibold text-primary tabular-nums">{(annualRateBps / 100).toFixed(1)}% p.a.</span>
            </div>
            <Slider
              value={[annualRateBps]}
              min={0}
              max={2500}
              step={50}
              onValueChange={(v) => setAnnualRateBps(v[0] ?? 0)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Duration</Label>
              <span className="text-sm font-semibold text-primary tabular-nums">{years} {years === 1 ? "year" : "years"}</span>
            </div>
            <Slider
              value={[years]}
              min={1}
              max={10}
              step={1}
              onValueChange={(v) => setYears(v[0] ?? 1)}
            />
          </div>
        </div>

        <div className="flex flex-col justify-center rounded-2xl bg-gradient-to-br from-emerald-500/10 to-amber-500/5 p-5">
          <p className="text-xs text-muted-foreground">Total value after {years} {years === 1 ? "year" : "years"}</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {naira(fv)}
          </p>
          <div className="mt-4 space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Your contributions</span>
              <span className="font-medium tabular-nums">{naira(totalContributions)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Interest earned</span>
              <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">+{naira(totalInterest)}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${totalContributions > 0 ? Math.min(100, (totalContributions / fv) * 100) : 100}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              <span className="font-semibold text-foreground">{Math.round((totalContributions / Math.max(1, fv)) * 100)}%</span> contributions ·{" "}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{Math.round((totalInterest / Math.max(1, fv)) * 100)}%</span> interest
            </p>
          </div>
          <p className="mt-4 text-[10px] text-muted-foreground">
            Assumes monthly compounding. Actual returns depend on the savings product you choose.
          </p>
        </div>
      </div>
    </Card>
  );
}
