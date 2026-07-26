"use client";

import * as React from "react";
import { useApp } from "../store";
import { PageHeader, EmptyState } from "../parts/layout";
import { AddressPill } from "../parts/address-pill";
import { AnimatedNumber } from "../parts/animated-number";
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
  Plus,
  Send,
  Copy,
  Check,
  RefreshCw,
  Wallet as WalletIcon,
  ExternalLink,
  Coins,
  Zap,
  Link2,
  ChevronRight,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { naira } from "@/lib/money";
import {
  truncateAddress,
  getExplorerUrl,
  MINIPAY_DEEPLINKS,
  CELO_MAINNET_CHAIN_ID,
  CELO_SEPOLIA_CHAIN_ID,
  getToken,
  TREASURY_ADDRESS,
} from "@/lib/minipay";
import { timeAgo } from "@/lib/money";
import {
  useSendTransaction,
  useAccount,
  useChainId,
} from "wagmi";
import { encodeFunctionData, parseUnits, isAddress, erc20Abi } from "viem";

// ---------- Types ----------
interface WalletData {
  wallet: {
    id: string;
    address: string;
    chainId: number;
    linkedAt: string;
    lastSeenAt: string;
  } | null;
  linked: boolean;
  chainName?: string;
  message?: string;
}

interface TokenBalance {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  raw: string;
  balance: string;
  balanceNumber: number;
}

interface BalancesData {
  address: string;
  chainId: number;
  nativeCelo: string;
  balances: TokenBalance[];
  fetchedAt: string;
}

interface PriceData {
  token: string;
  usdNgnRate: number;
  tokenToNgn: number;
  tokenToUsd: number;
  source: string;
  updatedAt: string;
  ageMs: number;
}

interface OnchainTx {
  id: string;
  hash: string;
  type: string;
  direction: string;
  tokenSymbol: string;
  amountHuman: string;
  amountKoboEquiv: number | null;
  counterpartyAddress: string;
  status: string;
  createdAt: string;
}

const TOKEN_ICON: Record<string, string> = {
  USDm: "₵",
  USDC: "$",
  USDT: "₮",
  NGNm: "₦",
  CELO: "ⓒ",
};

const TOKEN_TONE: Record<string, string> = {
  USDm: "from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400",
  USDC: "from-sky-500/15 to-sky-500/5 text-sky-600 dark:text-sky-400",
  USDT: "from-emerald-500/15 to-emerald-500/5 text-emerald-700 dark:text-emerald-300",
  NGNm: "from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400",
  CELO: "from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400",
};

// ---------- Helpers ----------
function tokenNgnEquivalent(symbol: string, balanceNumber: number, usdNgnRate: number): number {
  if (symbol === "NGNm") return balanceNumber; // 1 NGNm = 1 NGN
  // USD-pegged tokens (USDm, USDC, USDT) and CELO (priced ~$1 for display fallback).
  return balanceNumber * usdNgnRate;
}

// ---------- Skeletons ----------
function WalletCardSkeleton() {
  return (
    <div
      aria-hidden
      className="tp-wallet-card tp-sheen relative aspect-[1.7/1] w-full max-w-md rounded-3xl p-5 text-white sm:p-6"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="tp-shimmer h-3 w-28 rounded-full" />
          <div className="tp-shimmer h-7 w-44 rounded-full opacity-90" />
          <div className="tp-shimmer h-3 w-32 rounded-full opacity-70" />
        </div>
        <div className="tp-shimmer h-8 w-8 rounded-full" />
      </div>
      <div className="mt-6 flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="tp-shimmer h-2.5 w-20 rounded-full opacity-80" />
          <div className="tp-shimmer h-4 w-40 rounded-full" />
        </div>
        <div className="tp-shimmer h-5 w-20 rounded-full opacity-80" />
      </div>
    </div>
  );
}

function TokenCardSkeleton() {
  return (
    <Card aria-hidden className="tp-sheen relative overflow-hidden p-4">
      <div className="flex items-center justify-between">
        <div className="tp-shimmer h-4 w-12 rounded-full" />
        <div className="tp-shimmer h-8 w-8 rounded-lg" />
      </div>
      <div className="tp-shimmer mt-3 h-5 w-24 rounded-full" />
      <div className="tp-shimmer mt-1 h-3 w-20 rounded-full opacity-80" />
    </Card>
  );
}

