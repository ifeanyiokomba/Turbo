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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plane,
  Plus,
  ArrowRight,
  RefreshCw,
  Trash2,
  Send,
  CheckCircle2,
  Globe,
  UserPlus,
  Banknote,
  Smartphone,
  AlertCircle,
} from "lucide-react";
import { formatMoney, naira, timeAgo } from "@/lib/money";
import { toast } from "sonner";

interface CurrencyWallet {
  id: string;
  currency: string;
  balanceMinor: number;
  flag: string;
}

interface IntlBeneficiary {
  id: string;
  name: string;
  accountNumber: string;
  bankName: string;
  bankCode: string | null;
  type: string;
  isFavorite: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  country: string;
  currency: string;
  swiftCode?: string;
  iban?: string;
  routingNumber?: string;
  mobileWallet?: string;
}

interface IntlQuote {
  ok: boolean;
  quote?: {
    rate: number;
    feeMinor: number;
    totalMinor: number;
    expiresAt: string;
    provider: string;
    sourceCurrency: string;
    targetCurrency: string;
    amountMinor: number;
  };
  error?: string;
}

interface IntlTx {
  id: string;
  reference: string;
  type: string;
  direction: string;
  amountKobo: number;
  status: string;
  state: string;
  counterpartyName: string | null;
  counterpartyBank: string | null;
  description: string | null;
  provider: string | null;
  providerRef: string | null;
  createdAt: string;
}

const TARGET_CURRENCIES = [
  { code: "USD", flag: "🇺🇸", name: "US Dollar" },
  { code: "EUR", flag: "🇪🇺", name: "Euro" },
  { code: "GBP", flag: "🇬🇧", name: "British Pound" },
  { code: "KES", flag: "🇰🇪", name: "Kenyan Shilling" },
  { code: "GHS", flag: "🇬🇭", name: "Ghanaian Cedi" },
  { code: "ZAR", flag: "🇿🇦", name: "South African Rand" },
  { code: "CAD", flag: "🇨🇦", name: "Canadian Dollar" },
  { code: "AUD", flag: "🇦🇺", name: "Australian Dollar" },
];

const BENEFICIARY_COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "NL", name: "Netherlands" },
  { code: "IE", name: "Ireland" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "IN", name: "India" },
  { code: "CN", name: "China" },
  { code: "JP", name: "Japan" },
  { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" },
  { code: "GH", name: "Ghana" },
  { code: "ZA", name: "South Africa" },
];

const PURPOSES = [
  "Family support",
  "Education fees",
  "Medical bills",
  "Business payment",
  "Salary",
  "Loan repayment",
  "Gift",
  "Other",
];

