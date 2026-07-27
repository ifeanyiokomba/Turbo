"use client";

import * as React from "react";
import { useApp } from "../store";
import { PageHeader, EmptyState } from "../parts/layout";
import { AddressPill } from "../parts/address-pill";
import { usePin } from "../parts/pin-dialog";
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
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Zap,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { naira, timeAgo, parseKobo } from "@/lib/money";
import {
  TREASURY_ADDRESS,
  truncateAddress,
  getExplorerUrl,
  CELO_MAINNET_CHAIN_ID,
  MINIPAY_DEEPLINKS,
} from "@/lib/minipay";
import { toast } from "sonner";

// ---------- Types ----------
interface PriceData {
  token: string;
  usdNgnRate: number;
  source: string;
  updatedAt: string;
  ageMs: number;
}

interface BridgeEvent {
  id: string;
  direction: string; // NGN_TO_CUSD | CUSD_TO_NGN
  status: string; // PENDING | COMPLETED | REVERSED
  amountKobo: number;
  amountUsdm: string;
  fxRate: number;
  onchainTxId: string;
  createdAt: string;
  completedAt: string | null;
}

// ---------- Skeletons ----------
function BridgeCardSkeleton() {
  return (
    <Card aria-hidden className="tp-sheen relative overflow-hidden p-5">
      <div className="tp-shimmer h-4 w-32 rounded-full" />
      <div className="tp-shimmer mt-3 h-3 w-48 rounded-full opacity-80" />
      <div className="tp-shimmer mt-4 h-9 w-full rounded-md" />
      <div className="tp-shimmer mt-3 h-9 w-full rounded-md opacity-80" />
    </Card>
  );
}

// ---------- Sub-components ----------
function RateDisplay({ price }: { price: PriceData | null }) {
  const rate = price?.usdNgnRate ?? 1580;
  const ageMin = price ? Math.max(0, Math.round(price.ageMs / 60000)) : null;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs">Live rate</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums">
            1 USDm = ₦{rate.toLocaleString("en-NG", { maximumFractionDigits: 2 })}
          </p>
        </div>
        <Badge variant="secondary" className="gap-1 text-[10px]">
          <RefreshCw className="h-2.5 w-2.5" />
          {ageMin != null ? `${ageMin}m ago` : "—"}
        </Badge>
      </div>
      <p className="text-muted-foreground mt-2 text-[10px]">
        Source: {price?.source ?? "fallback"} · Updated {price ? timeAgo(price.updatedAt) : "—"}
      </p>
    </Card>
  );
}

