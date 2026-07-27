"use client";

import * as React from "react";
import { useApp } from "../store";
import { usePin } from "../parts/pin-dialog";
import { PageHeader, EmptyState } from "../parts/layout";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { FeatureGate } from "../parts/feature-gate";
import {
  Plus,
  RefreshCw,
  CreditCard,
  Eye,
  EyeOff,
  Snowflake,
  Sun,
  Ban,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  MoreHorizontal,
  ShieldAlert,
  Check,
  Copy,
  Lock,
} from "lucide-react";
import { naira, parseKobo, timeAgo } from "@/lib/money";
import { toast } from "sonner";

interface CardTx {
  id: string;
  type: string;
  amountKobo: number;
  description: string;
  status: string;
  reference: string;
  createdAt: string;
}

interface VCard {
  id: string;
  panMasked: string;
  last4: string;
  expiry: string;
  cardholder: string;
  brand: string;
  balanceKobo: number;
  status: string;
  spendingLimitKobo: number;
  createdAt: string;
  updatedAt: string;
  transactionsCount: number;
  recentTransactions: CardTx[];
}

interface CardsData {
  cards: VCard[];
}

const QUICK_AMOUNTS = [
  { label: "₦1K", kobo: 100_000 },
  { label: "₦5K", kobo: 500_000 },
  { label: "₦10K", kobo: 1_000_000 },
  { label: "₦25K", kobo: 2_500_000 },
];

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  FROZEN: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  TERMINATED: "bg-red-500/15 text-red-600 dark:text-red-400",
};

/* ------------------------------------------------------------------ */
/* Card visual — premium realistic styling with 3D flip + holographic */
/* ------------------------------------------------------------------ */

type CardVariant = "VISA" | "MASTERCARD" | "TURBOPAY";

function pickVariant(card: VCard): CardVariant {
  // Emerald "TURBOPAY" variant for ~1 in 5 cards (last digit of last4 is 7)
  const last = parseInt(card.last4?.slice(-1) ?? "0", 10);
  if (last === 7) return "TURBOPAY";
  if (card.brand === "MASTERCARD") return "MASTERCARD";
  return "VISA";
}

function CardGradient({ variant }: { variant: CardVariant }) {
  if (variant === "MASTERCARD") {
    return "bg-gradient-to-br from-amber-500 via-amber-600 to-orange-700";
  }
  if (variant === "TURBOPAY") {
    return "tp-wallet-card";
  }
  return "bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900";
}

function BrandLogo({ variant }: { variant: CardVariant }) {
  if (variant === "MASTERCARD") {
    return (
      <div className="relative flex h-7 w-12 items-center justify-center">
        <span className="absolute left-1 h-6 w-6 rounded-full bg-red-500/90" />
        <span className="absolute right-1 h-6 w-6 rounded-full bg-amber-400/90 mix-blend-screen" />
      </div>
    );
  }
  if (variant === "TURBOPAY") {
    return (
      <span className="rounded-md bg-white/95 px-2 py-0.5 text-sm font-bold tracking-[0.18em] text-emerald-700 shadow-sm">
        TURBOPAY
      </span>
    );
  }
  return (
    <span className="rounded-md bg-white/95 px-2 py-0.5 text-sm font-bold tracking-[0.18em] text-slate-900 italic shadow-sm">
      VISA
    </span>
  );
}

