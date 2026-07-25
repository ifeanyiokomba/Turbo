"use client";

import * as React from "react";
import { useApp } from "../store";
import { BalanceCard } from "../parts/balance-card";
import { PageHeader, EmptyState } from "../parts/layout";
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  RefreshCw,
  Plus,
  ShieldAlert,
  Landmark,
  CreditCard,
  Smartphone,
  Sparkles,
  Copy,
  Check,
  ChevronRight,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import { naira, nairaPlain, parseKobo, timeAgo } from "@/lib/money";
import { toast } from "sonner";

interface WalletData {
  wallet: { balanceKobo: number; currency: string; status: string } | null;
  virtualAccount: {
    accountNumber: string;
    accountName: string;
    bankName: string;
    bankCode: string;
  } | null;
  ledgerEntries: Array<{
    id: string;
    entryType: string;
    amountKobo: number;
    refType: string;
    description: string;
    balanceAfterKobo: number;
    createdAt: string;
  }>;
}

type FundMethod = "BANK_TRANSFER" | "CARD" | "USSD" | "DEMO";

const QUICK_AMOUNTS = [
  { label: "₦1K", kobo: 100_000 },
  { label: "₦5K", kobo: 500_000 },
  { label: "₦10K", kobo: 1_000_000 },
  { label: "₦50K", kobo: 5_000_000 },
  { label: "₦100K", kobo: 10_000_000 },
];

const REF_LABELS: Record<string, string> = {
  FUNDING: "Funding",
  TRANSFER: "Transfer",
  AIRTIME: "Airtime",
  DATA: "Data",
  BILL: "Bills",
  REVERSAL: "Reversal",
  FEE: "Fee",
  CARD_FUND: "Card topup",
  CARD_WITHDRAW: "Card withdraw",
  REWARD: "Reward",
  REFERRAL: "Referral",
  SAVINGS: "Savings",
  INVESTMENT: "Investment",
};

