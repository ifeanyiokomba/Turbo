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
} from "lucide-react";
import { naira, parseKobo, formatDate, timeAgo } from "@/lib/money";
import { toast } from "sonner";

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

