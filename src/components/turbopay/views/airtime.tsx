"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { PageHeader } from "../parts/layout";
import { usePin } from "../parts/pin-dialog";
import {
  Smartphone,
  Zap,
  CheckCircle2,
  ArrowLeft,
  Loader2,
  Wallet as WalletIcon,
  RefreshCw,
} from "lucide-react";
import { NETWORKS } from "@/lib/constants";
import { DATA_PLANS } from "@/lib/banks";
import { naira, parseKobo } from "@/lib/money";
import { toast } from "sonner";

interface WalletInfo {
  balanceKobo: number;
  currency: string;
  status: string;
}

const QUICK_CHIPS = [
  { label: "₦100", kobo: 10_000 },
  { label: "₦200", kobo: 20_000 },
  { label: "₦500", kobo: 50_000 },
  { label: "₦1k", kobo: 100_000 },
  { label: "₦2k", kobo: 200_000 },
  { label: "₦5k", kobo: 500_000 },
];

interface AirtimeSuccess {
  network: string;
  phone: string;
  amountKobo: number;
  reference: string;
  newBalance: number;
}

export default function AirtimeView() {
  const pin = usePin();
  const [wallet, setWallet] = React.useState<WalletInfo | null>(null);
  const [loadingWallet, setLoadingWallet] = React.useState(true);

  const loadWallet = React.useCallback(async () => {
    try {
      const res = await fetch("/api/wallet", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setWallet(data.wallet ?? null);
      }
    } catch {
    } finally {
      setLoadingWallet(false);
    }
  }, []);
  React.useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Airtime & Data"
        subtitle="Top up any line instantly — no fees, no delays."
      />

      {/* Balance bar */}
      <Card className="tp-emerald-grad relative overflow-hidden p-5 text-white tp-sheen">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs opacity-80">Available balance</p>
            {loadingWallet ? (
              <div className="mt-1 h-8 w-40 animate-pulse rounded-lg bg-white/20" />
            ) : (
              <p className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">
                {wallet ? naira(wallet.balanceKobo) : "₦0.00"}
              </p>
            )}
          </div>
          <Badge className="bg-white/20 text-white">
            <WalletIcon className="mr-1 h-3 w-3" /> Turbopay wallet
          </Badge>
        </div>
      </Card>

      <Tabs defaultValue="airtime" className="w-full">
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="airtime" className="gap-1.5">
            <Smartphone className="h-4 w-4" /> Airtime
          </TabsTrigger>
          <TabsTrigger value="data" className="gap-1.5">
            <Zap className="h-4 w-4" /> Data
          </TabsTrigger>
        </TabsList>

        <TabsContent value="airtime" className="mt-4">
          <AirtimeForm
            pin={pin}
            onSuccess={(s) => {
              setWallet((w) => (w ? { ...w, balanceKobo: s.newBalance } : w));
            }}
            onRefresh={loadWallet}
          />
        </TabsContent>

        <TabsContent value="data" className="mt-4">
          <DataForm
            pin={pin}
            onSuccess={(s) => {
              setWallet((w) => (w ? { ...w, balanceKobo: s.newBalance } : w));
            }}
            onRefresh={loadWallet}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============== AIRTIME FORM ==============

function AirtimeForm({
  pin,
  onSuccess,
  onRefresh,
}: {
  pin: ReturnType<typeof usePin>;
  onSuccess: (s: AirtimeSuccess) => void;
  onRefresh: () => void;
}) {
  const [network, setNetwork] = React.useState<string>("");
  const [phone, setPhone] = React.useState("");
  const [amountInput, setAmountInput] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [success, setSuccess] = React.useState<AirtimeSuccess | null>(null);

  const amountKobo = parseKobo(amountInput);
  const canSubmit =
    !!network && phone.replace(/\D/g, "").length >= 10 && amountKobo >= 5_000 && !submitting;

  async function handleSubmit() {
    if (!network) return toast.error("Select a network");
    if (phone.replace(/\D/g, "").length < 10) return toast.error("Enter a valid phone number");
    if (amountKobo < 5_000) return toast.error("Minimum airtime is ₦50");
    if (amountKobo > 5_000_000) return toast.error("Maximum airtime is ₦50,000");

    const pinVal = await pin.request({
      title: "Confirm airtime purchase",
      description: `${naira(amountKobo)} of ${network} airtime to ${phone}`,
    });
    if (!pinVal) return toast.error("PIN required to continue");

    setSubmitting(true);
    try {
      const res = await fetch("/api/airtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network,
          phone,
          amountKobo,
          pin: pinVal,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Purchase failed");

      const s: AirtimeSuccess = {
        network,
        phone,
        amountKobo,
        reference: data.transaction.reference,
        newBalance: data.newBalance,
      };
      setSuccess(s);
      onSuccess(s);
      toast.success("Airtime purchase successful");
      setPhone("");
      setAmountInput("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Purchase failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <SuccessCard
        title="Airtime purchase successful"
        subtitle={`${success.network} · ${success.phone}`}
        amountKobo={success.amountKobo}
        reference={success.reference}
        newBalance={success.newBalance}
        onAgain={() => setSuccess(null)}
      />
    );
  }

  return (
    <Card className="p-5 sm:p-6">
      <p className="text-sm font-semibold">Buy airtime</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Select a network, enter the phone number and amount.
      </p>

      {/* Network picker */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {NETWORKS.map((n) => {
          const active = network === n.id;
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => setNetwork(n.id)}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all ${
                active
                  ? "border-primary shadow-sm"
                  : "border-border hover:border-primary/40 hover:bg-muted/40"
              }`}
              style={active ? { borderColor: n.color } : undefined}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: n.color, color: n.textColor }}
              >
                {n.name.slice(0, 2)}
              </div>
              <span className="text-xs font-medium">{n.name}</span>
            </button>
          );
        })}
      </div>

      {/* Phone */}
      <div className="mt-5 space-y-2">
        <Label htmlFor="airtime-phone">Phone number</Label>
        <div className="relative">
          <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="airtime-phone"
            inputMode="tel"
            placeholder="0801 234 5678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Amount */}
      <div className="mt-5 space-y-2">
        <Label htmlFor="airtime-amount">Amount</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
            ₦
          </span>
          <Input
            id="airtime-amount"
            inputMode="numeric"
            placeholder="0.00"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value.replace(/[^\d.]/g, ""))}
            className="pl-8"
          />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {QUICK_CHIPS.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => setAmountInput(String(c.kobo / 100))}
              className="rounded-lg border border-border px-2 py-1.5 text-xs font-medium transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary + action */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {amountKobo > 0 && (
            <p className="text-muted-foreground">
              You pay <span className="font-semibold text-foreground">{naira(amountKobo)}</span> ·{" "}
              <span className="text-emerald-600 dark:text-emerald-400">no fee</span>
            </p>
          )}
        </div>
        <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-1.5">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
          Buy airtime
        </Button>
      </div>
    </Card>
  );
}

// ============== DATA FORM ==============

function DataForm({
  pin,
  onSuccess,
  onRefresh,
}: {
  pin: ReturnType<typeof usePin>;
  onSuccess: (s: AirtimeSuccess) => void;
  onRefresh: () => void;
}) {
  const [network, setNetwork] = React.useState<string>("");
  const [phone, setPhone] = React.useState("");
  const [planId, setPlanId] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState(false);
  const [success, setSuccess] = React.useState<AirtimeSuccess | null>(null);

  const plans = network ? DATA_PLANS[network] ?? [] : [];
  const plan = plans.find((p) => p.id === planId);
  const amountKobo = plan?.amountKobo ?? 0;
  const canSubmit =
    !!network && !!plan && phone.replace(/\D/g, "").length >= 10 && !submitting;

  // Reset plan when network changes
  React.useEffect(() => {
    setPlanId("");
  }, [network]);

  async function handleSubmit() {
    if (!network) return toast.error("Select a network");
    if (!plan) return toast.error("Select a data plan");
    if (phone.replace(/\D/g, "").length < 10) return toast.error("Enter a valid phone number");

    const pinVal = await pin.request({
      title: "Confirm data purchase",
      description: `${plan.name} · ${naira(plan.amountKobo)} to ${phone}`,
    });
    if (!pinVal) return toast.error("PIN required to continue");

    setSubmitting(true);
    try {
      const res = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network,
          phone,
          planId,
          amountKobo,
          pin: pinVal,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Purchase failed");

      const s: AirtimeSuccess = {
        network,
        phone,
        amountKobo,
        reference: data.transaction.reference,
        newBalance: data.newBalance,
      };
      setSuccess(s);
      onSuccess(s);
      toast.success("Data purchase successful");
      setPhone("");
      setPlanId("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Purchase failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <SuccessCard
        title="Data purchase successful"
        subtitle={`${success.network} · ${success.phone}`}
        amountKobo={success.amountKobo}
        reference={success.reference}
        newBalance={success.newBalance}
        onAgain={() => setSuccess(null)}
      />
    );
  }

  return (
    <Card className="p-5 sm:p-6">
      <p className="text-sm font-semibold">Buy data</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Pick a network and browse plans.
      </p>

      {/* Network picker */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {NETWORKS.map((n) => {
          const active = network === n.id;
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => setNetwork(n.id)}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all ${
                active
                  ? "border-primary shadow-sm"
                  : "border-border hover:border-primary/40 hover:bg-muted/40"
              }`}
              style={active ? { borderColor: n.color } : undefined}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: n.color, color: n.textColor }}
              >
                {n.name.slice(0, 2)}
              </div>
              <span className="text-xs font-medium">{n.name}</span>
            </button>
          );
        })}
      </div>

      {/* Phone */}
      <div className="mt-5 space-y-2">
        <Label htmlFor="data-phone">Phone number</Label>
        <div className="relative">
          <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="data-phone"
            inputMode="tel"
            placeholder="0801 234 5678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Plan */}
      <div className="mt-5 space-y-2">
        <Label>Data plan</Label>
        {network ? (
          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a plan" />
            </SelectTrigger>
            <SelectContent>
              {plans.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex w-full items-center justify-between gap-2">
                    <span>{p.name}</span>
                    <span className="ml-2 font-semibold text-primary">{naira(p.amountKobo)}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
            Select a network to see plans
          </div>
        )}

        {plan && (
          <div className="mt-2 rounded-xl bg-muted/40 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium">{plan.name}</span>
              <span className="font-semibold text-primary">{naira(plan.amountKobo)}</span>
            </div>
            <p className="mt-0.5 text-muted-foreground">Valid for {plan.validity}</p>
          </div>
        )}
      </div>

      {/* Summary + action */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {plan && (
            <p className="text-muted-foreground">
              You pay <span className="font-semibold text-foreground">{naira(amountKobo)}</span> ·{" "}
              <span className="text-emerald-600 dark:text-emerald-400">no fee</span>
            </p>
          )}
        </div>
        <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-1.5">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          Buy data
        </Button>
      </div>

      <button
        onClick={onRefresh}
        className="mt-4 hidden items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <RefreshCw className="h-3 w-3" /> Refresh balance
      </button>
    </Card>
  );
}

// ============== SHARED SUCCESS CARD ==============

function SuccessCard({
  title,
  subtitle,
  amountKobo,
  reference,
  newBalance,
  onAgain,
}: {
  title: string;
  subtitle: string;
  amountKobo: number;
  reference: string;
  newBalance: number;
  onAgain: () => void;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col items-center gap-3 bg-emerald-500/10 px-6 py-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <div>
          <p className="text-base font-semibold">{title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
          {naira(amountKobo)}
        </p>
      </div>

      <div className="space-y-3 p-5">
        <Row label="Reference" value={reference} mono />
        <Row label="New balance" value={naira(newBalance)} />
      </div>

      <div className="flex gap-2 border-t bg-muted/30 p-4">
        <Button variant="outline" className="flex-1 gap-1.5" onClick={onAgain}>
          <ArrowLeft className="h-4 w-4" /> Buy again
        </Button>
      </div>
    </Card>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