export default function IntlTransfersView() {
  const { user } = useApp();
  const { request: requestPin } = usePin();

  const [wallets, setWallets] = React.useState<CurrencyWallet[]>([]);
  const [beneficiaries, setBeneficiaries] = React.useState<IntlBeneficiary[]>([]);
  const [history, setHistory] = React.useState<IntlTx[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Send form
  const [sourceCurrency, setSourceCurrency] = React.useState("NGN");
  const [targetCurrency, setTargetCurrency] = React.useState("USD");
  const [amountInput, setAmountInput] = React.useState("");
  const [beneficiaryId, setBeneficiaryId] = React.useState("");
  const [purpose, setPurpose] = React.useState(PURPOSES[0]);
  const [quote, setQuote] = React.useState<IntlQuote | null>(null);
  const [quoting, setQuoting] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  // Add beneficiary dialog
  const [addOpen, setAddOpen] = React.useState(false);
  const [benForm, setBenForm] = React.useState({
    name: "",
    country: "",
    bankName: "",
    accountNumber: "",
    iban: "",
    swiftCode: "",
    mobileWallet: "",
    currency: "USD",
  });
  const [savingBen, setSavingBen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [wRes, bRes, hRes] = await Promise.all([
        fetch("/api/wallets/currencies", { cache: "no-store" }),
        fetch("/api/intl/beneficiaries", { cache: "no-store" }),
        fetch("/api/transactions?type=INTERNATIONAL_TRANSFER&limit=50", { cache: "no-store" }),
      ]);
      if (wRes.ok) {
        const wJson = await wRes.json();
        setWallets(wJson.wallets ?? []);
        if ((wJson.wallets ?? []).length > 0 && !wJson.wallets.some((w: CurrencyWallet) => w.currency === sourceCurrency)) {
          setSourceCurrency(wJson.wallets[0].currency);
        }
      }
      if (bRes.ok) {
        const bJson = await bRes.json();
        setBeneficiaries(bJson.beneficiaries ?? []);
      }
      if (hRes.ok) {
        const hJson = await hRes.json();
        setHistory(hJson.transactions ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [sourceCurrency]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function fetchQuote() {
    const amountMinor = Math.round(Number(amountInput) * 100);
    if (!sourceCurrency || !targetCurrency) {
      toast.error("Pick source and target currencies");
      return;
    }
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setQuoting(true);
    setQuote(null);
    try {
      const url = `/api/intl/quote?source=${encodeURIComponent(sourceCurrency)}&target=${encodeURIComponent(targetCurrency)}&amountMinor=${amountMinor}`;
      const res = await fetch(url);
      const json = await res.json();
      setQuote(json);
      if (!json.ok) {
        toast.error(json.error ?? "Could not fetch quote");
      }
    } finally {
      setQuoting(false);
    }
  }

  async function sendTransfer() {
    if (!quote?.ok || !quote.quote) {
      toast.error("Get a quote first");
      return;
    }
    const ben = beneficiaries.find((b) => b.id === beneficiaryId);
    if (!ben) {
      toast.error("Pick a beneficiary");
      return;
    }
    const pin = await requestPin({
      title: "Confirm international transfer",
      description: `Send ${formatMoney(quote.quote.amountMinor, quote.quote.sourceCurrency)} to ${ben.name}`,
    });
    if (!pin) {
      toast.error("PIN required");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/intl/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceCurrency,
          targetCurrency,
          amountMinor: quote.quote.amountMinor,
          beneficiary: {
            name: ben.name,
            country: ben.country,
            bankName: ben.bankName,
            accountNumber: ben.accountNumber,
            iban: ben.iban,
            swiftCode: ben.swiftCode,
            mobileWallet: ben.mobileWallet,
            currency: ben.currency || targetCurrency,
          },
          purpose,
          pin,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json?.error ?? "Transfer failed");
        return;
      }
      toast.success(`Transfer initiated — ${json.transaction?.reference}`);
      setAmountInput("");
      setQuote(null);
      load();
    } finally {
      setSending(false);
    }
  }

  async function addBeneficiary() {
    if (!benForm.name.trim()) return toast.error("Enter beneficiary name");
    if (!benForm.country) return toast.error("Pick country");
    if (!benForm.bankName && !benForm.mobileWallet) return toast.error("Bank name or mobile wallet required");
    if (!benForm.accountNumber && !benForm.iban && !benForm.mobileWallet) {
      return toast.error("Account number / IBAN / mobile wallet required");
    }
    setSavingBen(true);
    try {
      const res = await fetch("/api/intl/beneficiaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(benForm),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? "Could not add beneficiary");
        return;
      }
      toast.success("International beneficiary saved");
      setAddOpen(false);
      setBenForm({
        name: "",
        country: "",
        bankName: "",
        accountNumber: "",
        iban: "",
        swiftCode: "",
        mobileWallet: "",
        currency: "USD",
      });
      load();
    } finally {
      setSavingBen(false);
    }
  }

  async function deleteBeneficiary(b: IntlBeneficiary) {
    const prev = beneficiaries;
    setBeneficiaries((arr) => arr.filter((x) => x.id !== b.id));
    try {
      const res = await fetch(`/api/intl/beneficiaries/${b.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Beneficiary removed");
    } catch {
      setBeneficiaries(prev);
      toast.error("Could not delete beneficiary");
    }
  }

  return (
    <div className="space-y-6 tp-fade-rise">
      <PageHeader
        title="International Transfers"
        subtitle="Send money across borders with live FX rates and transparent fees."
        actions={
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      <Tabs defaultValue="send" className="space-y-5">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="send" className="gap-1.5">
            <Send className="h-3.5 w-3.5" /> Send
          </TabsTrigger>
          <TabsTrigger value="beneficiaries" className="gap-1.5">
            <UserPlus className="h-3.5 w-3.5" /> Beneficiaries
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <Plane className="h-3.5 w-3.5" /> History
          </TabsTrigger>
        </TabsList>

        {/* SEND TAB */}
        <TabsContent value="send" className="space-y-5">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <p className="text-sm font-semibold">Send money abroad</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Choose your source wallet and destination currency.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>From (your wallet)</Label>
                  <Select value={sourceCurrency} onValueChange={(v) => { setSourceCurrency(v); setQuote(null); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Source" />
                    </SelectTrigger>
                    <SelectContent>
                      {wallets.map((w) => (
                        <SelectItem key={w.id} value={w.currency}>
                          <span className="mr-2">{w.flag}</span>
                          {w.currency} · {formatMoney(w.balanceMinor, w.currency)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>To (destination currency)</Label>
                  <Select value={targetCurrency} onValueChange={(v) => { setTargetCurrency(v); setQuote(null); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Target" />
                    </SelectTrigger>
                    <SelectContent>
                      {TARGET_CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          <span className="mr-2">{c.flag}</span>
                          {c.code} · {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <Label htmlFor="intl-amount">Amount ({sourceCurrency})</Label>
                <Input
                  id="intl-amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amountInput}
                  onChange={(e) => {
                    setAmountInput(e.target.value);
                    setQuote(null);
                  }}
                />
              </div>

              <div className="mt-4 space-y-2">
                <Label>Beneficiary</Label>
                <Select value={beneficiaryId} onValueChange={setBeneficiaryId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select beneficiary" />
                  </SelectTrigger>
                  <SelectContent>
                    {beneficiaries.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} · {b.country || "—"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {beneficiaries.length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    No international beneficiaries yet. Add one in the Beneficiaries tab.
                  </p>
                )}
              </div>

              <div className="mt-4 space-y-2">
                <Label>Purpose</Label>
                <Select value={purpose} onValueChange={setPurpose}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select purpose" />
                  </SelectTrigger>
                  <SelectContent>
                    {PURPOSES.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="secondary"
                className="mt-4 w-full gap-1.5"
                onClick={fetchQuote}
                disabled={quoting || !amountInput || !sourceCurrency || !targetCurrency}
              >
                {quoting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                Get quote
              </Button>

              {quote?.ok && quote.quote && (
                <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Provider</span>
                    <Badge variant="outline" className="text-[10px]">{quote.quote.provider}</Badge>
                  </div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Rate</span>
                    <span className="font-semibold tabular-nums">
                      1 {quote.quote.sourceCurrency} = {quote.quote.rate.toLocaleString("en-NG", { maximumFractionDigits: 4 })} {quote.quote.targetCurrency}
                    </span>
                  </div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Fee</span>
                    <span className="font-medium tabular-nums">
                      {formatMoney(quote.quote.feeMinor, quote.quote.sourceCurrency)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm">
                    <span className="text-muted-foreground">Recipient gets</span>
                    <span className="flex items-center gap-1 font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                      <ArrowRight className="h-3.5 w-3.5" />
                      {formatMoney(quote.quote.totalMinor, quote.quote.targetCurrency)}
                    </span>
                  </div>
                </div>
              )}
              {quote && !quote.ok && (
                <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-700 dark:text-amber-300">
                  <AlertCircle className="mb-1 inline h-3.5 w-3.5" /> {quote.error}
                </div>
              )}

              <Button
                className="mt-4 w-full gap-1.5"
                onClick={sendTransfer}
                disabled={!quote?.ok || sending || !beneficiaryId}
              >
                {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plane className="h-4 w-4" />}
                Send transfer
              </Button>
            </Card>

            <div className="space-y-4">
              <Card className="p-5">
                <p className="text-sm font-semibold">Source wallet balance</p>
                {loading ? (
                  <Skeleton className="mt-3 h-8 w-32" />
                ) : (
                  <p className="mt-2 text-2xl font-bold tabular-nums">
                    {(() => {
                      const w = wallets.find((x) => x.currency === sourceCurrency);
                      return w ? formatMoney(w.balanceMinor, w.currency) : "—";
                    })()}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Funds will be debited from this wallet.
                </p>
              </Card>
              <Card className="p-5">
                <p className="text-sm font-semibold">How it works</p>
                <ol className="mt-3 space-y-2 text-xs text-muted-foreground">
                  <li className="flex gap-2"><span className="font-bold text-emerald-600">1.</span> Pick source & destination currencies.</li>
                  <li className="flex gap-2"><span className="font-bold text-emerald-600">2.</span> Get a live FX quote with transparent fees.</li>
                  <li className="flex gap-2"><span className="font-bold text-emerald-600">3.</span> Confirm with your PIN.</li>
                  <li className="flex gap-2"><span className="font-bold text-emerald-600">4.</span> Track delivery in the History tab.</li>
                </ol>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* BENEFICIARIES TAB */}
        <TabsContent value="beneficiaries" className="space-y-5">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold">International beneficiaries</p>
              <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
              </div>
            ) : beneficiaries.length === 0 ? (
              <EmptyState
                icon={UserPlus}
                title="No international beneficiaries"
                description="Add a recipient abroad to start sending cross-border transfers."
                action={
                  <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
                    <Plus className="h-4 w-4" /> Add beneficiary
                  </Button>
                }
              />
            ) : (
              <div className="max-h-[60vh] space-y-2 overflow-y-auto scrollbar-thin pr-1">
                {beneficiaries.map((b) => (
                  <div
                    key={b.id}
                    className="group flex items-center gap-3 rounded-xl border border-transparent p-3 transition-colors hover:border-border hover:bg-muted/40"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      {b.mobileWallet ? <Smartphone className="h-4 w-4" /> : <Banknote className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{b.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {b.bankName}
                        {b.swiftCode && ` · SWIFT ${b.swiftCode}`}
                        {b.iban && ` · IBAN ${b.iban.slice(-4)}`}
                        {b.mobileWallet && ` · ${b.mobileWallet}`}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {b.country || "—"}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteBeneficiary(b)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history" className="space-y-5">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold">International transfer history</p>
              <Badge variant="secondary">{history.length} transfers</Badge>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
              </div>
            ) : history.length === 0 ? (
              <EmptyState
                icon={Plane}
                title="No international transfers yet"
                description="Your outbound cross-border transfers will appear here."
              />
            ) : (
              <div className="max-h-[60vh] space-y-2 overflow-y-auto scrollbar-thin pr-1">
                {history.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center gap-3 rounded-xl border border-transparent p-3 transition-colors hover:border-border hover:bg-muted/40"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                      <Plane className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {tx.counterpartyName ?? "International transfer"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {tx.reference} · {tx.counterpartyBank ?? "—"} · {timeAgo(tx.createdAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {naira(tx.amountKobo)}
                      </p>
                      <Badge
                        variant={tx.status === "SUCCESS" ? "secondary" : tx.status === "PENDING" ? "outline" : "destructive"}
                        className="text-[10px]"
                      >
                        {tx.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add beneficiary dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add international beneficiary</DialogTitle>
            <DialogDescription>
              Save a recipient abroad so you can send to them in seconds.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="b-name">Beneficiary name</Label>
              <Input
                id="b-name"
                placeholder="e.g. John Doe"
                value={benForm.name}
                onChange={(e) => setBenForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Country</Label>
                <Select value={benForm.country} onValueChange={(v) => setBenForm((f) => ({ ...f, country: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {BENEFICIARY_COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={benForm.currency} onValueChange={(v) => setBenForm((f) => ({ ...f, currency: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {TARGET_CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        <span className="mr-2">{c.flag}</span>{c.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-bank">Bank name</Label>
              <Input
                id="b-bank"
                placeholder="e.g. Barclays Bank UK"
                value={benForm.bankName}
                onChange={(e) => setBenForm((f) => ({ ...f, bankName: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="b-acc">Account number</Label>
                <Input
                  id="b-acc"
                  placeholder="1234567890"
                  value={benForm.accountNumber}
                  onChange={(e) => setBenForm((f) => ({ ...f, accountNumber: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-iban">IBAN (optional)</Label>
                <Input
                  id="b-iban"
                  placeholder="GB29 NWBK 6016..."
                  value={benForm.iban}
                  onChange={(e) => setBenForm((f) => ({ ...f, iban: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="b-swift">SWIFT/BIC (optional)</Label>
                <Input
                  id="b-swift"
                  placeholder="BARCGB22"
                  value={benForm.swiftCode}
                  onChange={(e) => setBenForm((f) => ({ ...f, swiftCode: e.target.value.toUpperCase() }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-mw">Mobile wallet (optional)</Label>
                <Input
                  id="b-mw"
                  placeholder="+44 7..."
                  value={benForm.mobileWallet}
                  onChange={(e) => setBenForm((f) => ({ ...f, mobileWallet: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addBeneficiary} disabled={savingBen} className="gap-1.5">
              {savingBen ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Save beneficiary
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
