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
  Compass,
  Calculator,
  Bell,
  TrendingUp,
  Clock,
  Check,
  CircleDot,
  Loader2,
} from "lucide-react";
import { formatMoney, naira, nairaCompact, parseKobo, timeAgo } from "@/lib/money";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";

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

  // Tracking dialog
  const [trackingTx, setTrackingTx] = React.useState<IntlTx | null>(null);

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

      {/* Tracking timeline dialog */}
      <TransferTrackingDialog tx={trackingTx} onClose={() => setTrackingTx(null)} />
    </div>
  );
}

/* ================================================================== */
/* Corridor explorer — supported cross-border corridors                */
/* ================================================================== */

interface Corridor {
  sourceCurrency: string;
  targetCurrency: string;
  rate: number;
  rateAgeHours: number | null;
  feeBps: number;
  feeFixedKobo: number;
  estimatedDeliveryHours: number;
  provider: "wise" | "flutterwave";
  minAmountKobo: number;
  maxAmountKobo: number;
  supportsBank: boolean;
  supportsMobileWallet: boolean;
  targetFlag: string;
  targetName: string;
}

function CorridorExplorer() {
  const [corridors, setCorridors] = React.useState<Corridor[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<Corridor | null>(null);
  const [recipientType, setRecipientType] = React.useState<"BANK" | "WALLET">("BANK");

  // Recipient-gets calculator
  const [calcNGN, setCalcNGN] = React.useState<number>(100_000_00); // ₦100,000

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/intl/corridors?base=NGN", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setCorridors(data.corridors ?? []);
        if (!selected && (data.corridors ?? []).length > 0) {
          setSelected(data.corridors[0]);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [selected]);

  React.useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Corridor grid */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Compass className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Supported corridors</h2>
          <span className="text-xs text-muted-foreground">Live rates from Wise & Flutterwave</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {corridors.map((c) => {
            const isSelected = selected?.targetCurrency === c.targetCurrency;
            return (
              <button
                key={c.targetCurrency}
                type="button"
                onClick={() => { setSelected(c); setRecipientType(c.supportsBank ? "BANK" : "WALLET"); }}
                className={`flex flex-col rounded-2xl border bg-card p-4 text-left transition-all ${
                  isSelected ? "ring-2 ring-primary" : "hover:border-primary/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{c.targetFlag}</span>
                    <div>
                      <p className="text-sm font-semibold">{c.sourceCurrency} → {c.targetCurrency}</p>
                      <p className="text-[10px] text-muted-foreground">{c.targetName}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[9px] capitalize">{c.provider}</Badge>
                </div>
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">1 NGN =</span>
                    <span className="font-semibold tabular-nums">
                      {c.rate.toLocaleString("en-NG", { maximumFractionDigits: 4 })} {c.targetCurrency}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Delivery</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {c.estimatedDeliveryHours < 24
                        ? `${c.estimatedDeliveryHours}h`
                        : `${Math.ceil(c.estimatedDeliveryHours / 24)}d`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Fee</span>
                    <span className="font-medium tabular-nums">
                      {(c.feeBps / 100).toFixed(2)}% + {nairaCompact(c.feeFixedKobo)}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1.5">
                  {c.supportsBank && (
                    <Badge variant="secondary" className="text-[9px] gap-1">
                      <Banknote className="h-2.5 w-2.5" /> Bank
                    </Badge>
                  )}
                  {c.supportsMobileWallet && (
                    <Badge variant="secondary" className="text-[9px] gap-1">
                      <Smartphone className="h-2.5 w-2.5" /> Wallet
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recipient-gets calculator */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-semibold">Recipient gets calculator</p>
            <p className="text-xs text-muted-foreground">
              See exactly what your recipient receives after FX spread and fees.
            </p>
          </div>
        </div>
        {selected ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>You send (NGN)</Label>
                  <span className="text-sm font-semibold text-primary tabular-nums">{naira(calcNGN)}</span>
                </div>
                <Slider
                  value={[calcNGN]}
                  min={selected.minAmountKobo}
                  max={Math.min(selected.maxAmountKobo, 10_000_000_00)}
                  step={1_000_00}
                  onValueChange={(v) => setCalcNGN(v[0] ?? selected.minAmountKobo)}
                />
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: "₦10K", v: 10_000_00 },
                    { label: "₦50K", v: 50_000_00 },
                    { label: "₦100K", v: 100_000_00 },
                    { label: "₦500K", v: 500_000_00 },
                  ].map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => setCalcNGN(chip.v)}
                      className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium hover:border-primary hover:bg-primary/5"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Delivery method</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!selected.supportsBank}
                    onClick={() => setRecipientType("BANK")}
                    className={`flex items-center gap-2 rounded-xl border p-2.5 text-xs font-medium transition-colors ${
                      recipientType === "BANK" && selected.supportsBank ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted/40"
                    } ${!selected.supportsBank ? "cursor-not-allowed opacity-40" : ""}`}
                  >
                    <Banknote className="h-4 w-4" /> Bank account
                  </button>
                  <button
                    type="button"
                    disabled={!selected.supportsMobileWallet}
                    onClick={() => setRecipientType("WALLET")}
                    className={`flex items-center gap-2 rounded-xl border p-2.5 text-xs font-medium transition-colors ${
                      recipientType === "WALLET" && selected.supportsMobileWallet ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted/40"
                    } ${!selected.supportsMobileWallet ? "cursor-not-allowed opacity-40" : ""}`}
                  >
                    <Smartphone className="h-4 w-4" /> Mobile wallet
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 rounded-xl bg-muted/40 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Min amount</span>
                  <span className="font-medium tabular-nums">{naira(selected.minAmountKobo)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Max amount</span>
                  <span className="font-medium tabular-nums">{naira(selected.maxAmountKobo)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Provider</span>
                  <span className="font-medium capitalize">{selected.provider}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Est. delivery</span>
                  <span className="font-medium">
                    {selected.estimatedDeliveryHours < 24
                      ? `${selected.estimatedDeliveryHours} hours`
                      : `${Math.ceil(selected.estimatedDeliveryHours / 24)} days`}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-center rounded-2xl bg-gradient-to-br from-emerald-500/10 to-amber-500/5 p-5">
              <p className="text-xs text-muted-foreground">
                Recipient gets ({selected.targetCurrency})
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {(() => {
                  const variableFee = Math.round((calcNGN * selected.feeBps) / 10_000);
                  const totalFee = variableFee + selected.feeFixedKobo;
                  const netNGN = Math.max(0, calcNGN - totalFee);
                  const recipientAmount = Math.round(netNGN * selected.rate);
                  // Convert kobo-of-NGN to "minor of target currency" for formatMoney:
                  // We treat the rate-multiplied value as the target's minor units (cents etc).
                  return formatMoney(recipientAmount, selected.targetCurrency);
                })()}
              </p>
              <div className="mt-4 space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">You send</span>
                  <span className="font-medium tabular-nums">{naira(calcNGN)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">FX rate</span>
                  <span className="font-medium tabular-nums">
                    1 NGN = {selected.rate.toLocaleString("en-NG", { maximumFractionDigits: 4 })} {selected.targetCurrency}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Variable fee</span>
                  <span className="font-medium tabular-nums">−{nairaCompact(Math.round((calcNGN * selected.feeBps) / 10_000))}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Fixed fee</span>
                  <span className="font-medium tabular-nums">−{nairaCompact(selected.feeFixedKobo)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t pt-2 text-xs">
                  <span className="text-muted-foreground">Delivery method</span>
                  <span className="font-medium">
                    {recipientType === "BANK" ? "🏦 Bank account" : "📱 Mobile wallet"}
                  </span>
                </div>
              </div>
              <p className="mt-4 text-[10px] text-muted-foreground">
                Final amount may vary slightly based on the live rate at the time of transfer.
              </p>
            </div>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Select a corridor above.</p>
        )}
      </Card>

      {/* Rate alert */}
      <RateAlertCard corridors={corridors} />
    </div>
  );
}

/* ================================================================== */
/* Rate alert — set a target USD/NGN rate, get notified when it hits    */
/* ================================================================== */

function RateAlertCard({ corridors }: { corridors: Corridor[] }) {
  const [targetCurrency, setTargetCurrency] = React.useState<string>(corridors[0]?.targetCurrency ?? "USD");
  const [targetRate, setTargetRate] = React.useState<string>("");
  const [alerts, setAlerts] = React.useState<
    { id: string; currency: string; targetRate: number; currentRate: number; createdAt: string; direction: "above" | "below" }[]
  >([]);

  React.useEffect(() => {
    if (!targetCurrency && corridors.length > 0) setTargetCurrency(corridors[0].targetCurrency);
  }, [corridors, targetCurrency]);

  const currentRate = corridors.find((c) => c.targetCurrency === targetCurrency)?.rate ?? 0;

  function createAlert() {
    const rate = parseFloat(targetRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      toast.error("Enter a valid target rate");
      return;
    }
    const direction: "above" | "below" = rate > currentRate ? "above" : "below";
    const newAlert = {
      id: `${Date.now()}`,
      currency: targetCurrency,
      targetRate: rate,
      currentRate,
      createdAt: new Date().toISOString(),
      direction,
    };
    setAlerts((prev) => [newAlert, ...prev]);
    setTargetRate("");
    toast.success(`Rate alert set — we'll notify you when 1 NGN ${direction} ${rate} ${targetCurrency}`);
  }

  function removeAlert(id: string) {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    toast.success("Rate alert removed");
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" />
        <div>
          <p className="text-sm font-semibold">Rate alerts</p>
          <p className="text-xs text-muted-foreground">
            Get notified when your target FX rate is reached.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-2">
          <Label>Currency pair</Label>
          <Select value={targetCurrency} onValueChange={setTargetCurrency}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {corridors.map((c) => (
                <SelectItem key={c.targetCurrency} value={c.targetCurrency}>
                  <span className="mr-1.5">{c.targetFlag}</span>
                  NGN → {c.targetCurrency} ({c.rate.toLocaleString("en-NG", { maximumFractionDigits: 4 })})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Target rate (1 NGN = ?)</Label>
          <Input
            inputMode="decimal"
            placeholder={currentRate > 0 ? currentRate.toFixed(4) : "0.0000"}
            value={targetRate}
            onChange={(e) => setTargetRate(e.target.value)}
          />
        </div>
        <Button onClick={createAlert} className="gap-1.5">
          <Plus className="h-4 w-4" /> Set alert
        </Button>
      </div>

      {alerts.length > 0 && (
        <div className="mt-4 space-y-2">
          {alerts.map((a) => {
            const wouldTrigger = a.direction === "above" ? a.currentRate >= a.targetRate : a.currentRate <= a.targetRate;
            return (
              <div key={a.id} className="flex items-center gap-3 rounded-xl border p-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  wouldTrigger ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                }`}>
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    Notify when 1 NGN <span className="font-bold">{a.direction}</span> {a.targetRate} {a.currency}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Current: {a.currentRate.toLocaleString("en-NG", { maximumFractionDigits: 4 })} ·{" "}
                    {wouldTrigger
                      ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">Triggered!</span>
                      : <span>Waiting ({timeAgo(a.createdAt)})</span>}
                  </p>
                </div>
                <button
                  onClick={() => removeAlert(a.id)}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                  aria-label="Remove alert"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ================================================================== */
/* Transfer tracking timeline dialog                                    */
/* ================================================================== */

const TRACKING_STAGES = [
  { key: "INITIATED", label: "Initiated", icon: CircleDot, description: "Transfer created" },
  { key: "PIN_VERIFIED", label: "PIN verified", icon: Check, description: "Authorization confirmed" },
  { key: "PROVIDER_CALLED", label: "Provider called", icon: Loader2, description: "FX provider notified" },
  { key: "IN_TRANSIT", label: "In transit", icon: Plane, description: "Funds moving across borders" },
  { key: "DELIVERED", label: "Delivered", icon: CheckCircle2, description: "Recipient paid" },
] as const;

function TransferTrackingDialog({ tx, onClose }: { tx: IntlTx | null; onClose: () => void }) {
  if (!tx) return null;

  // Determine the furthest stage reached based on status + state.
  function stageIndex(): number {
    if (tx.status === "SUCCESS") return 4; // DELIVERED
    if (tx.status === "FAILED") return 2; // stopped at PROVIDER_CALLED
    if (tx.state === "INITIATED") return 0;
    if (tx.state === "PIN_VERIFIED") return 1;
    if (tx.state === "SETTLED") return 4;
    return 1;
  }

  const currentIdx = stageIndex();
  const failed = tx.status === "FAILED";

  return (
    <Dialog open={!!tx} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plane className="h-4 w-4 text-primary" /> Transfer tracking
          </DialogTitle>
          <DialogDescription>
            Reference <span className="font-mono">{tx.reference}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-muted/40 p-2">
              <p className="text-muted-foreground">Amount</p>
              <p className="font-semibold tabular-nums">{naira(tx.amountKobo)}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-2">
              <p className="text-muted-foreground">Recipient</p>
              <p className="truncate font-medium">{tx.counterpartyName ?? "—"}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-2">
              <p className="text-muted-foreground">Bank / Wallet</p>
              <p className="truncate font-medium">{tx.counterpartyBank ?? "—"}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-2">
              <p className="text-muted-foreground">Provider</p>
              <p className="truncate font-medium capitalize">{tx.provider ?? "—"}</p>
            </div>
          </div>

          {/* Timeline */}
          <div className="rounded-xl border p-3">
            <p className="mb-3 text-xs font-semibold text-muted-foreground">Delivery timeline</p>
            <ol className="relative space-y-3">
              {TRACKING_STAGES.map((stage, idx) => {
                const Icon = stage.icon;
                const reached = idx <= currentIdx;
                const isFailed = failed && idx === currentIdx;
                const isCurrent = idx === currentIdx && !failed;
                return (
                  <li key={stage.key} className="flex items-start gap-3">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      isFailed
                        ? "bg-red-500/15 text-red-600 dark:text-red-400"
                        : reached
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      <Icon className={`h-3.5 w-3.5 ${isCurrent ? "animate-pulse" : ""}`} />
                    </div>
                    <div className="flex-1 pt-0.5">
                      <p className={`text-xs font-medium ${reached ? "" : "text-muted-foreground"}`}>
                        {stage.label}
                        {isCurrent && !failed && (
                          <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                            <Clock className="h-2.5 w-2.5" /> in progress
                          </span>
                        )}
                        {isFailed && (
                          <span className="ml-1.5 text-[10px] text-red-600 dark:text-red-400 font-semibold">failed</span>
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{stage.description}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Initiated {timeAgo(tx.createdAt)}</span>
            <Badge
              variant={tx.status === "SUCCESS" ? "secondary" : tx.status === "PENDING" ? "outline" : "destructive"}
              className="text-[10px]"
            >
              {tx.status}
            </Badge>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="gap-1.5">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