/* NFC contactless wifi-wave icon (3 nested bars) */
function NfcIcon({ className = "" }: { className?: string }) {
  return (
    <span className={`tp-nfc-wave ${className}`} aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}

/* Realistic card chip — gold gradient with chip lines */
function CardChip() {
  return (
    <div className="relative h-7 w-10 overflow-hidden rounded-md bg-gradient-to-br from-amber-200 via-amber-300 to-amber-500 shadow-inner ring-1 ring-amber-700/30">
      <div className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-amber-700/40" />
      <div className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-amber-700/40" />
      <div className="absolute top-1 left-1 h-1.5 w-2 rounded-sm border border-amber-700/40" />
      <div className="absolute right-1 bottom-1 h-1.5 w-2 rounded-sm border border-amber-700/40" />
      <div className="absolute top-1/2 left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-amber-700/30" />
    </div>
  );
}

function CardFaceFront({ card, variant }: { card: VCard; variant: CardVariant }) {
  return (
    <div
      className={`tp-card-face ${CardGradient({ variant })} relative flex aspect-[1.586/1] w-full flex-col justify-between overflow-hidden rounded-2xl p-5 text-white shadow-xl ring-1 ring-white/10`}
    >
      {/* sheen + radial highlight */}
      <div className="pointer-events-none absolute -top-1/2 -left-1/4 h-[200%] w-1/2 rotate-12 bg-white/5 blur-2xl" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_55%)]" />

      {/* status pill */}
      <div className="absolute top-3 right-3 z-10">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase backdrop-blur ${
            card.status === "ACTIVE"
              ? "bg-emerald-400/30 text-emerald-50"
              : card.status === "FROZEN"
                ? "bg-amber-400/30 text-amber-50"
                : "bg-red-400/30 text-red-50"
          }`}
        >
          {card.status}
        </span>
      </div>

      {/* Top row: brand text + NFC + brand logo */}
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[10px] tracking-[0.25em] uppercase opacity-70">TURBOPAY</p>
          <p className="mt-0.5 text-xs font-medium opacity-90">Virtual Card</p>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <NfcIcon className="opacity-80" />
          <BrandLogo variant={variant} />
        </div>
      </div>

      {/* Chip + PAN */}
      <div className="relative">
        <CardChip />
        <p className="mt-3 font-mono text-base tracking-[0.18em] drop-shadow-sm sm:text-lg">
          {card.panMasked}
        </p>
      </div>

      {/* Bottom row: cardholder + expiry */}
      <div className="relative flex items-end justify-between">
        <div className="min-w-0">
          <p className="text-[9px] tracking-widest uppercase opacity-70">Cardholder</p>
          <p className="truncate text-xs font-semibold tracking-wide uppercase">
            {card.cardholder}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] tracking-widest uppercase opacity-70">Expires</p>
          <p className="font-mono text-xs">{card.expiry}</p>
        </div>
      </div>
    </div>
  );
}

function CardFaceBack({ card, variant }: { card: VCard; variant: CardVariant }) {
  // CVV derived deterministically from last4 (3 digits)
  const cvv = String(((parseInt(card.last4 || "0000", 10) * 7) % 900) + 100);
  return (
    <div
      className={`tp-card-face tp-card-face--back ${CardGradient({ variant })} relative flex aspect-[1.586/1] w-full flex-col overflow-hidden rounded-2xl text-white shadow-xl ring-1 ring-white/10`}
    >
      {/* Magnetic strip */}
      <div className="mt-5 h-10 w-full bg-black/85" />

      {/* Signature + CVV row */}
      <div className="mt-5 px-5">
        <div className="flex items-stretch gap-2">
          <div className="relative h-8 flex-1 overflow-hidden rounded-sm bg-white/95">
            <div
              className="absolute inset-0 opacity-60"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(135deg, oklch(0.85 0.05 80) 0 6px, white 6px 12px)",
              }}
            />
            <p className="absolute inset-y-0 right-2 flex items-center font-mono text-[10px] tracking-wider text-slate-800">
              {card.cardholder.slice(0, 18).toUpperCase()}
            </p>
          </div>
          <div className="flex h-8 w-14 flex-col items-center justify-center rounded-sm bg-white/95">
            <p className="text-[7px] font-semibold tracking-wide text-slate-500 uppercase">CVV</p>
            <p className="font-mono text-xs font-bold text-slate-900">{cvv}</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto flex items-end justify-between px-5 pb-5">
        <div>
          <p className="text-[9px] tracking-widest uppercase opacity-70">Authorised signature</p>
          <p className="text-[10px] opacity-70">Not valid unless signed</p>
        </div>
        <p className="text-[10px] font-medium tracking-[0.2em] uppercase opacity-80">
          TURBOPAY MFB
        </p>
      </div>

      {/* radial highlight */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.10),transparent_55%)]" />
    </div>
  );
}

function CardVisual({ card, onClick }: { card: VCard; onClick?: () => void }) {
  const [flipped, setFlipped] = React.useState(false);
  const variant = pickVariant(card);
  const usage = card.spendingLimitKobo > 0 ? (card.balanceKobo / card.spendingLimitKobo) * 100 : 0;

  return (
    <div className="block w-full text-left">
      <div
        className="tp-card-scene cursor-pointer select-none"
        onClick={() => {
          setFlipped((f) => !f);
          onClick?.();
        }}
        role="button"
        tabIndex={0}
        aria-label={`Card •••• ${card.last4} — click to flip`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setFlipped((f) => !f);
          }
        }}
      >
        <div className="tp-card-flipper tp-holo" data-flipped={flipped}>
          <CardFaceFront card={card} variant={variant} />
          <CardFaceBack card={card} variant={variant} />
        </div>
      </div>

      {/* balance / limit row */}
      <div className="mt-3 px-1">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">Card balance</span>
          <span className="text-sm font-bold tabular-nums">{naira(card.balanceKobo)}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <Progress value={usage} className="h-1.5" />
          <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
            {usage.toFixed(0)}%
          </span>
        </div>
        <p className="text-muted-foreground mt-1 text-[10px]">
          Limit {naira(card.spendingLimitKobo)} · {card.transactionsCount} txn
          {card.transactionsCount === 1 ? "" : "s"} ·{" "}
          <span className="text-primary/80">Click card to flip</span>
        </p>
      </div>
    </div>
  );
}

export default function CardsView() {
  const { user, setView } = useApp();
  const pin = usePin();
  const [data, setData] = React.useState<CardsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  // create dialog
  const [createOpen, setCreateOpen] = React.useState(false);
  const [cardholder, setCardholder] = React.useState(user?.fullName ?? "");
  const [creating, setCreating] = React.useState(false);

  // generic amount dialog (fund/withdraw)
  const [amountOpen, setAmountOpen] = React.useState(false);
  const [amountMode, setAmountMode] = React.useState<"FUND" | "WITHDRAW">("FUND");
  const [activeCard, setActiveCard] = React.useState<VCard | null>(null);
  const [amountInput, setAmountInput] = React.useState("");
  const amountKobo = parseKobo(amountInput);

  // reveal dialog
  const [revealOpen, setRevealOpen] = React.useState(false);
  const [revealData, setRevealData] = React.useState<{
    pan: string;
    cvv: string;
    expiry: string;
    cardholder: string;
    brand: string;
  } | null>(null);
  const [revealCountdown, setRevealCountdown] = React.useState(30);
  const [revealCopied, setRevealCopied] = React.useState<string | null>(null);

  // transactions dialog
  const [txOpen, setTxOpen] = React.useState(false);
  const [txCard, setTxCard] = React.useState<VCard | null>(null);

  // terminate confirm
  const [terminateOpen, setTerminateOpen] = React.useState(false);
  const [terminateCard, setTerminateCard] = React.useState<VCard | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cards", { cache: "no-store" });
      if (res.ok) setData(await res.json());
      else if (res.status === 401) toast.error("Session expired. Please log in again.");
      else toast.error("Failed to load cards.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (user?.fullName) setCardholder(user.fullName);
  }, [user?.fullName]);

  // reveal countdown
  React.useEffect(() => {
    if (!revealOpen) return;
    setRevealCountdown(30);
    const t = setInterval(() => {
      setRevealCountdown((c) => {
        if (c <= 1) {
          clearInterval(t);
          setRevealOpen(false);
          setRevealData(null);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [revealOpen]);

  async function createCard() {
    if (cardholder.trim().length < 2) {
      toast.error("Enter a valid cardholder name");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardholder: cardholder.trim() }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j?.error ?? "Failed to create card");
        return;
      }
      toast.success("Virtual card created");
      setCreateOpen(false);
      setCardholder(user?.fullName ?? "");
      load();
    } finally {
      setCreating(false);
    }
  }

  function openAmount(card: VCard, mode: "FUND" | "WITHDRAW") {
    if (card.status === "TERMINATED") {
      toast.error("Card is terminated");
      return;
    }
    if (card.status === "FROZEN") {
      toast.error(`Unfreeze the card to ${mode.toLowerCase()}`);
      return;
    }
    setActiveCard(card);
    setAmountMode(mode);
    setAmountInput("");
    setAmountOpen(true);
  }

  async function submitAmount() {
    if (!activeCard) return;
    if (amountKobo <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const pinVal = await pin.request({
      title: amountMode === "FUND" ? "Fund card" : "Withdraw from card",
      description: `${naira(amountKobo)} · Card •••• ${activeCard.last4}`,
    });
    if (!pinVal) return;

    setBusy(true);
    try {
      const endpoint =
        amountMode === "FUND"
          ? `/api/cards/${activeCard.id}/fund`
          : `/api/cards/${activeCard.id}/withdraw`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountKobo, pin: pinVal }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j?.error ?? "Transaction failed");
        return;
      }
      toast.success(
        amountMode === "FUND"
          ? `Card funded with ${naira(amountKobo)}`
          : `${naira(amountKobo)} withdrawn to wallet`
      );
      setAmountOpen(false);
      setAmountInput("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleFreeze(card: VCard) {
    if (card.status === "TERMINATED") return;
    const action = card.status === "FROZEN" ? "unfreeze" : "freeze";
    setBusy(true);
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j?.error ?? "Action failed");
        return;
      }
      toast.success(action === "freeze" ? "Card frozen" : "Card reactivated");
      load();
    } finally {
      setBusy(false);
    }
  }

  function promptTerminate(card: VCard) {
    setTerminateCard(card);
    setTerminateOpen(true);
  }

  async function doTerminate() {
    if (!terminateCard) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/cards/${terminateCard.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "terminate" }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j?.error ?? "Termination failed");
        return;
      }
      toast.success("Card terminated");
      setTerminateOpen(false);
      setTerminateCard(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function reveal(card: VCard) {
    if (card.status === "TERMINATED") {
      toast.error("Card is terminated");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/cards/${card.id}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j?.error ?? "Reveal failed");
        return;
      }
      setRevealData(j);
      setRevealOpen(true);
    } finally {
      setBusy(false);
    }
  }

  function showTransactions(card: VCard) {
    setTxCard(card);
    setTxOpen(true);
  }

  function copyReveal(field: string, value: string) {
    navigator.clipboard.writeText(value);
    setRevealCopied(field);
    toast.success(`${field} copied`);
    setTimeout(() => setRevealCopied(null), 1500);
  }

  const cards = data?.cards ?? [];

  return (
    <div className="tp-fade-rise space-y-6">
      <PageHeader
        title="Virtual Cards"
        subtitle="Spend anywhere Visa or Mastercard is accepted."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={loading}
              className="gap-1.5"
            >
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh
            </Button>
            <FeatureGate
              requiredTier={2}
              feature="Virtual cards"
              compact
              fallback={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setView("kyc")}
                  className="gap-1.5 border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400"
                >
                  <Lock className="h-4 w-4" /> Upgrade to create
                </Button>
              }
            >
              <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
                <Plus className="h-4 w-4" /> Create card
              </Button>
            </FeatureGate>
          </>
        }
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-[1.586/1] w-full rounded-2xl" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <FeatureGate
          requiredTier={2}
          feature="Virtual cards"
          description="Verify your NIN (KYC Tier 2) to issue virtual cards you can spend anywhere Visa or Mastercard is accepted."
        >
          <EmptyState
            icon={CreditCard}
            title="No virtual cards yet"
            description="Create a card to spend online or in-store. Cards are issued instantly."
            action={
              <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
                <Plus className="h-4 w-4" /> Create your first card
              </Button>
            }
          />
        </FeatureGate>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <div key={c.id} className="space-y-2">
              <CardVisual card={c} onClick={() => {}} />
              <div className="flex items-center justify-between gap-2 px-1">
                <Badge variant="outline" className={`gap-1 ${STATUS_TONE[c.status] ?? ""}`}>
                  {c.status}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-1" disabled={busy}>
                      <MoreHorizontal className="h-4 w-4" /> Actions
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => openAmount(c, "FUND")}>
                      <ArrowDownToLine className="mr-2 h-4 w-4 text-emerald-600" /> Fund card
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openAmount(c, "WITHDRAW")}>
                      <ArrowUpFromLine className="mr-2 h-4 w-4 text-amber-600" /> Withdraw
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => reveal(c)}>
                      <Eye className="mr-2 h-4 w-4" /> Reveal details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => showTransactions(c)}>
                      <History className="mr-2 h-4 w-4" /> Transactions
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => toggleFreeze(c)}>
                      {c.status === "FROZEN" ? (
                        <>
                          <Sun className="mr-2 h-4 w-4 text-amber-600" /> Unfreeze
                        </>
                      ) : (
                        <>
                          <Snowflake className="mr-2 h-4 w-4 text-sky-600" /> Freeze
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-600 focus:text-red-700"
                      onClick={() => promptTerminate(c)}
                      disabled={c.status === "TERMINATED"}
                    >
                      <Ban className="mr-2 h-4 w-4" /> Terminate
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create card dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create a virtual card</DialogTitle>
            <DialogDescription>
              Instant issuance. Card number is encrypted at rest. Default limit is ₦5,000 — fund the
              card from your wallet to spend.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-2">
              <Label htmlFor="cardholder">Cardholder name</Label>
              <Input
                id="cardholder"
                value={cardholder}
                onChange={(e) => setCardholder(e.target.value)}
                placeholder="JOHN DOE"
                className="uppercase"
                maxLength={40}
              />
            </div>
            <div className="bg-muted/40 text-muted-foreground rounded-xl border p-3 text-xs">
              <p className="text-foreground font-medium">Heads up</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>A 16-digit PAN, CVV and expiry will be generated.</li>
                <li>Brand (Visa / Mastercard) is selected automatically.</li>
                <li>You can reveal the full PAN any time — every reveal is audited.</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createCard} disabled={creating} className="gap-1.5">
              {creating ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fund / Withdraw dialog */}
      <Dialog open={amountOpen} onOpenChange={(o) => !busy && setAmountOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{amountMode === "FUND" ? "Fund card" : "Withdraw from card"}</DialogTitle>
            <DialogDescription>
              {amountMode === "FUND"
                ? `Move money from your wallet to card •••• ${activeCard?.last4 ?? ""}.`
                : `Move money from card •••• ${activeCard?.last4 ?? ""} back to your wallet.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-2">
              <Label htmlFor="amt">Amount (₦)</Label>
              <Input
                id="amt"
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
                    className="border-border bg-background hover:border-primary hover:bg-primary/5 rounded-full border px-2.5 py-1 text-xs font-medium"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
            {amountKobo > 0 && (
              <div className="bg-muted/40 rounded-xl border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {amountMode === "FUND" ? "Card balance after" : "Card balance after"}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {naira(
                      (activeCard?.balanceKobo ?? 0) +
                        (amountMode === "FUND" ? amountKobo : -amountKobo)
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAmountOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitAmount} disabled={busy || amountKobo <= 0} className="gap-1.5">
              {busy ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reveal dialog */}
      <Dialog open={revealOpen} onOpenChange={(o) => !busy && setRevealOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Card details</DialogTitle>
            <DialogDescription>
              For your security, these details auto-hide in {revealCountdown}s. Never share them.
            </DialogDescription>
          </DialogHeader>
          {revealData && (
            <div className="space-y-3 py-1">
              <div className="rounded-2xl bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 p-4 text-white">
                <div className="flex items-start justify-between">
                  <p className="text-[10px] tracking-widest uppercase opacity-70">
                    {revealData.brand}
                  </p>
                  <BrandLogo variant={revealData.brand === "MASTERCARD" ? "MASTERCARD" : "VISA"} />
                </div>
                <p className="mt-4 font-mono text-lg tracking-wider">{revealData.pan}</p>
                <div className="mt-3 flex justify-between text-xs">
                  <div>
                    <p className="text-[9px] uppercase opacity-70">Cardholder</p>
                    <p className="font-medium uppercase">{revealData.cardholder}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] uppercase opacity-70">EXP / CVV</p>
                    <p className="font-mono">
                      {revealData.expiry} · {revealData.cvv}
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => copyReveal("PAN", revealData.pan)}
                >
                  {revealCopied === "PAN" ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  Copy PAN
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => copyReveal("CVV", revealData.cvv)}
                >
                  {revealCopied === "CVV" ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  Copy CVV
                </Button>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>This reveal has been recorded in your audit log.</span>
              </div>
              <Progress value={(revealCountdown / 30) * 100} className="h-1" />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevealOpen(false)} className="gap-1.5">
              <EyeOff className="h-4 w-4" /> Hide now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transactions dialog */}
      <Dialog open={txOpen} onOpenChange={setTxOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Card transactions</DialogTitle>
            <DialogDescription>
              Card •••• {txCard?.last4 ?? ""} · last {txCard?.recentTransactions.length ?? 0}{" "}
              transactions.
            </DialogDescription>
          </DialogHeader>
          <div className="scrollbar-thin max-h-96 overflow-y-auto">
            {txCard && txCard.recentTransactions.length > 0 ? (
              <div className="space-y-1">
                {txCard.recentTransactions.map((t) => {
                  const isCredit = t.type === "FUND";
                  return (
                    <div
                      key={t.id}
                      className="hover:bg-muted/60 flex items-center gap-3 rounded-xl px-2 py-2.5"
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          isCredit
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {isCredit ? (
                          <ArrowDownToLine className="h-4 w-4" />
                        ) : (
                          <ArrowUpFromLine className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.description || t.type}</p>
                        <p className="text-muted-foreground truncate text-xs">
                          {t.type} · {timeAgo(t.createdAt)}
                        </p>
                      </div>
                      <p
                        className={`text-sm font-semibold tabular-nums ${
                          isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                        }`}
                      >
                        {isCredit ? "+" : "−"}
                        {naira(t.amountKobo)}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-muted-foreground py-10 text-center text-sm">
                No transactions yet.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Terminate confirm */}
      <AlertDialog open={terminateOpen} onOpenChange={(o) => !busy && setTerminateOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminate card •••• {terminateCard?.last4 ?? ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The card will be permanently disabled. Any remaining
              balance should be withdrawn first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={doTerminate}
              disabled={busy}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Terminate card
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
