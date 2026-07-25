"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PageHeader, EmptyState } from "../parts/layout";
import { TransactionItem } from "../parts/transaction-item";
import {
  Search,
  Download,
  Loader2,
  History as HistoryIcon,
  X,
} from "lucide-react";
import { naira, formatDate } from "@/lib/money";
import { toast } from "sonner";

interface Tx {
  id: string;
  type: string;
  direction: string;
  amountKobo: number;
  feeKobo?: number;
  status: string;
  state?: string;
  reference: string;
  description?: string | null;
  counterpartyName?: string | null;
  counterpartyAccount?: string | null;
  counterpartyBank?: string | null;
  provider?: string | null;
  providerRef?: string | null;
  metadata?: string | null;
  createdAt: string;
}

interface TxResponse {
  transactions: Tx[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

const FILTER_CHIPS = [
  { id: "", label: "All" },
  { id: "funding", label: "Funding" },
  { id: "transfers", label: "Transfers" },
  { id: "airtime", label: "Airtime" },
  { id: "data", label: "Data" },
  { id: "bills", label: "Bills" },
  { id: "cards", label: "Cards" },
  { id: "savings", label: "Savings" },
] as const;

const TYPE_LABELS: Record<string, string> = {
  FUNDING: "Funding",
  TRANSFER: "Transfer",
  AIRTIME: "Airtime",
  DATA: "Data",
  BILL: "Bill payment",
  CARD_FUND: "Card funding",
  CARD_WITHDRAW: "Card withdrawal",
  REWARD: "Reward",
  REFERRAL: "Referral bonus",
  SAVINGS_DEPOSIT: "Savings deposit",
  SAVINGS_WITHDRAW: "Savings withdrawal",
  INVESTMENT: "Investment",
};

const STATUS_TONE: Record<string, string> = {
  SUCCESS: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  PENDING: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  FAILED: "bg-red-500/15 text-red-600 dark:text-red-400",
  REVERSED: "bg-muted text-muted-foreground",
};

export default function HistoryView() {
  const [filter, setFilter] = React.useState<string>("");
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [transactions, setTransactions] = React.useState<Tx[]>([]);
  const [hasMore, setHasMore] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [active, setActive] = React.useState<Tx | null>(null);
  const [exporting, setExporting] = React.useState(false);

  // Debounce search input
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Reset when filter/search changes
  React.useEffect(() => {
    setPage(1);
    setTransactions([]);
  }, [filter, debouncedSearch]);

  const loadPage = React.useCallback(
    async (targetPage: number, replace: boolean) => {
      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          limit: "20",
        });
        if (filter) params.set("filter", filter);
        if (debouncedSearch) params.set("search", debouncedSearch);

        const res = await fetch(`/api/transactions?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Failed to load transactions");
        const data: TxResponse = await res.json();
        setTransactions((prev) =>
          replace ? data.transactions : [...prev, ...data.transactions],
        );
        setHasMore(data.hasMore);
        setPage(targetPage);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load transactions");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filter, debouncedSearch],
  );

  // Initial + filter/search change
  React.useEffect(() => {
    setLoading(true);
    loadPage(1, true);
  }, [loadPage]);

  function handleLoadMore() {
    setLoadingMore(true);
    loadPage(page + 1, false);
  }

  async function handleExport() {
    setExporting(true);
    try {
      // Pull last 90 days (server returns up to 100, paginated)
      const params = new URLSearchParams({
        page: "1",
        limit: "100",
      });
      if (filter) params.set("filter", filter);
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/transactions?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch transactions");
      const data: TxResponse = await res.json();

      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const rows = data.transactions.filter((t) => new Date(t.createdAt) >= since);
      if (rows.length === 0) {
        toast.error("No transactions in the last 90 days to export");
        return;
      }

      const headers = [
        "Date",
        "Reference",
        "Type",
        "Direction",
        "Counterparty",
        "Description",
        "Amount (NGN)",
        "Fee (NGN)",
        "Status",
        "Provider",
      ];
      const escape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
      const lines = [headers.join(",")];
      for (const t of rows) {
        lines.push(
          [
            new Date(t.createdAt).toISOString(),
            t.reference,
            t.type,
            t.direction,
            t.counterpartyName ?? "",
            t.description ?? "",
            (t.amountKobo / 100).toFixed(2),
            ((t.feeKobo ?? 0) / 100).toFixed(2),
            t.status,
            t.provider ?? "",
          ]
            .map((v) => escape(String(v)))
            .join(","),
        );
      }
      const csv = lines.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `turbopay-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} transactions`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  // Group transactions by day
  const groups = React.useMemo(() => {
    const map = new Map<string, Tx[]>();
    for (const t of transactions) {
      const d = new Date(t.createdAt);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries());
  }, [transactions]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transactions"
        subtitle="Browse, search and export your money movements."
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">Export</span>
          </Button>
        }
      />

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name, description or reference…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-thin">
        {FILTER_CHIPS.map((c) => {
          const activeChip = filter === c.id;
          return (
            <button
              key={c.id || "all"}
              onClick={() => setFilter(c.id)}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                activeChip
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <Card className="divide-y p-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-1/3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-3.5 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </Card>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title="No transactions found"
          description={
            debouncedSearch
              ? `Nothing matches “${debouncedSearch}”. Try a different search.`
              : "When you fund, transfer or pay bills, they will appear here."
          }
        />
      ) : (
        <div className="space-y-4">
          {groups.map(([day, items]) => (
            <div key={day}>
              <div className="mb-1.5 flex items-center justify-between px-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {formatDate(day)}
                </p>
                <span className="text-xs text-muted-foreground">
                  {items.length} {items.length === 1 ? "transaction" : "transactions"}
                </span>
              </div>
              <Card className="divide-y p-2">
                {items.map((tx) => (
                  <TransactionItem key={tx.id} tx={tx} onClick={() => setActive(tx)} />
                ))}
              </Card>
            </div>
          ))}

          {hasMore && (
            <div className="flex justify-center py-2">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="gap-1.5"
              >
                {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Load more
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Detail dialog */}
      <TxDetailDialog tx={active} onClose={() => setActive(null)} />
    </div>
  );
}

// ============== DETAIL DIALOG ==============

function TxDetailDialog({ tx, onClose }: { tx: Tx | null; onClose: () => void }) {
  const open = !!tx;
  if (!tx) return <Dialog open={open} onOpenChange={onClose} />;

  const isCredit = tx.direction === "CREDIT";
  const tone = STATUS_TONE[tx.status] ?? STATUS_TONE.PENDING;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div
            className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
              isCredit
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
            }`}
          >
            <span className="text-2xl font-bold">{isCredit ? "+" : "−"}</span>
          </div>
          <DialogTitle className="text-center">
            {naira(tx.amountKobo)}
          </DialogTitle>
          <DialogDescription className="text-center">
            {TYPE_LABELS[tx.type] ?? tx.type}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
            {tx.status}
          </span>
        </div>

        <div className="space-y-2.5 rounded-xl bg-muted/40 p-4 text-sm">
          <DetailRow label="Reference" value={tx.reference} mono />
          {tx.description && <DetailRow label="Description" value={tx.description} />}
          {tx.counterpartyName && (
            <DetailRow label="Counterparty" value={tx.counterpartyName} />
          )}
          {tx.counterpartyAccount && (
            <DetailRow label="Account" value={tx.counterpartyAccount} mono />
          )}
          {tx.counterpartyBank && (
            <DetailRow label="Bank" value={tx.counterpartyBank} />
          )}
          {tx.provider && <DetailRow label="Provider" value={tx.provider} />}
          {(!!tx.feeKobo && tx.feeKobo > 0) && (
            <DetailRow label="Fee" value={naira(tx.feeKobo)} />
          )}
          <DetailRow label="Date" value={formatDate(tx.createdAt, true)} />
          {tx.state && tx.state !== "SETTLED" && (
            <DetailRow label="State" value={tx.state} />
          )}
        </div>

        <Button variant="outline" className="w-full" onClick={onClose}>
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right font-medium ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}
