"use client";

import * as React from "react";
import { useApp } from "../store";
import { usePin } from "../parts/pin-dialog";
import { PageHeader, EmptyState, StatCard } from "../parts/layout";
import { StatCardSkeleton } from "../parts/skeletons";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Globe,
  Plus,
  ArrowRight,
  RefreshCw,
  TrendingUp,
  Wallet as WalletIcon,
  Check,
  ArrowLeftRight,
} from "lucide-react";
import { formatMoney, naira } from "@/lib/money";
import { toast } from "sonner";

interface CurrencyWallet {
  id: string;
  currency: string;
  balanceMinor: number;
  status: string;
  flag: string;
  name: string;
  ngnEquivMinor: number;
}

interface SupportedCurrency {
  code: string;
  flag: string;
  name: string;
}

interface FxQuote {
  quoteId: string;
  base: string;
  quote: string;
  rate: number;
  feeMinor: number;
  totalDebitMinor: number;
  totalCreditMinor: number;
  expiresAt: string;
}

interface FxRate {
  base: string;
  quote: string;
  label: string;
  rate: number;
  source: string;
  fetchedAt: string;
  expiresAt: string;
}

interface DataState {
  wallets: CurrencyWallet[];
  totalNgnEquivMinor: number;
  supportedCurrencies: SupportedCurrency[];
}

