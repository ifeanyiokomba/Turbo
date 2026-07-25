"use client";

import * as React from "react";
import { useApp } from "../store";
import { usePin } from "../parts/pin-dialog";
import { PageHeader, EmptyState, StatCard } from "../parts/layout";
import { FeatureGate } from "../parts/feature-gate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  TrendingUp,
  RefreshCw,
  Plus,
  Banknote,
  ShieldCheck,
  AlertTriangle,
  Building2,
  Check,
  Calendar,
  ArrowDownLeft,
  Lock,
} from "lucide-react";
import { naira, parseKobo, formatDate, timeAgo } from "@/lib/money";
import { toast } from "sonner";

interface InvestmentProduct {
  id: string;
  name: string;
  type: string;
  riskLevel: string;
  minAmountKobo: number;
  maxAmountKobo: number;
  expectedReturnBps: number;
  durationLabel: string;
  provider: string;
}

interface UserInvestment {
  id: string;
  productId: string;
  productName: string;
  productType: string;
  provider: string;
  riskLevel: string;
  durationLabel: string;
  expectedReturnBps: number;
  principalKobo: number;
  currentValueKobo: number;
  status: string;
  maturityAt: string;
  createdAt: string;
}

interface InvestmentsData {
  products: InvestmentProduct[];
  holdings: UserInvestment[];
  totalValue: number;
  totalPrincipal: number;
  totalReturn: number;
}

const TYPE_LABELS: Record<string, string> = {
  TBILL: "T-Bill",
  FIXED_INCOME: "Fixed Income",
  MUTUAL_FUND: "Mutual Fund",
  BOND: "Bond",
};

