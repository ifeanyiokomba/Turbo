"use client";

import * as React from "react";
import { useApp } from "../store";
import { PageHeader, EmptyState } from "../parts/layout";
import { AddressPill } from "../parts/address-pill";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Send,
  RefreshCw,
  ExternalLink,
  Link2,
  ChevronRight,
} from "lucide-react";
import { naira, timeAgo } from "@/lib/money";
import { truncateAddress, getExplorerUrl, CELO_MAINNET_CHAIN_ID } from "@/lib/minipay";
import { toast } from "sonner";

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

type FilterKey = "ALL" | "DEPOSIT" | "WITHDRAW" | "PAYMENT";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "DEPOSIT", label: "Deposits" },
  { key: "WITHDRAW", label: "Withdrawals" },
  { key: "PAYMENT", label: "Payments" },
];

function TypeIcon({ tx }: { tx: OnchainTx }) {
  const Icon = tx.type === "DEPOSIT" ? ArrowDownLeft : tx.type === "WITHDRAW" ? ArrowUpRight : Send;
  const isCredit = tx.direction === "CREDIT";
  const tone = isCredit
    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
    : "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  return (
    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone}`}>
      <Icon className="h-4.5 w-4.5" />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "SUCCESS"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : status === "PENDING"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : "bg-red-500/15 text-red-600 dark:text-red-400";
  return (
    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>
      {status}
    </span>
  );
}

function TxRowSkeleton() {
  return (
    <div aria-hidden className="flex items-center gap-3 border-b p-4">
      <div className="tp-shimmer h-10 w-10 shrink-0 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <div className="tp-shimmer h-3.5 w-1/3 rounded-full" />
        <div className="tp-shimmer h-2.5 w-1/2 rounded-full opacity-80" />
      </div>
      <div className="space-y-1.5 text-right">
        <div className="tp-shimmer ml-auto h-3.5 w-20 rounded-full" />
        <div className="tp-shimmer ml-auto h-2.5 w-14 rounded-full opacity-80" />
      </div>
    </div>
  );
}

export default function OnchainHistoryView() {
  const { celoAddress } = useApp();
  const [filter, setFilter] = React.useState<FilterKey>("ALL");
  const [txs, setTxs] = React.useState<OnchainTx[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(false);

  const load = React.useCallback(async (filterKey: FilterKey, replace = true) => {
    if (replace) setLoading(true);
    else setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: "20" });
      if (filterKey !== "ALL") params.set("type", filterKey);
      if (!replace && cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/celo/transactions?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("failed");
      const j = await res.json();
      const incoming: OnchainTx[] = j.transactions ?? [];
      setTxs((prev) => (replace ? incoming : [...prev, ...incoming]));
      setCursor(j.nextCursor ?? null);
      setHasMore(!!j.hasMore);
    } catch {
      toast.error("Couldn't load on-chain transactions");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [cursor]);

  React.useEffect(() => {
    load("ALL", true);
  }, [load]);

  function changeFilter(f: FilterKey) {
    if (f === filter) return;
    setFilter(f);
    setCursor(null);
    load(f, true);
  }

  function loadMore() {
    if (!cursor || loadingMore) return;
    load(filter, false);
  }

  function refresh() {
    setCursor(null);
    load(filter, true);
    toast.success("History refreshed");
  }

  return (
    <div className="space-y-6 tp-fade-rise">
      <PageHeader
        title="On-Chain History"
        subtitle="Every Celo transaction linked to your Turbopay account — deposits, withdrawals, and payments."
        actions={
          <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => changeFilter(f.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          );
        })}
        {celoAddress && (
          <div className="ml-auto hidden sm:block">
            <AddressPill address={celoAddress} />
          </div>
        )}
      </div>

      {/* List */}
      <Card className="overflow-hidden p-0">
        {loading ? (
          <div>
            {Array.from({ length: 8 }).map((_, i) => (
              <TxRowSkeleton key={i} />
            ))}
          </div>
        ) : txs.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Link2}
              title="No on-chain transactions yet"
              description="Deposit cUSD to your treasury address to bridge into NGN, or send USDm to another address to see activity here."
            />
          </div>
        ) : (
          <div className="divide-y">
            {txs.map((tx) => {
              const isCredit = tx.direction === "CREDIT";
              const amountNum = Number(tx.amountHuman) || 0;
              return (
                <div
                  key={tx.id}
                  className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center"
                >
                  <TypeIcon tx={tx} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">
                        {tx.type === "DEPOSIT"
                          ? "Deposit"
                          : tx.type === "WITHDRAW"
                            ? "Withdrawal"
                            : "Payment"}
                      </p>
                      <Badge variant="secondary" className="text-[10px]">
                        {tx.tokenSymbol}
                      </Badge>
                      <StatusBadge status={tx.status} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{timeAgo(tx.createdAt)}</span>
                      <a
                        href={getExplorerUrl(tx.hash, CELO_MAINNET_CHAIN_ID)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
                      >
                        {truncateAddress(tx.hash)}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                      <span className="inline-flex items-center gap-1">
                        Counterparty:{" "}
                        <span className="font-mono">{truncateAddress(tx.counterpartyAddress)}</span>
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-semibold tabular-nums ${
                        isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                      }`}
                    >
                      {isCredit ? "+" : "−"}
                      {amountNum.toLocaleString(undefined, { maximumFractionDigits: 6 })} {tx.tokenSymbol}
                    </p>
                    {tx.amountKoboEquiv != null && tx.amountKoboEquiv > 0 && (
                      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        ≈ {naira(tx.amountKoboEquiv)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Pagination */}
      {hasMore && !loading && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={loadingMore}
            className="gap-1.5"
          >
            {loadingMore ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <ChevronRight className="h-4 w-4 rotate-90" />
            )}
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