export default function MultiCurrencyView() {
  const { user } = useApp();
  const { request: requestPin } = usePin();
  const [data, setData] = React.useState<DataState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [rates, setRates] = React.useState<FxRate[]>([]);
  const [ratesLoading, setRatesLoading] = React.useState(true);

  const [openOpen, setOpenOpen] = React.useState(false);
  const [newCurrency, setNewCurrency] = React.useState("");
  const [opening, setOpening] = React.useState(false);

  const [convertOpen, setConvertOpen] = React.useState(false);
  const [fromCurrency, setFromCurrency] = React.useState("");
  const [toCurrency, setToCurrency] = React.useState("");
  const [amountInput, setAmountInput] = React.useState("");
  const [quote, setQuote] = React.useState<FxQuote | null>(null);
  const [quoting, setQuoting] = React.useState(false);
  const [converting, setConverting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wallets/currencies", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (json.wallets?.length > 0 && !fromCurrency) {
          setFromCurrency(json.wallets[0].currency);
          if (json.wallets.length > 1) setToCurrency(json.wallets[1].currency);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [fromCurrency]);

  const loadRates = React.useCallback(async () => {
    setRatesLoading(true);
    try {
      const res = await fetch("/api/fx/rates", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setRates(json.rates ?? []);
      }
    } finally {
      setRatesLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    loadRates();
  }, [load, loadRates]);

  function minorToInput(minor: number): string {
    return (minor / 100).toString();
  }

  async function openWallet() {
    if (!newCurrency) {
      toast.error("Pick a currency");
      return;
    }
    setOpening(true);
    try {
      const res = await fetch("/api/wallets/currencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency: newCurrency }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? "Could not open wallet");
        return;
      }
      toast.success(`${newCurrency} wallet ${json.created ? "opened" : "already exists"}`);
      setOpenOpen(false);
      setNewCurrency("");
      load();
    } finally {
      setOpening(false);
    }
  }

  async function fetchQuote() {
    const amountMinor = Math.round(Number(amountInput) * 100);
    if (!fromCurrency || !toCurrency) {
      toast.error("Pick from and to currencies");
      return;
    }
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (fromCurrency === toCurrency) {
      toast.error("From and to must differ");
      return;
    }
    setQuoting(true);
    setQuote(null);
    try {
      const url = `/api/fx/quote?from=${encodeURIComponent(fromCurrency)}&to=${encodeURIComponent(toCurrency)}&amountMinor=${amountMinor}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? "Could not fetch quote");
        return;
      }
      setQuote(json.quote);
    } finally {
      setQuoting(false);
    }
  }

  async function confirmConvert() {
    if (!quote) return;
    const pin = await requestPin({
      title: "Confirm conversion",
      description: `Convert ${formatMoney(quote.totalDebitMinor, quote.base)} → ${quote.quote}`,
    });
    if (!pin) {
      toast.error("PIN required");
      return;
    }
    setConverting(true);
    try {
      const res = await fetch("/api/fx/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromCurrency,
          to: toCurrency,
          amountMinor: Math.round(Number(amountInput) * 100),
          pin,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? "Conversion failed");
        return;
      }
      toast.success(
        `Converted ${formatMoney(json.amountMinor, json.from)} → ${formatMoney(json.creditMinor, json.to)}`
      );
      setConvertOpen(false);
      setQuote(null);
      setAmountInput("");
      load();
    } finally {
      setConverting(false);
    }
  }

  const availableToOpen =
    data?.supportedCurrencies.filter((c) => !data.wallets.some((w) => w.currency === c.code)) ?? [];

  return (
    <div className="tp-fade-rise space-y-6">
      <PageHeader
        title="Multi-Currency Wallets"
        subtitle="Hold, send and convert between 9 currencies at live FX rates."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => setConvertOpen(true)}
              className="gap-1.5"
              disabled={!data || data.wallets.length < 2}
            >
              <ArrowLeftRight className="h-4 w-4" /> Convert
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setOpenOpen(true)}
              className="gap-1.5"
              disabled={availableToOpen.length === 0}
            >
              <Plus className="h-4 w-4" /> Open wallet
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="Wallets held"
              value={String(data?.wallets.length ?? 0)}
              icon={WalletIcon}
              tone="default"
              hint="Active currency wallets"
            />
            <StatCard
              label="Total balance (NGN equiv.)"
              value={naira(data?.totalNgnEquivMinor ?? 0)}
              icon={Globe}
              tone="success"
              hint="Sum across all currencies"
            />
            <StatCard
              label="Currencies supported"
              value={String(data?.supportedCurrencies.length ?? 0)}
              icon={TrendingUp}
              tone="warning"
              hint="USD · EUR · GBP · KES · GHS · ZAR · CAD · AUD · NGN"
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Wallet list */}
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold">Your currency wallets</p>
              <Badge variant="secondary">{data?.wallets.length ?? 0} active</Badge>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-xl" />
                ))}
              </div>
            ) : (data?.wallets.length ?? 0) === 0 ? (
              <EmptyState
                icon={Globe}
                title="No currency wallets yet"
                description="Open your first wallet to start holding foreign currencies."
                action={
                  <Button size="sm" onClick={() => setOpenOpen(true)} className="gap-1.5">
                    <Plus className="h-4 w-4" /> Open wallet
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {data?.wallets.map((w) => (
                  <div
                    key={w.id}
                    className="tp-wallet-card tp-sheen relative overflow-hidden rounded-2xl p-4 text-white"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl leading-none">{w.flag}</span>
                        <div>
                          <p className="text-sm font-semibold">{w.currency}</p>
                          <p className="text-[10px] opacity-80">{w.name}</p>
                        </div>
                      </div>
                      <Badge className="bg-white/20 text-[10px] text-white hover:bg-white/30">
                        {w.status}
                      </Badge>
                    </div>
                    <p className="mt-4 text-xl font-bold tabular-nums">
                      {formatMoney(w.balanceMinor, w.currency)}
                    </p>
                    <p className="mt-1 text-[11px] opacity-70">≈ {naira(w.ngnEquivMinor)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* FX rates */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Live FX rates</p>
                <p className="text-muted-foreground text-xs">
                  Refreshed every 5 minutes · sandbox rates
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={loadRates} className="gap-1.5">
                <RefreshCw className={`h-3.5 w-3.5 ${ratesLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
            {ratesLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-md" />
                ))}
              </div>
            ) : (
              <div className="scrollbar-thin max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-background text-muted-foreground sticky top-0 text-left text-xs uppercase">
                    <tr>
                      <th className="pr-2 pb-2 font-medium">Pair</th>
                      <th className="pr-2 pb-2 text-right font-medium">Rate</th>
                      <th className="pb-2 text-right font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rates.map((r) => (
                      <tr key={r.label} className="border-b last:border-0">
                        <td className="py-2 pr-2 font-medium">{r.label}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">
                          {r.rate.toLocaleString("en-NG", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 4,
                          })}
                        </td>
                        <td className="py-2 text-right">
                          <Badge variant="outline" className="text-[10px]">
                            {r.source}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Side panel — convert CTA */}
        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-sm font-semibold">Convert currencies</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Move money between your wallets at live FX rates. A small spread applies.
            </p>
            <Button
              variant="secondary"
              className="mt-3 w-full gap-1.5"
              onClick={() => setConvertOpen(true)}
              disabled={!data || data.wallets.length < 2}
            >
              <ArrowLeftRight className="h-4 w-4" /> Start conversion
            </Button>
            {data && data.wallets.length < 2 && (
              <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                Open at least 2 currency wallets to convert.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <p className="text-sm font-semibold">Why hold foreign currency?</p>
            <ul className="text-muted-foreground mt-3 space-y-2 text-xs">
              <li className="flex gap-2">
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                Hedge against FX volatility
              </li>
              <li className="flex gap-2">
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                Send international transfers in source currency
              </li>
              <li className="flex gap-2">
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                Pay for cards & subscriptions in their currency
              </li>
              <li className="flex gap-2">
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                No monthly account fees
              </li>
            </ul>
          </Card>
        </div>
      </div>

      {/* Open wallet dialog */}
      <Dialog open={openOpen} onOpenChange={setOpenOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Open a currency wallet</DialogTitle>
            <DialogDescription>
              Choose a currency to start holding. Each wallet is free to maintain.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Currency</Label>
            <Select value={newCurrency} onValueChange={setNewCurrency}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {availableToOpen.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    <span className="mr-2">{c.flag}</span>
                    {c.code} · {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableToOpen.length === 0 && (
              <p className="text-muted-foreground text-xs">
                You already have wallets for all supported currencies.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenOpen(false)}>
              Cancel
            </Button>
            <Button onClick={openWallet} disabled={opening || !newCurrency} className="gap-1.5">
              {opening ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Open wallet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert dialog */}
      <Dialog
        open={convertOpen}
        onOpenChange={(o) => {
          setConvertOpen(o);
          if (!o) setQuote(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Convert currencies</DialogTitle>
            <DialogDescription>Move money between your wallets at the live rate.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>From</Label>
                <Select
                  value={fromCurrency}
                  onValueChange={(v) => {
                    setFromCurrency(v);
                    setQuote(null);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="From" />
                  </SelectTrigger>
                  <SelectContent>
                    {data?.wallets.map((w) => (
                      <SelectItem key={w.id} value={w.currency}>
                        <span className="mr-2">{w.flag}</span>
                        {w.currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>To</Label>
                <Select
                  value={toCurrency}
                  onValueChange={(v) => {
                    setToCurrency(v);
                    setQuote(null);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="To" />
                  </SelectTrigger>
                  <SelectContent>
                    {data?.wallets.map((w) => (
                      <SelectItem key={w.id} value={w.currency}>
                        <span className="mr-2">{w.flag}</span>
                        {w.currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="conv-amount">Amount</Label>
              <Input
                id="conv-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amountInput}
                onChange={(e) => {
                  setAmountInput(e.target.value);
                  setQuote(null);
                }}
              />
            </div>
            <Button
              variant="secondary"
              className="w-full gap-1.5"
              onClick={fetchQuote}
              disabled={quoting || !fromCurrency || !toCurrency || !amountInput}
            >
              {quoting ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <TrendingUp className="h-4 w-4" />
              )}
              Get quote
            </Button>
            {quote && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Rate</span>
                  <span className="font-semibold tabular-nums">
                    1 {quote.base} ={" "}
                    {quote.rate.toLocaleString("en-NG", { maximumFractionDigits: 4 })} {quote.quote}
                  </span>
                </div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">You send</span>
                  <span className="font-semibold tabular-nums">
                    {formatMoney(quote.totalDebitMinor, quote.base)}
                  </span>
                </div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Fee</span>
                  <span className="font-medium tabular-nums">
                    {formatMoney(quote.feeMinor, quote.base)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm">
                  <span className="text-muted-foreground">They receive</span>
                  <span className="flex items-center gap-1 font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                    <ArrowRight className="h-3.5 w-3.5" />
                    {formatMoney(quote.totalCreditMinor, quote.quote)}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConvertOpen(false);
                setQuote(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={confirmConvert} disabled={!quote || converting} className="gap-1.5">
              {converting ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Confirm convert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