const RISK_META: Record<string, { cls: string; label: string }> = {
  LOW: { cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", label: "Low risk" },
  MEDIUM: { cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400", label: "Medium risk" },
  HIGH: { cls: "bg-red-500/15 text-red-600 dark:text-red-400", label: "High risk" },
};

function pct(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

export default function InvestmentsView() {
  const { setView } = useApp();
  const pin = usePin();
  const [data, setData] = React.useState<InvestmentsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const [investProduct, setInvestProduct] = React.useState<InvestmentProduct | null>(null);
  const [amountInput, setAmountInput] = React.useState("");
  const amountKobo = parseKobo(amountInput);

  const [liquidateTarget, setLiquidateTarget] = React.useState<UserInvestment | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/investments", { cache: "no-store" });
      if (res.ok) setData(await res.json());
      else if (res.status === 401) toast.error("Session expired. Please log in again.");
      else toast.error("Failed to load investments.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  function openInvest(product: InvestmentProduct) {
    setInvestProduct(product);
    setAmountInput(String(product.minAmountKobo / 100));
  }

  async function submitInvest() {
    if (!investProduct) return;
    if (amountKobo < investProduct.minAmountKobo) {
      toast.error(`Minimum is ${naira(investProduct.minAmountKobo)}`);
      return;
    }
    if (amountKobo > investProduct.maxAmountKobo) {
      toast.error(`Maximum is ${naira(investProduct.maxAmountKobo)}`);
      return;
    }
    const pinVal = await pin.request({
      title: "Confirm investment",
      description: `${naira(amountKobo)} · ${investProduct.name}`,
    });
    if (!pinVal) return;

    setBusy(true);
    try {
      const res = await fetch("/api/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: investProduct.id,
          amountKobo,
          pin: pinVal,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j?.error ?? "Investment failed");
        return;
      }
      toast.success(`Invested ${naira(amountKobo)} in ${investProduct.name}`);
      setInvestProduct(null);
      setAmountInput("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function liquidate() {
    if (!liquidateTarget) return;
    const pinVal = await pin.request({
      title: "Liquidate investment",
      description: `${naira(liquidateTarget.currentValueKobo)} · ${liquidateTarget.productName}`,
    });
    if (!pinVal) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/investments/${liquidateTarget.id}/liquidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinVal }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j?.error ?? "Liquidation failed");
        return;
      }
      toast.success(`${naira(liquidateTarget.currentValueKobo)} liquidated to wallet`);
      setLiquidateTarget(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  const holdings = data?.holdings ?? [];
  const activeHoldings = holdings.filter((h) => h.status === "ACTIVE");

  return (
    <div className="space-y-6 tp-fade-rise">
      <PageHeader
        title="Investments"
        subtitle="Diversify into T-bills, bonds and managed funds."
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
              label="Total value"
              value={naira(data?.totalValue ?? 0)}
              icon={TrendingUp}
              tone="success"
              hint={`${activeHoldings.length} active holding${activeHoldings.length === 1 ? "" : "s"}`}
            />
            <StatCard
              label="Total principal"
              value={naira(data?.totalPrincipal ?? 0)}
              icon={Banknote}
              hint="Capital invested"
            />
            <StatCard
              label="Total return"
              value={naira(data?.totalReturn ?? 0)}
              icon={ArrowDownLeft}
              tone={data && data.totalReturn >= 0 ? "success" : "danger"}
              hint={data ? `${((data.totalReturn / Math.max(data.totalPrincipal, 1)) * 100).toFixed(1)}% overall` : ""}
            />
          </>
        )}
      </div>

      {/* Product catalog */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Investment products</h2>
          <span className="text-xs text-muted-foreground">{data?.products.length ?? 0} available</span>
        </div>
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-56 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data?.products.map((p) => {
              const risk = RISK_META[p.riskLevel] ?? RISK_META.LOW;
              return (
                <Card key={p.id} className="flex flex-col p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {TYPE_LABELS[p.type] ?? p.type} · {p.provider}
                        </p>
                      </div>
                    </div>
                    <Badge className={`gap-1 ${risk.cls}`}>
                      <AlertTriangle className="h-3 w-3" />
                      {p.riskLevel}
                    </Badge>
                  </div>

                  <div className="mt-4 flex items-end gap-1">
                    <span className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {pct(p.expectedReturnBps)}
                    </span>
                    <span className="pb-1 text-xs text-muted-foreground">expected return</span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-muted-foreground">Min / Max</p>
                      <p className="font-semibold tabular-nums">
                        {naira(p.minAmountKobo)} / {naira(p.maxAmountKobo)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-muted-foreground">Duration</p>
                      <p className="font-semibold">{p.durationLabel}</p>
                    </div>
                  </div>

                  <div className="mt-auto pt-4">
                    <FeatureGate
                      requiredTier={2}
                      feature="Investments"
                      compact
                      fallback={
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full gap-1.5 border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400"
                          onClick={() => setView("kyc")}
                        >
                          <Lock className="h-4 w-4" /> Upgrade to invest
                        </Button>
                      }
                    >
                      <Button size="sm" className="w-full gap-1.5" onClick={() => openInvest(p)}>
                        <Plus className="h-4 w-4" /> Invest
                      </Button>
                    </FeatureGate>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* My holdings */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">My holdings</h2>
          <span className="text-xs text-muted-foreground">{holdings.length} total</span>
        </div>
        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        ) : holdings.length > 0 ? (
          <div className="space-y-3">
            {holdings.map((h) => {
              const risk = RISK_META[h.riskLevel] ?? RISK_META.LOW;
              const isMatured = h.status === "MATURED" || new Date(h.maturityAt) <= new Date();
              const isLiquidated = h.status === "LIQUIDATED";
              const progressPct = Math.min(
                100,
                Math.max(
                  0,
                  ((Date.now() - new Date(h.createdAt).getTime()) /
                    Math.max(
                      1,
                      new Date(h.maturityAt).getTime() - new Date(h.createdAt).getTime(),
                    )) *
                    100,
                ),
              );
              const gain = h.currentValueKobo - h.principalKobo;
              return (
                <Card key={h.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${risk.cls}`}>
                        <TrendingUp className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{h.productName}</p>
                          <Badge variant="outline" className={risk.cls}>{h.riskLevel}</Badge>
                          <Badge variant="outline" className="bg-muted">
                            {TYPE_LABELS[h.productType] ?? h.productType}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={
                              isLiquidated
                                ? "bg-red-500/10 text-red-600"
                                : isMatured
                                ? "bg-emerald-500/10 text-emerald-600"
                                : "bg-amber-500/10 text-amber-600"
                            }
                          >
                            {h.status}
                            {isMatured && !isLiquidated && " · Matured"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {pct(h.expectedReturnBps)} · {h.durationLabel} · {h.provider} · invested {timeAgo(h.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Current value</p>
                      <p className="text-xl font-bold tabular-nums">{naira(h.currentValueKobo)}</p>
                      <p
                        className={`text-[10px] tabular-nums ${
                          gain >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {gain >= 0 ? "+" : "−"}
                        {naira(Math.abs(gain))} ({pct(h.expectedReturnBps)})
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-muted-foreground">Principal</p>
                      <p className="font-semibold tabular-nums">{naira(h.principalKobo)}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-muted-foreground">Maturity</p>
                      <p className="flex items-center gap-1 font-semibold">
                        <Calendar className="h-3 w-3" /> {formatDate(h.maturityAt)}
                      </p>
                    </div>
                    <div className="col-span-2 rounded-lg bg-muted/40 p-2 sm:col-span-1">
                      <p className="text-muted-foreground">Progress</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Progress value={progressPct} className="h-1.5" />
                        <span className="shrink-0 text-[10px] tabular-nums">{progressPct.toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>

                  {h.status === "ACTIVE" && (
                    <div className="mt-4 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLiquidateTarget(h)}
                        className="gap-1.5"
                      >
                        <Banknote className="h-4 w-4" /> Liquidate
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Early liquidation may forfeit accrued interest.
                      </p>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          !loading && (
            <EmptyState
              icon={TrendingUp}
              title="No investments yet"
              description="Browse the catalog above to start investing."
            />
          )
        )}
      </div>

      {/* Invest dialog */}
      <Dialog open={!!investProduct} onOpenChange={(o) => !busy && !o && setInvestProduct(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invest in {investProduct?.name ?? ""}</DialogTitle>
            <DialogDescription>
              {investProduct?.provider} · {investProduct?.durationLabel} · {pct(investProduct?.expectedReturnBps ?? 0)} expected return
            </DialogDescription>
          </DialogHeader>
          {investProduct && (
            <div className="space-y-3 py-1">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-muted-foreground">Minimum</p>
                  <p className="font-semibold tabular-nums">{naira(investProduct.minAmountKobo)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-muted-foreground">Maximum</p>
                  <p className="font-semibold tabular-nums">{naira(investProduct.maxAmountKobo)}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-amt">Amount (₦)</Label>
                <Input
                  id="inv-amt"
                  inputMode="numeric"
                  placeholder="0.00"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                />
                <div className="flex flex-wrap gap-1.5">
                  {[
                    investProduct.minAmountKobo,
                    Math.round(investProduct.minAmountKobo * 5),
                    Math.round(investProduct.maxAmountKobo / 4),
                    Math.round(investProduct.maxAmountKobo / 2),
                  ].map((amt, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setAmountInput(String(amt / 100))}
                      className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium hover:border-primary hover:bg-primary/5"
                    >
                      ₦{(amt / 100).toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
              {amountKobo > 0 && (
                <div className="rounded-xl border bg-muted/40 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Investing</span>
                    <span className="font-semibold tabular-nums">{naira(amountKobo)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Est. return at maturity</span>
                    <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                      +{naira(Math.round((amountKobo * investProduct.expectedReturnBps) / 10_000))}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Matures in</span>
                    <span className="font-medium">{investProduct.durationLabel}</span>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>Capital is at risk. Past performance is not indicative of future returns.</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInvestProduct(null)} disabled={busy}>Cancel</Button>
            <Button onClick={submitInvest} disabled={busy || amountKobo <= 0} className="gap-1.5">
              {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Invest {amountKobo > 0 ? naira(amountKobo) : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Liquidate confirm */}
      <AlertDialog open={!!liquidateTarget} onOpenChange={(o) => !busy && !o && setLiquidateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liquidate {liquidateTarget?.productName ?? ""}?</AlertDialogTitle>
          <AlertDialogDescription>
              The current value of <span className="font-semibold">{naira(liquidateTarget?.currentValueKobo ?? 0)}</span> will be credited to your wallet. This investment will be marked as <span className="font-semibold">LIQUIDATED</span> and cannot be reactivated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={liquidate}
              disabled={busy}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
              Liquidate now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