function TxRowSkeleton() {
  return (
    <div aria-hidden className="flex items-center gap-3 rounded-xl px-2 py-2.5">
      <div className="tp-shimmer h-10 w-10 shrink-0 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <div className="tp-shimmer h-3.5 w-3/4 rounded-full" />
        <div className="tp-shimmer h-2.5 w-1/2 rounded-full opacity-80" />
      </div>
      <div className="space-y-1.5 text-right">
        <div className="tp-shimmer ml-auto h-3.5 w-16 rounded-full" />
      </div>
    </div>
  );
}

// ---------- Sub-components ----------
function TokenCard({
  tok,
  usdNgnRate,
}: {
  tok: TokenBalance;
  usdNgnRate: number;
}) {
  const ngnEquiv = tokenNgnEquivalent(tok.symbol, tok.balanceNumber, usdNgnRate);
  return (
    <Card
      className={`relative overflow-hidden bg-gradient-to-br ${TOKEN_TONE[tok.symbol] ?? TOKEN_TONE.USDm} p-4`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-background/80 font-bold">
            {TOKEN_ICON[tok.symbol] ?? "•"}
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">{tok.symbol}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{tok.name}</p>
          </div>
        </div>
      </div>
      <p className="mt-3 text-lg font-bold tabular-nums">
        {formatTokenAmount(tok.balanceNumber, tok.decimals)}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
        ≈ {naira(Math.round(ngnEquiv * 100))}
      </p>
    </Card>
  );
}

// Format a token amount for compact display: 10.5, 0.0042, 1,234.56
function formatTokenAmount(value: number, decimals: number): string {
  if (!isFinite(value)) return "0";
  // For 18-decimal tokens the JS number may lose precision; rely on the string
  // balance from the API when available.
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs < 0.0001) return "<0.0001";
  if (abs >= 1_000_000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (abs >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function RecentTxRow({ tx, chainId }: { tx: OnchainTx; chainId: number }) {
  const isCredit = tx.direction === "CREDIT";
  const Icon = tx.type === "DEPOSIT" ? ArrowDownLeft : tx.type === "WITHDRAW" ? ArrowUpRight : Send;
  const tone = isCredit
    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
    : "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  const statusTone =
    tx.status === "SUCCESS"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : tx.status === "PENDING"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : "bg-red-500/15 text-red-600 dark:text-red-400";
  return (
    <a
      href={getExplorerUrl(tx.hash, chainId)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/60"
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone}`}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {tx.type === "DEPOSIT" ? "Deposit" : tx.type === "WITHDRAW" ? "Withdrawal" : "Payment"} · {tx.tokenSymbol}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {truncateAddress(tx.counterpartyAddress)} · {timeAgo(tx.createdAt)}
        </p>
      </div>
      <div className="text-right">
        <p className={`text-sm font-semibold tabular-nums ${isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>
          {isCredit ? "+" : "−"}{formatTokenAmount(Number(tx.amountHuman) || 0, 18)}
        </p>
        <span className={`mt-0.5 inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${statusTone}`}>
          {tx.status}
        </span>
      </div>
    </a>
  );
}

// ---------- Main view ----------
export default function MiniPayWalletView() {
  const { setView, celoAddress, minipayMode } = useApp();
  const { address: wagmiAddress } = useAccount();
  const wagmiChainId = useChainId();

  const [wallet, setWallet] = React.useState<WalletData | null>(null);
  const [balances, setBalances] = React.useState<BalancesData | null>(null);
  const [price, setPrice] = React.useState<PriceData | null>(null);
  const [txs, setTxs] = React.useState<OnchainTx[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  // Dialogs
  const [receiveOpen, setReceiveOpen] = React.useState(false);
  const [sendOpen, setSendOpen] = React.useState(false);

  // Resolve the active address — prefer wagmi (live), fall back to store.
  const activeAddress = wagmiAddress ?? celoAddress ?? wallet?.wallet?.address ?? null;
  const activeChainId = wagmiChainId || wallet?.wallet?.chainId || CELO_MAINNET_CHAIN_ID;

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      // Step 1: ensure wallet is linked server-side (pass address if known).
      const walletUrl = activeAddress
        ? `/api/celo/wallet?address=${encodeURIComponent(activeAddress)}&chainId=${activeChainId}`
        : `/api/celo/wallet`;
      const [wRes, pRes] = await Promise.all([
        fetch(walletUrl, { cache: "no-store" }),
        fetch(`/api/celo/price?token=USDm`, { cache: "no-store" }),
      ]);
      const w: WalletData = wRes.ok ? await wRes.json() : null;
      const p: PriceData = pRes.ok ? await pRes.json() : null;
      setWallet(w);
      setPrice(p);

      // Step 2: fetch balances + transactions using the linked address.
      const linkedAddress = activeAddress ?? w?.wallet?.address ?? null;
      if (linkedAddress) {
        const chainForBalances = w?.wallet?.chainId ?? activeChainId;
        const [bRes, tRes] = await Promise.all([
          fetch(`/api/celo/balances?address=${encodeURIComponent(linkedAddress)}&chainId=${chainForBalances}`, { cache: "no-store" }),
          fetch(`/api/celo/transactions?limit=5`, { cache: "no-store" }),
        ]);
        if (bRes.ok) setBalances(await bRes.json());
        if (tRes.ok) {
          const tj = await tRes.json();
          setTxs(tj.transactions ?? []);
        }
      }
    } catch {
      toast.error("Couldn't load your MiniPay wallet");
    } finally {
      setLoading(false);
    }
  }, [activeAddress, activeChainId]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
      toast.success("Wallet refreshed");
    } finally {
      setRefreshing(false);
    }
  }

  const usdNgnRate = price?.usdNgnRate ?? 1580;
  const usdmBalance = balances?.balances.find((b) => b.symbol === "USDm")?.balanceNumber ?? 0;
  const usdmNgnEquiv = usdmBalance * usdNgnRate;

  const chainBadge =
    activeChainId === CELO_SEPOLIA_CHAIN_ID ? "Celo Sepolia" : "Celo Mainnet";

  return (
    <div className="space-y-6 tp-fade-rise">
      <PageHeader
        title="MiniPay Wallet"
        subtitle="Your cUSD stablecoin balance on Celo — bridged to NGN instantly."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={refreshing || loading}
            className="gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      {!minipayMode && !activeAddress && (
        <Card className="border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <Zap className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Open inside MiniPay to auto-link</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                This view works best inside the MiniPay super-app. Outside MiniPay, you can still
                view any Celo address by linking it manually.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column — balance card + actions */}
        <div className="space-y-6 lg:col-span-2">
          {loading ? (
            <WalletCardSkeleton />
          ) : activeAddress ? (
            <div className="tp-wallet-card tp-float relative aspect-[1.7/1] w-full max-w-md rounded-3xl p-5 text-white tp-sheen sm:p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="flex items-center gap-1.5 text-xs opacity-80">
                    <Coins className="h-3.5 w-3.5" /> USDm balance
                  </p>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <p className="text-3xl font-bold tabular-nums sm:text-4xl">
                      <AnimatedNumber
                        value={usdmBalance}
                        duration={700}
                        format={(n) => formatTokenAmount(n, 18)}
                      />
                    </p>
                    <span className="text-sm font-medium opacity-80">USDm</span>
                  </div>
                  <p className="mt-1 text-sm opacity-80 tabular-nums">
                    ≈ {naira(Math.round(usdmNgnEquiv * 100))}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold backdrop-blur">
                    <Zap className="h-3 w-3" /> MiniPay
                  </span>
                  <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium backdrop-blur">
                    {chainBadge}
                  </span>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs tracking-wider opacity-90">
                  {truncateAddress(activeAddress)}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(activeAddress);
                    toast.success("Address copied");
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium backdrop-blur transition-colors hover:bg-white/25"
                >
                  <Copy className="h-3 w-3" /> Copy
                </button>
                <a
                  href={getExplorerUrl(activeAddress, activeChainId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium backdrop-blur transition-colors hover:bg-white/25"
                >
                  <ExternalLink className="h-3 w-3" /> Celoscan
                </a>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  onClick={() => setReceiveOpen(true)}
                  className="flex items-center justify-center gap-1.5 rounded-full bg-white/20 px-3 py-2 text-xs font-semibold backdrop-blur transition-colors hover:bg-white/30"
                >
                  <ArrowDownLeft className="h-3.5 w-3.5" /> Receive
                </button>
                <button
                  onClick={() => setSendOpen(true)}
                  className="flex items-center justify-center gap-1.5 rounded-full bg-white/20 px-3 py-2 text-xs font-semibold backdrop-blur transition-colors hover:bg-white/30"
                >
                  <Send className="h-3.5 w-3.5" /> Send
                </button>
                <a
                  href={MINIPAY_DEEPLINKS.addCash("USDM")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-full bg-white/20 px-3 py-2 text-xs font-semibold backdrop-blur transition-colors hover:bg-white/30"
                >
                  <Plus className="h-3.5 w-3.5" /> Add cash
                </a>
                <button
                  onClick={() => setView("celo-bridge")}
                  className="flex items-center justify-center gap-1.5 rounded-full bg-white/15 px-3 py-2 text-xs font-semibold backdrop-blur transition-colors hover:bg-white/25"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" /> Bridge
                </button>
              </div>

              <p className="mt-4 text-[10px] font-medium opacity-50">
                Powered by Celo · MiniPay · Turbopay
              </p>
            </div>
          ) : (
            <EmptyState
              icon={WalletIcon}
              title="No Celo wallet linked"
              description="Open this app inside MiniPay to auto-link your address, or come back once linked."
            />
          )}

          {/* Token balances grid */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Token balances</p>
              <span className="text-xs text-muted-foreground">Live on-chain</span>
            </div>
            {loading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <TokenCardSkeleton key={i} />
                ))}
              </div>
            ) : balances ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {balances.balances
                  .filter((b) => ["USDm", "USDC", "USDT", "NGNm"].includes(b.symbol))
                  .map((tok) => (
                    <TokenCard key={tok.symbol} tok={tok} usdNgnRate={usdNgnRate} />
                  ))}
              </div>
            ) : (
              <Card className="p-4 text-sm text-muted-foreground">
                Couldn't load balances — try refreshing.
              </Card>
            )}
          </div>

          {/* Recent on-chain transactions */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Recent on-chain activity</p>
              <button
                onClick={() => setView("onchain-history")}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                View all <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            {loading ? (
              <div className="space-y-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <TxRowSkeleton key={i} />
                ))}
              </div>
            ) : txs.length > 0 ? (
              <div className="space-y-1">
                {txs.map((t) => (
                  <RecentTxRow key={t.id} tx={t} chainId={activeChainId} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Link2}
                title="No on-chain transactions yet"
                description="Deposit cUSD to your treasury address to see activity here."
              />
            )}
          </Card>
        </div>

        {/* Right column — rate + bridge CTA */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">USD/NGN rate</p>
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <RefreshCw className="h-2.5 w-2.5" />
                {price ? `${Math.round(price.ageMs / 60000)}m ago` : "—"}
              </Badge>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums">
              ₦{(usdNgnRate).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              1 USDm ≈ ₦{(usdNgnRate).toLocaleString("en-NG", { maximumFractionDigits: 2 })}
            </p>
            <p className="mt-3 text-[10px] text-muted-foreground">
              Source: {price?.source ?? "fallback"} · Updated {price ? timeAgo(price.updatedAt) : "—"}
            </p>
          </Card>

          <button
            onClick={() => setView("celo-bridge")}
            className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-amber-500 p-5 text-left text-white shadow-lg transition-transform hover:-translate-y-0.5"
          >
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-xl" />
            <div className="absolute -bottom-8 -left-4 h-20 w-20 rounded-full bg-amber-300/20 blur-xl" />
            <div className="relative flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
                <ArrowLeftRight className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Bridge cUSD ↔ NGN</p>
                <p className="mt-0.5 text-xs text-white/80">
                  Instantly convert USDm to NGN (credited to your wallet) or withdraw NGN to cUSD.
                </p>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium underline-offset-2 group-hover:underline">
                  Open bridge <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          </button>

          <Card className="p-5">
            <p className="text-sm font-semibold">Treasury address</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Send USDm here to bridge into NGN. The deposit is auto-credited once confirmed on-chain.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <AddressPill address={TREASURY_ADDRESS} chainId={activeChainId} />
            </div>
          </Card>
        </div>
      </div>

      {/* Receive dialog */}
      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Receive cUSD</DialogTitle>
            <DialogDescription>
              Share this address or scan the QR code to receive USDm on Celo.
            </DialogDescription>
          </DialogHeader>
          {activeAddress && (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <QRCodeSVG
                  value={activeAddress}
                  size={192}
                  bgColor="#ffffff"
                  fgColor="#047857"
                  level="M"
                  includeMargin={false}
                />
              </div>
              <div className="w-full break-all rounded-xl bg-muted/50 p-3 text-center font-mono text-xs">
                {activeAddress}
              </div>
              <Button
                variant="outline"
                className="w-full gap-1.5"
                onClick={() => {
                  navigator.clipboard.writeText(activeAddress);
                  toast.success("Address copied");
                }}
              >
                <Copy className="h-4 w-4" /> Copy address
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Send cUSD dialog */}
      <SendCUsdDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        usdmBalance={usdmBalance}
        usdNgnRate={usdNgnRate}
        chainId={activeChainId}
        onSent={refresh}
      />
    </div>
  );
}

// ---------- Send cUSD dialog ----------
function SendCUsdDialog({
  open,
  onOpenChange,
  usdmBalance,
  usdNgnRate,
  chainId,
  onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  usdmBalance: number;
  usdNgnRate: number;
  chainId: number;
  onSent: () => void;
}) {
  const { sendTransactionAsync, isPending } = useSendTransaction();
  const [recipient, setRecipient] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [txHash, setTxHash] = React.useState<string | null>(null);

  const amountNum = parseFloat(amount) || 0;
  const usdmToken = getToken("USDm", chainId);
  const ngnEquiv = amountNum * usdNgnRate;

  const valid =
    !!usdmToken &&
    isAddress(recipient) &&
    amountNum > 0 &&
    amountNum <= usdmBalance;

  React.useEffect(() => {
    if (!open) {
      setRecipient("");
      setAmount("");
      setTxHash(null);
    }
  }, [open]);

  async function handleSend() {
    if (!usdmToken || !valid) return;
    try {
      const value = parseUnits(amount, usdmToken.decimals);
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [recipient as `0x${string}`, value],
      });
      const hash = await sendTransactionAsync({
        to: usdmToken.address as `0x${string}`,
        data,
      });
      setTxHash(hash);
      toast.success("Transaction submitted", {
        description: truncateAddress(hash),
      });
      // Give the network a moment to index before refreshing balances.
      setTimeout(() => onSent(), 1500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      // Wagmi throws a UserRejectedRequestError on user cancel — don't toast as error.
      if (/reject|denied|cancelled/i.test(msg)) {
        toast.info("Transaction cancelled");
      } else {
        toast.error("Transaction failed", { description: msg });
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send cUSD</DialogTitle>
          <DialogDescription>
            Transfer USDm to another Celo address. Confirm with your MiniPay wallet.
          </DialogDescription>
        </DialogHeader>

        {txHash ? (
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
              <Check className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                Transaction submitted
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {truncateAddress(txHash)}
              </p>
            </div>
            <div className="flex gap-2">
              <a
                href={getExplorerUrl(txHash, chainId)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                <ExternalLink className="h-4 w-4" /> View on Celoscan
              </a>
              <Button className="flex-1" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="send-recipient">Recipient address</Label>
              <Input
                id="send-recipient"
                placeholder="0x..."
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="font-mono"
              />
              {recipient && !isAddress(recipient) && (
                <p className="text-xs text-red-600 dark:text-red-400">Invalid address</p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="send-amount">Amount (USDm)</Label>
                <span className="text-xs text-muted-foreground">
                  Balance: {formatTokenAmount(usdmBalance, 18)} USDm
                </span>
              </div>
              <Input
                id="send-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {amountNum > 0 && (
                <p className="text-xs text-muted-foreground">
                  ≈ {naira(Math.round(ngnEquiv * 100))}
                </p>
              )}
              <div className="flex gap-1.5">
                {[0.25, 0.5, 1].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() =>
                      setAmount((usdmBalance * f).toFixed(4))
                    }
                    className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium hover:border-primary hover:bg-primary/5"
                  >
                    {Math.round(f * 100)}%
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAmount(String(usdmBalance))}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium hover:border-primary hover:bg-primary/5"
                >
                  Max
                </button>
              </div>
            </div>
            <Button
              className="w-full gap-1.5"
              disabled={!valid || isPending}
              onClick={handleSend}
            >
              {isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {isPending ? "Confirm in wallet…" : "Send USDm"}
            </Button>
            <p className="text-center text-[10px] text-muted-foreground">
              You&apos;ll confirm this transaction in your MiniPay wallet.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