function LedgerRow({
  entry,
}: {
  entry: WalletData["ledgerEntries"][number];
}) {
  const isCredit = entry.entryType === "CREDIT";
  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/60">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          isCredit
            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        }`}
      >
        {isCredit ? (
          <ArrowDownLeft className="h-4.5 w-4.5" />
        ) : (
          <ArrowUpRight className="h-4.5 w-4.5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {entry.description || REF_LABELS[entry.refType] || entry.refType}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {REF_LABELS[entry.refType] ?? entry.refType} · {timeAgo(entry.createdAt)}
        </p>
      </div>
      <div className="text-right">
        <p
          className={`text-sm font-semibold tabular-nums ${
            isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
          }`}
        >
          {isCredit ? "+" : "−"}
          {naira(entry.amountKobo)}
        </p>
        <p className="text-[10px] text-muted-foreground tabular-nums">
          Bal {nairaPlain(entry.balanceAfterKobo)}
        </p>
      </div>
    </div>
  );
}

export default function WalletView() {
  const { user, setView } = useApp();
  const [data, setData] = React.useState<WalletData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [hideBalance, setHideBalance] = React.useState(false);

  const [fundOpen, setFundOpen] = React.useState(false);
  const [method, setMethod] = React.useState<FundMethod>("BANK_TRANSFER");
  const [amountInput, setAmountInput] = React.useState("");
  const [funding, setFunding] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const amountKobo = parseKobo(amountInput);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wallet", { cache: "no-store" });
      if (res.ok) setData(await res.json());
      else if (res.status === 401) {
        toast.error("Session expired. Please log in again.");
      } else {
        toast.error("Failed to load wallet.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  function copyAcc() {
    const acc = data?.virtualAccount?.accountNumber;
    if (!acc) return;
    navigator.clipboard.writeText(acc);
    setCopied(true);
    toast.success("Account number copied");
    setTimeout(() => setCopied(false), 1500);
  }

  async function fundWallet() {
    if (amountKobo <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setFunding(true);
    try {
      const res = await fetch("/api/wallet/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountKobo, method }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? "Funding failed");
        return;
      }
      toast.success(`Wallet funded with ${naira(amountKobo)}`);
      setAmountInput("");
      setFundOpen(false);
      load();
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setFunding(false);
    }
  }

  const recent = data?.ledgerEntries?.slice(0, 10) ?? [];
  const kycUnverified = user && user.kycStatus !== "VERIFIED";

  return (
    <div className="space-y-6 tp-fade-rise">
      <PageHeader
        title="Wallet"
        subtitle="Fund, transfer and review your ledger activity."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button size="sm" onClick={() => setFundOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Fund wallet
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-2">
          {loading ? (
            <Skeleton className="aspect-[1.7/1] w-full max-w-md rounded-3xl" />
          ) : data?.wallet ? (
            <BalanceCard
              balanceKobo={data.wallet.balanceKobo}
              accountNumber={data.virtualAccount?.accountNumber}
              accountName={data.virtualAccount?.accountName}
              onFund={() => setFundOpen(true)}
              onTransfer={() => setView("transfer")}
              hideBalance={hideBalance}
              onToggleHide={() => setHideBalance((v) => !v)}
            />
          ) : (
            <EmptyState
              icon={Landmark}
              title="No wallet yet"
              description="Contact support if your wallet is missing."
            />
          )}

          {/* Quick fund chips */}
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Quick fund</p>
              <span className="text-xs text-muted-foreground">Tap to top up</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((a) => (
                <button
                  key={a.label}
                  onClick={() => {
                    setAmountInput(String(a.kobo / 100));
                    setMethod("BANK_TRANSFER");
                    setFundOpen(true);
                  }}
                  className="rounded-full border border-border bg-background px-4 py-1.5 text-sm font-medium transition-colors hover:border-primary hover:bg-primary/5"
                >
                  {a.label}
                </button>
              ))}
            </div>
          </Card>

          {/* Recent ledger entries */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Recent activity</p>
              <button
                onClick={() => setView("history")}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                View all <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-xl" />
                ))}
              </div>
            ) : recent.length > 0 ? (
              <div className="max-h-96 overflow-y-auto scrollbar-thin space-y-1 pr-1">
                {recent.map((e) => (
                  <LedgerRow key={e.id} entry={e} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Landmark}
                title="No activity yet"
                description="Fund your wallet to get started."
                action={
                  <Button size="sm" onClick={() => setFundOpen(true)} className="gap-1.5">
                    <Plus className="h-4 w-4" /> Fund wallet
                  </Button>
                }
              />
            )}
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* KYC nudge */}
          {kycUnverified && (
            <Card className="border-amber-500/30 bg-amber-500/10 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Verify your identity</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Tier {user?.kycTier} · Upgrade KYC to unlock higher limits and bank transfers.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 gap-1.5"
                    onClick={() => setView("kyc")}
                  >
                    Upgrade KYC <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Virtual account summary */}
          {data?.virtualAccount && (
            <Card className="p-5">
              <p className="text-sm font-semibold">Virtual account</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pay into this account to top up your wallet instantly.
              </p>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Account number</span>
                  <button
                    onClick={copyAcc}
                    className="flex items-center gap-1.5 font-mono text-sm font-medium"
                  >
                    {data.virtualAccount.accountNumber}
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Account name</span>
                  <span className="text-sm font-medium">{data.virtualAccount.accountName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Bank</span>
                  <span className="text-sm font-medium">{data.virtualAccount.bankName}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full gap-1.5"
                  onClick={() => {
                    setMethod("BANK_TRANSFER");
                    setFundOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" /> Fund via this account
                </Button>
              </div>
            </Card>
          )}

          {/* Funding methods */}
          <Card className="p-5">
            <p className="text-sm font-semibold">Funding methods</p>
            <div className="mt-3 space-y-2">
              {[
                { icon: Landmark, label: "Bank transfer", desc: "Free · instant" },
                { icon: CreditCard, label: "Debit card", desc: "Visa / Mastercard · 1.4%" },
                { icon: Smartphone, label: "USSD", desc: "*737# · free" },
                { icon: Sparkles, label: "Demo credit", desc: "Instant test funds" },
              ].map((m) => (
                <button
                  key={m.label}
                  onClick={() => {
                    setMethod(
                      m.label === "Bank transfer"
                        ? "BANK_TRANSFER"
                        : m.label === "Debit card"
                        ? "CARD"
                        : m.label === "USSD"
                        ? "USSD"
                        : "DEMO",
                    );
                    setFundOpen(true);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-transparent p-2 text-left transition-colors hover:border-border hover:bg-muted/50"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <m.icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Fund wallet dialog */}
      <Dialog open={fundOpen} onOpenChange={setFundOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Fund your wallet</DialogTitle>
            <DialogDescription>
              Choose a funding method. Funds are credited instantly.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={method} onValueChange={(v) => setMethod(v as FundMethod)}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="BANK_TRANSFER" className="text-xs">
                <Landmark className="h-3.5 w-3.5" /> Bank
              </TabsTrigger>
              <TabsTrigger value="CARD" className="text-xs">
                <CreditCard className="h-3.5 w-3.5" /> Card
              </TabsTrigger>
              <TabsTrigger value="USSD" className="text-xs">
                <Smartphone className="h-3.5 w-3.5" /> USSD
              </TabsTrigger>
              <TabsTrigger value="DEMO" className="text-xs">
                <Sparkles className="h-3.5 w-3.5" /> Demo
              </TabsTrigger>
            </TabsList>

            {/* Amount input shared */}
            <div className="mt-4 space-y-2">
              <Label htmlFor="fund-amount">Amount (₦)</Label>
              <Input
                id="fund-amount"
                inputMode="numeric"
                placeholder="0.00"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
              <div className="flex flex-wrap gap-1.5">
                {QUICK_AMOUNTS.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={() => setAmountInput(String(a.kobo / 100))}
                    className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium hover:border-primary hover:bg-primary/5"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              {amountKobo > 0 && (
                <p className="text-xs text-muted-foreground">
                  You&apos;ll receive <span className="font-semibold text-foreground">{naira(amountKobo)}</span>
                </p>
              )}
            </div>

            <TabsContent value="BANK_TRANSFER" className="mt-3">
              <div className="rounded-xl border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Transfer to your virtual account</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold">
                    {data?.virtualAccount?.accountNumber ?? "—"}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5 px-2"
                    onClick={copyAcc}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    Copy
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data?.virtualAccount?.accountName} · {data?.virtualAccount?.bankName}
                </p>
              </div>
              <Button
                className="mt-3 w-full gap-1.5"
                disabled={amountKobo <= 0 || funding}
                onClick={fundWallet}
              >
                {funding ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                I&apos;ve sent {amountKobo > 0 ? naira(amountKobo) : "₦0"}
              </Button>
            </TabsContent>

            <TabsContent value="CARD" className="mt-3">
              <div className="space-y-2">
                <Label htmlFor="card-num">Card number</Label>
                <Input id="card-num" placeholder="4242 4242 4242 4242" inputMode="numeric" />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="card-exp">Expiry</Label>
                    <Input id="card-exp" placeholder="MM/YY" />
                  </div>
                  <div>
                    <Label htmlFor="card-cvv">CVV</Label>
                    <Input id="card-cvv" placeholder="123" inputMode="numeric" />
                  </div>
                </div>
              </div>
              <Button
                className="mt-3 w-full gap-1.5"
                disabled={amountKobo <= 0 || funding}
                onClick={fundWallet}
              >
                {funding ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                Pay {amountKobo > 0 ? naira(amountKobo) : "₦0"}
              </Button>
            </TabsContent>

            <TabsContent value="USSD" className="mt-3">
              <div className="rounded-xl border bg-muted/40 p-4 text-center">
                <p className="text-xs text-muted-foreground">Dial this code from your registered phone</p>
                <p className="mt-2 font-mono text-2xl font-bold tracking-wider text-primary">
                  *737*000*{amountKobo > 0 ? Math.floor(amountKobo / 100) : "0"}#
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Available on MTN, Glo, Airtel &amp; 9mobile
                </p>
              </div>
              <Button
                className="mt-3 w-full gap-1.5"
                disabled={amountKobo <= 0 || funding}
                onClick={fundWallet}
              >
                {funding ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                I&apos;ve dialled the code
              </Button>
            </TabsContent>

            <TabsContent value="DEMO" className="mt-3">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    Demo funding
                  </p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Instant test credit — no real money is debited. Useful for trying out Turbopay.
                </p>
              </div>
              <Button
                className="mt-3 w-full gap-1.5"
                disabled={amountKobo <= 0 || funding}
                onClick={fundWallet}
              >
                {funding ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Credit {amountKobo > 0 ? naira(amountKobo) : "₦0"} instantly
              </Button>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-2">
            <Badge variant="secondary" className="mr-auto gap-1">
              <ShieldAlert className="h-3 w-3" /> Secured by Turbopay
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => setFundOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
