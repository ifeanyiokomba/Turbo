"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader } from "../parts/layout";
import { usePin } from "../parts/pin-dialog";
import {
  Zap,
  Wifi,
  Tv,
  Droplets,
  GraduationCap,
  ShieldCheck,
  Landmark,
  Flame,
  Search,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Wallet as WalletIcon,
  ChevronRight,
  Check,
  Copy,
} from "lucide-react";
import { BILL_CATEGORIES } from "@/lib/constants";
import { BILLERS } from "@/lib/banks";
import { naira, parseKobo } from "@/lib/money";
import { toast } from "sonner";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Zap,
  Wifi,
  Tv,
  Droplets,
  GraduationCap,
  ShieldCheck,
  Landmark,
  Flame,
};

interface Biller {
  code: string;
  name: string;
  refLabel: string;
  refType: string;
}

interface CategoryWithBillers {
  id: string;
  name: string;
  icon: string;
  color: string;
  billers: Biller[];
}

interface WalletInfo {
  balanceKobo: number;
  currency: string;
  status: string;
}

interface BillSuccess {
  billerName: string;
  customerRef: string;
  amountKobo: number;
  reference: string;
  newBalance: number;
  token: string | null;
}

export default function BillsView() {
  const pin = usePin();
  const [wallet, setWallet] = React.useState<WalletInfo | null>(null);
  const [loadingWallet, setLoadingWallet] = React.useState(true);
  const [activeCategory, setActiveCategory] = React.useState<string | null>(null);
  const [activeBiller, setActiveBiller] = React.useState<Biller | null>(null);

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

  // Map BILL_CATEGORIES with billers from BILLERS
  const categories: CategoryWithBillers[] = React.useMemo(
    () =>
      BILL_CATEGORIES.map((c) => ({
        ...c,
        billers: BILLERS[c.id] ?? [],
      })),
    []
  );

  const category = activeCategory ? categories.find((c) => c.id === activeCategory) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pay Bills"
        subtitle="Electricity, internet, cable, water, education and more — settled instantly."
      />

      {/* Balance bar */}
      <Card className="tp-emerald-grad tp-sheen relative overflow-hidden p-5 text-white">
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

      {category ? (
        <BillerList
          category={category}
          onBack={() => setActiveCategory(null)}
          onPick={(b) => setActiveBiller(b)}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {categories.map((c) => {
            const Icon = ICONS[c.icon] ?? Zap;
            return (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c.id)}
                className="group border-border bg-card hover:border-primary/40 flex flex-col items-start gap-3 rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
              >
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ background: `${c.color}20`, color: c.color }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{c.name}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {c.billers.length} {c.billers.length === 1 ? "biller" : "billers"}
                  </p>
                </div>
                <ChevronRight className="text-muted-foreground ml-auto h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            );
          })}
        </div>
      )}

      {/* Payment dialog */}
      <BillPaymentDialog
        biller={activeBiller}
        category={category?.id ?? null}
        pin={pin}
        onClose={() => setActiveBiller(null)}
        onSuccess={(s) => {
          setWallet((w) => (w ? { ...w, balanceKobo: s.newBalance } : w));
        }}
      />
    </div>
  );
}

// ============== BILLER LIST ==============