function BridgeEventRow({ ev }: { ev: BridgeEvent }) {
  const isCredit = ev.direction === "CUSD_TO_NGN"; // incoming cUSD → NGN credit
  const Icon = isCredit ? ArrowDownLeft : ArrowUpRight;
  const tone = isCredit
    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
    : "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  const statusTone =
    ev.status === "COMPLETED"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : ev.status === "PENDING"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : "bg-red-500/15 text-red-600 dark:text-red-400";
  return (
    <div className="hover:bg-muted/60 flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone}`}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {isCredit ? "Deposit cUSD → NGN" : "Withdraw NGN → cUSD"}
        </p>
        <p className="text-muted-foreground truncate text-xs">
          {Number(ev.amountUsdm).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDm ·{" "}
          {timeAgo(ev.createdAt)}
        </p>
      </div>
      <div className="text-right">
        <p
          className={`text-sm font-semibold tabular-nums ${isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}
        >
          {isCredit ? "+" : "−"}
          {naira(ev.amountKobo)}
        </p>
        <span
          className={`mt-0.5 inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${statusTone}`}
        >
          {ev.status}
        </span>
      </div>
    </div>
  );
}

// ---------- Main view ----------
export default function CeloBridgeView() {
  const { celoAddress, setView } = useApp();
  const pin = usePin();

  const [price, setPrice] = React.useState<PriceData | null>(null);
  const [events, setEvents] = React.useState<BridgeEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  // Deposit flow state
  const [depositAmount, setDepositAmount] = React.useState("");
  const [depositRef, setDepositRef] = React.useState<string | null>(null);
  const [depositTxHash, setDepositTxHash] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);
  const [depositCopied, setDepositCopied] = React.useState(false);

  // Withdraw flow state
  const [withdrawInput, setWithdrawInput] = React.useState("");
  const [withdrawMode, setWithdrawMode] = React.useState<"NGN" | "USDm">("NGN");
  const [withdrawing, setWithdrawing] = React.useState(false);

  const usdNgnRate = price?.usdNgnRate ?? 1580;

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, eRes] = await Promise.all([
        fetch(`/api/celo/price?token=USDm`, { cache: "no-store" }),
        fetch(`/api/celo/bridge-events?limit=5`, { cache: "no-store" }),
      ]);
      if (pRes.ok) setPrice(await pRes.json());
      if (eRes.ok) {
        const j = await eRes.json();
        setEvents(j.events ?? []);
      }
    } catch {
      toast.error("Couldn't load bridge data");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
      toast.success("Bridge data refreshed");
    } finally {
      setRefreshing(false);
    }
  }

  function copyTreasury() {
    navigator.clipboard.writeText(TREASURY_ADDRESS);
    setDepositCopied(true);
    toast.success("Treasury address copied");
    setTimeout(() => setDepositCopied(false), 1500);
  }

  function generateDepositReference() {
    const amountNum = parseFloat(depositAmount) || 0;
    if (amountNum <= 0) {
      toast.error("Enter a valid USDm amount");
      return;
    }
    // Local-only reference — helps the user track which deposit they're making.
    const ref = `CUSD-DEP-${Date.now().toString(36).toUpperCase()}`;
    setDepositRef(ref);
    toast.success("Deposit reference generated", {
      description: ref,
    });
  }

  async function confirmDeposit() {
    if (!depositTxHash || !/^0x[a-fA-F0-9]{64}$/.test(depositTxHash)) {
      toast.error("Enter a valid transaction hash (0x...)");
      return;
    }
    setConfirming(true);
    try {
      const amountUsdm = depositAmount || undefined;
      const res = await fetch(`/api/celo/deposit/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: depositTxHash, amountUsdm }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j?.error ?? "Couldn't confirm deposit");
        return;
      }
      if (j.duplicate) {
        toast.info("This deposit was already confirmed");
      } else {
        toast.success("Deposit confirmed", {
          description: `+${naira(j.amountKobo)} credited to your wallet`,
        });
      }
      setDepositTxHash("");
      setDepositAmount("");
      setDepositRef(null);
      // Reload bridge history + jump to MiniPay wallet to show new balance.
      await load();
      setTimeout(() => setView("minipay-wallet"), 800);
    } catch {
      toast.error("Network error confirming deposit");
    } finally {
      setConfirming(false);
    }
  }

  async function handleWithdraw() {
    const amountKobo =
      withdrawMode === "NGN"
        ? parseKobo(withdrawInput)
        : Math.round((parseFloat(withdrawInput) || 0) * usdNgnRate * 100);
    if (amountKobo < 1000) {
      toast.error("Minimum withdrawal is ₦10");
      return;
    }
    if (!celoAddress) {
      toast.error("No Celo wallet linked. Open in MiniPay to link your address.");
      return;
    }
    setWithdrawing(true);
    try {
      // Request PIN via the shared dialog.
      const pinValue = await pin.request({
        title: "Confirm withdrawal",
        description: `Withdraw ${naira(amountKobo)} to ${truncateAddress(celoAddress)}`,
      });
      if (!pinValue) {
        toast.info("Withdrawal cancelled");
        return;
      }
      const res = await fetch(`/api/celo/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountKobo, pin: pinValue }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j?.error ?? "Withdrawal failed");
        return;
      }
      toast.success("Withdrawal queued", {
        description: j.message ?? `${j.amountUsdm} USDm will arrive in your wallet`,
      });
      setWithdrawInput("");
      await load();
    } catch {
      toast.error("Network error");
    } finally {
      setWithdrawing(false);
    }
  }

  const depositAmountNum = parseFloat(depositAmount) || 0;
  const depositNgnEquiv = depositAmountNum * usdNgnRate;

  const withdrawNgnEquiv =
    withdrawMode === "NGN"
      ? parseKobo(withdrawInput) / 100
      : (parseFloat(withdrawInput) || 0) * usdNgnRate;
  const withdrawUsdmEquiv =
    withdrawMode === "USDm"
      ? parseFloat(withdrawInput) || 0
      : parseKobo(withdrawInput) / 100 / usdNgnRate;

  return (
    <div className="tp-fade-rise space-y-6">
      <PageHeader
        title="cUSD ↔ NGN Bridge"
        subtitle="Move between Celo USDm and Naira instantly. Deposits credit your wallet; withdrawals send USDm to your MiniPay address."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={refreshing}
            className="gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      <RateDisplay price={price} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Deposit card */}
        <Card className="relative overflow-hidden p-5">
          <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <ArrowDownLeft className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Deposit cUSD → NGN</p>
                <p className="text-muted-foreground text-xs">
                  Send USDm to treasury, get NGN credited
                </p>
              </div>
            </div>

            {/* Flow diagram */}
            <div className="bg-muted/40 mt-4 flex items-center gap-2 rounded-xl border p-3 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 font-medium text-emerald-700 dark:text-emerald-300">
                <Zap className="h-3 w-3" /> USDm
              </span>
              <ArrowLeftRight className="text-muted-foreground h-3.5 w-3.5" />
              <span className="rounded-full bg-amber-500/10 px-2 py-1 font-medium text-amber-700 dark:text-amber-300">
                Treasury
              </span>
              <ArrowLeftRight className="text-muted-foreground h-3.5 w-3.5" />
              <span className="rounded-full bg-emerald-500/10 px-2 py-1 font-medium text-emerald-700 dark:text-emerald-300">
                ₦ NGN
              </span>
            </div>

            {/* Treasury address */}
            <div className="mt-4">
              <Label className="text-xs">Treasury address</Label>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <AddressPill address={TREASURY_ADDRESS} chainId={CELO_MAINNET_CHAIN_ID} />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={copyTreasury}
                >
                  {depositCopied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {depositCopied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>

            {/* Amount input */}
            <div className="mt-4 space-y-2">
              <Label htmlFor="deposit-amount">Amount (USDm)</Label>
              <Input
                id="deposit-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
              />
              {depositAmountNum > 0 && (
                <p className="text-muted-foreground text-xs tabular-nums">
                  You&apos;ll receive ≈{" "}
                  <span className="text-foreground font-semibold">
                    {naira(Math.round(depositNgnEquiv * 100))}
                  </span>{" "}
                  at the current rate
                </p>
              )}
            </div>

            {/* Generate reference + instructions */}
            <Button
              variant="outline"
              className="mt-3 w-full gap-1.5"
              onClick={generateDepositReference}
              disabled={!depositAmountNum || depositAmountNum <= 0}
            >
              <ArrowLeftRight className="h-4 w-4" /> Generate deposit reference
            </Button>

            {depositRef && (
              <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  Deposit instructions
                </p>
                <ol className="text-muted-foreground mt-1.5 list-decimal space-y-1 pl-4 text-xs">
                  <li>
                    Send <span className="text-foreground font-semibold">{depositAmount} USDm</span>{" "}
                    to <span className="font-mono">{truncateAddress(TREASURY_ADDRESS)}</span>
                  </li>
                  <li>
                    Reference: <span className="font-mono">{depositRef}</span>
                  </li>
                  <li>Wait for the on-chain confirmation (usually ~5 seconds on Celo)</li>
                  <li>Paste the tx hash below and click “Confirm deposit”</li>
                </ol>
              </div>
            )}

            {/* Confirm deposit */}
            <div className="mt-4 space-y-2">
              <Label htmlFor="deposit-tx">Transaction hash (0x...)</Label>
              <Input
                id="deposit-tx"
                placeholder="0x..."
                value={depositTxHash}
                onChange={(e) => setDepositTxHash(e.target.value)}
                className="font-mono"
              />
            </div>
            <Button
              className="mt-3 w-full gap-1.5"
              onClick={confirmDeposit}
              disabled={!depositTxHash || confirming}
            >
              {confirming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {confirming ? "Confirming…" : "Confirm deposit"}
            </Button>
          </div>
        </Card>

        {/* Withdraw card */}
        <Card className="relative overflow-hidden p-5">
          <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-amber-500/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <ArrowUpRight className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Withdraw NGN → cUSD</p>
                <p className="text-muted-foreground text-xs">
                  Debit NGN, receive USDm in your wallet
                </p>
              </div>
            </div>

            {/* Flow diagram */}
            <div className="bg-muted/40 mt-4 flex items-center gap-2 rounded-xl border p-3 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 font-medium text-emerald-700 dark:text-emerald-300">
                ₦ NGN
              </span>
              <ArrowLeftRight className="text-muted-foreground h-3.5 w-3.5" />
              <span className="rounded-full bg-amber-500/10 px-2 py-1 font-medium text-amber-700 dark:text-amber-300">
                Debit
              </span>
              <ArrowLeftRight className="text-muted-foreground h-3.5 w-3.5" />
              <span className="rounded-full bg-emerald-500/10 px-2 py-1 font-medium text-emerald-700 dark:text-emerald-300">
                <Zap className="inline h-3 w-3" /> USDm
              </span>
            </div>

            {/* Recipient */}
            <div className="mt-4">
              <Label className="text-xs">Recipient (your MiniPay address)</Label>
              <div className="mt-1.5">
                {celoAddress ? (
                  <AddressPill
                    address={celoAddress}
                    chainId={CELO_MAINNET_CHAIN_ID}
                    copyable={false}
                  />
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    No Celo wallet linked — open in MiniPay to link.
                  </p>
                )}
              </div>
            </div>

            {/* Mode toggle */}
            <div className="mt-4 flex gap-1">
              {(["NGN", "USDm"] as const).map((m) => {
                const active = withdrawMode === m;
                return (
                  <button
                    key={m}
                    onClick={() => setWithdrawMode(m)}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                    }`}
                  >
                    In {m}
                  </button>
                );
              })}
            </div>

            {/* Amount input */}
            <div className="mt-3 space-y-2">
              <Label htmlFor="withdraw-amount">Amount ({withdrawMode})</Label>
              <Input
                id="withdraw-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={withdrawInput}
                onChange={(e) => setWithdrawInput(e.target.value)}
              />
              <div className="text-muted-foreground grid grid-cols-2 gap-2 text-xs">
                <p>
                  ≈{" "}
                  <span className="text-foreground font-semibold tabular-nums">
                    {naira(Math.round(withdrawNgnEquiv * 100))}
                  </span>{" "}
                  NGN
                </p>
                <p className="text-right">
                  ≈{" "}
                  <span className="text-foreground font-semibold tabular-nums">
                    {withdrawUsdmEquiv.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                  </span>{" "}
                  USDm
                </p>
              </div>
            </div>

            <Button
              className="mt-3 w-full gap-1.5"
              onClick={handleWithdraw}
              disabled={!celoAddress || !withdrawInput || withdrawing}
            >
              {withdrawing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUpRight className="h-4 w-4" />
              )}
              {withdrawing ? "Processing…" : `Withdraw ${withdrawMode}`}
            </Button>

            <p className="text-muted-foreground mt-3 text-[10px]">
              Withdrawals are PIN-verified. The treasury dispatches USDm to your MiniPay address
              once processed.
            </p>
          </div>
        </Card>
      </div>

      {/* Bridge history */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Bridge history</p>
          <button
            onClick={() => setView("onchain-history")}
            className="text-primary flex items-center gap-1 text-xs hover:underline"
          >
            View all <ChevronRight className="h-3 w-3" />
          </button>
        </div>
        {loading ? (
          <div className="space-y-1">
            {[0, 1, 2].map((i) => (
              <div key={i} aria-hidden className="flex items-center gap-3 rounded-xl px-2 py-2.5">
                <div className="tp-shimmer h-10 w-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <div className="tp-shimmer h-3.5 w-1/3 rounded-full" />
                  <div className="tp-shimmer h-2.5 w-1/2 rounded-full opacity-80" />
                </div>
                <div className="tp-shimmer h-3.5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : events.length > 0 ? (
          <div className="space-y-1">
            {events.map((ev) => (
              <BridgeEventRow key={ev.id} ev={ev} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ArrowLeftRight}
            title="No bridge activity yet"
            description="Make your first cUSD deposit or NGN withdrawal to see history here."
          />
        )}
      </Card>
    </div>
  );
}
