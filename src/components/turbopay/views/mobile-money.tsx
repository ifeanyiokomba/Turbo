"use client";

import * as React from "react";
import { useApp } from "../store";
import { usePin } from "../parts/pin-dialog";
import { PageHeader, EmptyState } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Smartphone,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Send,
  CheckCircle2,
  Wifi,
  AlertCircle,
  History,
} from "lucide-react";
import { formatMoney, timeAgo } from "@/lib/money";
import { toast } from "sonner";

const WALLET_PROVIDERS = [
  { code: "MPESA", name: "M-Pesa", color: "bg-green-500/10 text-green-600 dark:text-green-400", countries: ["KE", "TZ"] },
  { code: "MTN_MOMO", name: "MTN MoMo", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400", countries: ["GH", "UG", "CI", "CM"] },
  { code: "AIRTEL_MONEY", name: "Airtel Money", color: "bg-red-500/10 text-red-600 dark:text-red-400", countries: ["KE", "GH", "UG", "TZ"] },
];

interface MomoTx {
  id: string;
  reference: string;
  type: string;
  direction: string;
  amountKobo: number;
  status: string;
  counterpartyName: string | null;
  description: string | null;
  provider: string | null;
  createdAt: string;
}

export default function MobileMoneyView() {
  const { user } = useApp();
  const { request: requestPin } = usePin();
  const [tab, setTab] = React.useState<"collect" | "disburse" | "history">("collect");

  const [phone, setPhone] = React.useState("");
  const [amountInput, setAmountInput] = React.useState("");
  const [provider, setProvider] = React.useState("MPESA");
  const [narration, setNarration] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const [history, setHistory] = React.useState<MomoTx[]>([]);
  const [loading, setLoading] = React.useState(true);

  const country = user?.country ?? "KE";
  const availableProviders = WALLET_PROVIDERS.filter((p) => p.countries.includes(country));

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/transactions?type=MOBILE_MONEY&limit=50", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setHistory(json.transactions ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Auto-pick first available provider
  React.useEffect(() => {
    if (availableProviders.length > 0 && !availableProviders.find((p) => p.code === provider)) {
      setProvider(availableProviders[0].code);
    }
  }, [availableProviders, provider]);

  async function submit(direction: "INBOUND" | "OUTBOUND") {
    if (!phone || phone.length < 10) {
      toast.error("Enter a valid phone number");
      return;
    }
    const amountMinor = Math.round(Number(amountInput) * 100);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const pin = await requestPin({
      title: direction === "INBOUND" ? "Confirm collection" : "Confirm disbursement",
      description: `${direction === "INBOUND" ? "Collect" : "Send"} from ${phone} (${provider})`,
    });
    if (!pin) {
      toast.error("PIN required");
      return;
    }
    setBusy(true);
    try {
      const endpoint = direction === "INBOUND" ? "/api/mobile-money/collect" : "/api/mobile-money/disburse";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          amountMinor,
          walletProvider: provider,
          pin,
          narration: narration || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json?.error ?? "Operation failed");
        return;
      }
      toast.success(
        direction === "INBOUND" ? `STK push sent to ${phone}` : `Disbursed to ${phone}`,
      );
      setPhone("");
      setAmountInput("");
      setNarration("");
      load();
      setTab("history");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 tp-fade-rise">
      <PageHeader
        title="Mobile Money"
        subtitle={`STK push collections & B2C disbursements via ${availableProviders.map((p) => p.name).join(" / ")}.`}
        actions={
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-5">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="collect" className="gap-1.5">
            <ArrowDownLeft className="h-3.5 w-3.5" /> Collect
          </TabsTrigger>
          <TabsTrigger value="disburse" className="gap-1.5">
            <ArrowUpRight className="h-3.5 w-3.5" /> Disburse
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-3.5 w-3.5" /> History
          </TabsTrigger>
        </TabsList>

        {/* COLLECT TAB */}
        <TabsContent value="collect" className="space-y-5">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <p className="text-sm font-semibold">Collect via STK push</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Send an STK prompt to your customer&apos;s phone. They enter their M-Pesa/MoMo PIN to authorize the payment.
              </p>

              <div className="mt-4 space-y-3">
                <div className="space-y-2">
                  <Label>Wallet provider</Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {availableProviders.map((p) => (
                      <button
                        key={p.code}
                        type="button"
                        onClick={() => setProvider(p.code)}
                        className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors ${
                          provider === p.code
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <Smartphone className="h-4 w-4" />
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="momo-phone">Customer phone</Label>
                  <Input
                    id="momo-phone"
                    inputMode="tel"
                    placeholder="+254 712 345 678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="momo-amount">Amount ({user?.country === "KE" ? "KES" : "GHS"})</Label>
                  <Input
                    id="momo-amount"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {[100, 500, 1000, 5000].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setAmountInput(String(v))}
                        className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium hover:border-primary hover:bg-primary/5"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="momo-narration">Narration (optional)</Label>
                  <Input
                    id="momo-narration"
                    placeholder="What is this payment for?"
                    value={narration}
                    onChange={(e) => setNarration(e.target.value)}
                  />
                </div>

                <Button
                  className="w-full gap-1.5"
                  onClick={() => submit("INBOUND")}
                  disabled={busy}
                >
                  {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowDownLeft className="h-4 w-4" />}
                  Send STK push
                </Button>
              </div>
            </Card>

            <div className="space-y-4">
              <Card className="p-5">
                <p className="text-sm font-semibold">How STK push works</p>
                <ol className="mt-3 space-y-2 text-xs text-muted-foreground">
                  <li className="flex gap-2"><span className="font-bold text-emerald-600">1.</span> Enter customer phone + amount.</li>
                  <li className="flex gap-2"><span className="font-bold text-emerald-600">2.</span> Confirm with your PIN.</li>
                  <li className="flex gap-2"><span className="font-bold text-emerald-600">3.</span> Customer gets an STK prompt.</li>
                  <li className="flex gap-2"><span className="font-bold text-emerald-600">4.</span> They enter their M-Pesa/MoMo PIN.</li>
                  <li className="flex gap-2"><span className="font-bold text-emerald-600">5.</span> Funds land in your wallet instantly.</li>
                </ol>
              </Card>
              <Card className="border-amber-500/30 bg-amber-500/10 p-5">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <p className="mt-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                  Country-locked
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Mobile Money is georouted. Your country is <strong>{country}</strong>. Switch in Settings to use a different provider.
                </p>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* DISBURSE TAB */}
        <TabsContent value="disburse" className="space-y-5">
          <Card className="p-5">
            <p className="text-sm font-semibold">Disburse (B2C payout)</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Send money from your Turbopay wallet directly to a customer&apos;s mobile money wallet.
            </p>

            <div className="mt-4 space-y-3">
              <div className="space-y-2">
                <Label>Wallet provider</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {availableProviders.map((p) => (
                    <button
                      key={p.code}
                      type="button"
                      onClick={() => setProvider(p.code)}
                      className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors ${
                        provider === p.code
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <Smartphone className="h-4 w-4" />
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="disb-phone">Recipient phone</Label>
                <Input
                  id="disb-phone"
                  inputMode="tel"
                  placeholder="+254 712 345 678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="disb-amount">Amount</Label>
                <Input
                  id="disb-amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                />
              </div>

              <Button
                className="w-full gap-1.5"
                onClick={() => submit("OUTBOUND")}
                disabled={busy}
              >
                {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                Disburse funds
              </Button>
            </div>
          </Card>
        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history" className="space-y-5">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold">Mobile money transactions</p>
              <Badge variant="secondary">{history.length} transactions</Badge>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
              </div>
            ) : history.length === 0 ? (
              <EmptyState
                icon={Wifi}
                title="No mobile money transactions yet"
                description="Your STK collections and B2C disbursements will appear here."
              />
            ) : (
              <div className="max-h-[60vh] space-y-2 overflow-y-auto scrollbar-thin pr-1">
                {history.map((tx) => {
                  const isCredit = tx.direction === "CREDIT";
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 rounded-xl border border-transparent p-3 transition-colors hover:border-border hover:bg-muted/40"
                    >
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                          isCredit ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        <Smartphone className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {tx.counterpartyName ?? "Mobile money"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {tx.reference} · {tx.provider} · {timeAgo(tx.createdAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-semibold tabular-nums ${isCredit ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                          {isCredit ? "+" : "−"}{formatMoney(tx.amountKobo, "KES")}
                        </p>
                        <Badge variant={tx.status === "SUCCESS" ? "secondary" : "outline"} className="text-[10px]">
                          {tx.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