function BillerList({
  category,
  onBack,
  onPick,
}: {
  category: CategoryWithBillers;
  onBack: () => void;
  onPick: (b: Biller) => void;
}) {
  const [query, setQuery] = React.useState("");
  const Icon = ICONS[category.icon] ?? Zap;

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return category.billers;
    return category.billers.filter((b) => b.name.toLowerCase().includes(q));
  }, [query, category.billers]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Categories
        </Button>
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: `${category.color}20`, color: category.color }}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">{category.name}</p>
            <p className="text-muted-foreground text-xs">{category.billers.length} billers</p>
          </div>
        </div>
      </div>

      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder={`Search ${category.name.toLowerCase()} billers…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="text-muted-foreground p-8 text-center text-sm">
          No billers match “{query}”.
        </Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map((b) => (
            <button
              key={b.code}
              onClick={() => onPick(b)}
              className="border-border bg-card hover:border-primary/40 hover:bg-muted/40 flex items-center gap-3 rounded-xl border p-3 text-left transition-all"
            >
              <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{b.name}</p>
                <p className="text-muted-foreground truncate text-xs">{b.refLabel}</p>
              </div>
              <ChevronRight className="text-muted-foreground h-4 w-4" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============== BILL PAYMENT DIALOG ==============

function BillPaymentDialog({
  biller,
  category,
  pin,
  onClose,
  onSuccess,
}: {
  biller: Biller | null;
  category: string | null;
  pin: ReturnType<typeof usePin>;
  onClose: () => void;
  onSuccess: (s: BillSuccess) => void;
}) {
  const [customerRef, setCustomerRef] = React.useState("");
  const [validated, setValidated] = React.useState(false);
  const [validating, setValidating] = React.useState(false);
  const [amountInput, setAmountInput] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [success, setSuccess] = React.useState<BillSuccess | null>(null);

  const open = !!biller;
  const amountKobo = parseKobo(amountInput);
  const isElectricity = category === "ELECTRICITY";

  // Reset state when biller changes
  React.useEffect(() => {
    if (biller) {
      setCustomerRef("");
      setValidated(false);
      setAmountInput("");
      setSuccess(null);
    }
  }, [biller]);

  function handleValidate() {
    if (!biller) return;
    if (customerRef.trim().length < 4) {
      return toast.error(`Enter a valid ${biller.refLabel.toLowerCase()}`);
    }
    setValidating(true);
    // Mock validation — simulate latency
    setTimeout(() => {
      setValidating(false);
      setValidated(true);
      toast.success("Customer verified");
    }, 700);
  }

  async function handlePay() {
    if (!biller || !category) return;
    if (!validated) return toast.error("Validate the customer reference first");
    if (amountKobo < 1_000) return toast.error("Minimum bill payment is ₦10");
    if (amountKobo > 5_000_000) return toast.error("Maximum bill payment is ₦50,000");

    const pinVal = await pin.request({
      title: "Confirm bill payment",
      description: `${biller.name} · ${naira(amountKobo)}`,
    });
    if (!pinVal) return toast.error("PIN required to continue");

    setSubmitting(true);
    try {
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          billerCode: biller.code,
          billerName: biller.name,
          customerRef,
          amountKobo,
          pin: pinVal,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Payment failed");

      const s: BillSuccess = {
        billerName: biller.name,
        customerRef,
        amountKobo,
        reference: data.transaction.reference,
        newBalance: data.newBalance,
        token: data.billPayment?.token ?? null,
      };
      setSuccess(s);
      onSuccess(s);
      toast.success("Bill payment successful");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose(open: boolean) {
    if (!open) {
      // allow close after success
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        {biller && (
          <>
            {success ? (
              <BillSuccessContent
                success={success}
                isElectricity={isElectricity}
                onClose={onClose}
              />
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <div className="bg-primary/10 text-primary flex h-8 w-8 items-center justify-center rounded-lg">
                      {(() => {
                        const cat = BILL_CATEGORIES.find((c) => c.id === category);
                        const Icon = cat ? (ICONS[cat.icon] ?? Zap) : Zap;
                        return <Icon className="h-4 w-4" />;
                      })()}
                    </div>
                    {biller.name}
                  </DialogTitle>
                  <DialogDescription>
                    Enter your {biller.refLabel.toLowerCase()} and amount to pay.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  {/* Customer reference */}
                  <div className="space-y-2">
                    <Label htmlFor="bill-ref">{biller.refLabel}</Label>
                    <div className="flex gap-2">
                      <Input
                        id="bill-ref"
                        placeholder={`Enter ${biller.refLabel.toLowerCase()}`}
                        value={customerRef}
                        onChange={(e) => {
                          setCustomerRef(e.target.value);
                          setValidated(false);
                        }}
                        disabled={validated}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="gap-1.5"
                        onClick={handleValidate}
                        disabled={validated || validating || customerRef.trim().length < 4}
                      >
                        {validating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : validated ? (
                          <Check className="h-4 w-4 text-emerald-500" />
                        ) : null}
                        {validated ? "Valid" : "Validate"}
                      </Button>
                    </div>
                    {validated && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        ✓ Customer reference verified
                      </p>
                    )}
                  </div>

                  {/* Amount */}
                  <div className="space-y-2">
                    <Label htmlFor="bill-amount">Amount</Label>
                    <div className="relative">
                      <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-semibold">
                        ₦
                      </span>
                      <Input
                        id="bill-amount"
                        inputMode="numeric"
                        placeholder="0.00"
                        value={amountInput}
                        onChange={(e) => setAmountInput(e.target.value.replace(/[^\d.]/g, ""))}
                        className="pl-8"
                      />
                    </div>
                    {isElectricity && (
                      <p className="text-muted-foreground text-xs">
                        A 20-digit electricity token will be generated after payment.
                      </p>
                    )}
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handlePay}
                    disabled={!validated || amountKobo < 1_000 || submitting}
                    className="gap-1.5"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Pay {amountKobo > 0 ? naira(amountKobo) : ""}
                  </Button>
                </DialogFooter>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============== BILL SUCCESS CONTENT ==============

function BillSuccessContent({
  success,
  isElectricity,
  onClose,
}: {
  success: BillSuccess;
  isElectricity: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  function copyToken() {
    if (!success.token) return;
    navigator.clipboard.writeText(success.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("Token copied");
  }

  return (
    <div className="space-y-4">
      <DialogHeader>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <DialogTitle className="text-center">Payment successful</DialogTitle>
        <DialogDescription className="text-center">
          {success.billerName} · {success.customerRef}
        </DialogDescription>
      </DialogHeader>

      <p className="text-center text-2xl font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
        {naira(success.amountKobo)}
      </p>

      {isElectricity && success.token && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
            Electricity Token
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <code className="font-mono text-sm font-semibold tracking-wider">{success.token}</code>
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2" onClick={copyToken}>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      )}

      <div className="bg-muted/40 space-y-2 rounded-lg p-3 text-sm">
        <Row label="Reference" value={success.reference} mono />
        <Row label="New balance" value={naira(success.newBalance)} />
      </div>

      <Button className="w-full" onClick={onClose}>
        Done
      </Button>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
