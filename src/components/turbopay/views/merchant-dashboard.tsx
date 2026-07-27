"use client";

import * as React from "react";
import { useApp } from "../store";
import { PageHeader, EmptyState } from "../parts/layout";
import { Card } from "@/components/ui/card";
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
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  Crown,
  Store,
  RefreshCw,
  TrendingUp,
  Receipt,
  Link as LinkIcon,
  Wallet,
  KeyRound,
  Plus,
  Copy,
  Check,
  Trash2,
  ArrowRight,
  AlertTriangle,
  ShieldCheck,
  Activity,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { naira, nairaCompact, formatDate, timeAgo } from "@/lib/money";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface MerchantInfo {
  id: string;
  name: string;
  businessName: string | null;
  email: string | null;
  country: string;
  status: string;
}

interface SalesTrendDay {
  date: string;
  label: string;
  sales: number;
  count: number;
}

interface TopCustomer {
  name: string;
  total: number;
  count: number;
  lastAt: string;
  totalDisplay: string;
}

interface RecentLink {
  id: string;
  slug: string;
  title: string;
  amountMinor: number | null;
  currency: string;
  usesCount: number;
  status: string;
  createdAt: string;
}

interface DashboardData {
  merchant: MerchantInfo;
  stats: {
    totalSalesKobo: number;
    transactionCount: number;
    activeLinks: number;
    settlementBalanceKobo: number;
    walletStatus: string;
    currency: string;
  };
  salesTrend: SalesTrendDay[];
  topCustomers: TopCustomer[];
  recentLinks: RecentLink[];
}

interface ApiKeyInfo {
  id: string;
  prefix: string;
  scopes: string[] | { name?: string; scopes?: string[] };
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  active: boolean;
}

interface ApiKeyCreated {
  key: string;
  id: string;
  prefix: string;
  name: string;
  scopes: string[];
  warning: string;
}

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

export default function MerchantDashboardView() {
  const { setView } = useApp();
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);

  // API keys
  const [apiKeys, setApiKeys] = React.useState<ApiKeyInfo[]>([]);
  const [keysLoading, setKeysLoading] = React.useState(true);

  // Create key dialog
  const [createOpen, setCreateOpen] = React.useState(false);
  const [keyName, setKeyName] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  // Show-once newly created key
  const [newKey, setNewKey] = React.useState<ApiKeyCreated | null>(null);
  const [copiedKey, setCopiedKey] = React.useState(false);

  // Revoking state
  const [revokingId, setRevokingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/merchant/dashboard", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load merchant dashboard");
        return;
      }
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  const loadKeys = React.useCallback(async () => {
    setKeysLoading(true);
    try {
      const res = await fetch("/api/merchant/api-keys", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setApiKeys(json.keys ?? []);
    } finally {
      setKeysLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    loadKeys();
  }, [load, loadKeys]);

  async function createKey() {
    if (keyName.trim().length < 2) {
      toast.error("Key name must be at least 2 characters");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/merchant/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName.trim(), scopes: ["READ", "PAYMENTS", "LINKS"] }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? "Could not create API key");
        return;
      }
      setNewKey(json as ApiKeyCreated);
      setCreateOpen(false);
      setKeyName("");
      loadKeys();
      toast.success("API key generated");
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(id: string) {
    setRevokingId(id);
    try {
      const res = await fetch(`/api/merchant/api-keys/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? "Could not revoke key");
        return;
      }
      toast.success("API key revoked");
      loadKeys();
    } finally {
      setRevokingId(null);
    }
  }

  async function copyNewKey() {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey.key);
      setCopiedKey(true);
      toast.success("API key copied — store it securely");
      setTimeout(() => setCopiedKey(false), 2000);
    } catch {
      toast.error("Could not copy");
    }
  }

  // -- Render: loading state
  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Merchant Dashboard" subtitle="Sales, payment links, and API keys" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  const stats = data?.stats;
  const merchant = data?.merchant;
  const trendData = (data?.salesTrend ?? []).map((d) => ({
    ...d,
    salesNaira: d.sales / 100,
  }));

  return (
    <div className="tp-fade-rise space-y-5">
      <PageHeader
        title="Merchant Dashboard"
        subtitle="Track sales, manage payment links, and issue API keys."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button size="sm" onClick={() => setView("marketplace")} className="gap-1.5">
              <Store className="h-4 w-4" /> Marketplace
            </Button>
          </>
        }
      />

      {/* ============ Merchant identity banner ============ */}
      <Card className="tp-emerald-grad tp-sheen relative overflow-hidden p-5 text-white sm:p-6">
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge className="bg-white/20 text-white">
              <Crown className="mr-1 h-3 w-3" /> Merchant
            </Badge>
            <h2 className="mt-3 text-xl font-bold sm:text-2xl">
              {merchant?.businessName ?? merchant?.name ?? "Turbopay Merchant"}
            </h2>
            <p className="mt-0.5 text-sm text-white/85">
              {merchant?.email ?? "—"} · {merchant?.country ?? "NG"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">
              {merchant?.status ?? "ACTIVE"}
            </span>
            <span className="text-xs text-white/75">
              Settlement wallet · {stats?.walletStatus ?? "ACTIVE"}
            </span>
          </div>
        </div>
      </Card>

      {/* ============ Stats row ============ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total sales · 30d"
          value={naira(stats?.totalSalesKobo ?? 0)}
          hint="Successful credits in the last 30 days"
          icon={TrendingUp}
          tone="emerald"
        />
        <StatTile
          label="Transactions"
          value={String(stats?.transactionCount ?? 0)}
          hint="Successful transactions · 30d"
          icon={Receipt}
          tone="amber"
        />
        <StatTile
          label="Active links"
          value={String(stats?.activeLinks ?? 0)}
          hint="Active payment links"
          icon={LinkIcon}
          tone="emerald"
        />
        <StatTile
          label="Settlement balance"
          value={naira(stats?.settlementBalanceKobo ?? 0)}
          hint="Current wallet balance"
          icon={Wallet}
          tone="emerald"
        />
      </div>

      {/* ============ Sales trend chart ============ */}
      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="text-primary h-5 w-5" />
            <h2 className="text-base font-semibold">Sales trend</h2>
            <Badge variant="secondary" className="text-[10px]">
              14 days
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            <span className="text-foreground font-semibold tabular-nums">
              {nairaCompact(stats?.totalSalesKobo ?? 0)}
            </span>{" "}
            total
          </p>
        </div>
        {trendData.length === 0 || (stats?.totalSalesKobo ?? 0) === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No sales yet"
            description="When customers pay via your links, your daily sales will appear here."
          />
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                <defs>
                  <linearGradient id="tpMerchSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="oklch(0.92 0.005 100)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "oklch(0.55 0.01 100)" }}
                  interval={1}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "oklch(0.55 0.01 100)" }}
                  tickFormatter={(v) => nairaCompact(Number(v) * 100)}
                  width={70}
                />
                <Tooltip
                  formatter={(v: number) => [naira(Math.round(v * 100)), "Sales"]}
                  labelStyle={{ fontWeight: 600, color: "#0f172a" }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid oklch(0.92 0.005 100)",
                    boxShadow: "0 4px 18px -4px rgba(0,0,0,0.08)",
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="salesNaira"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fill="url(#tpMerchSales)"
                  dot={false}
                  activeDot={{ r: 5, fill: "#10b981", stroke: "white", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* ============ Two-column: Top customers + Active links ============ */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top customers */}
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="text-primary h-5 w-5" />
            <h2 className="text-base font-semibold">Top customers</h2>
            <Badge variant="secondary" className="ml-auto text-[10px]">
              30d
            </Badge>
          </div>
          {data?.topCustomers && data.topCustomers.length > 0 ? (
            <ul className="scrollbar-thin max-h-72 space-y-2 overflow-y-auto pr-1">
              {data.topCustomers.map((c, i) => (
                <li
                  key={`${c.name}-${i}`}
                  className="hover:bg-muted/40 flex items-center gap-3 rounded-xl border p-3 transition-colors"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-600 uppercase dark:text-emerald-400">
                    {c.name.slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {c.count} {c.count === 1 ? "payment" : "payments"} · last {timeAgo(c.lastAt)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
                    {naira(c.total)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Sparkles}
              title="No customers yet"
              description="Your top customers by spend will appear here."
            />
          )}
        </Card>

        {/* Active payment links summary */}
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <LinkIcon className="text-primary h-5 w-5" />
            <h2 className="text-base font-semibold">Recent payment links</h2>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto gap-1 text-xs"
              onClick={() => setView("payment-links")}
            >
              View all <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
          {data?.recentLinks && data.recentLinks.length > 0 ? (
            <ul className="space-y-2">
              {data.recentLinks.map((link) => {
                const active = link.status === "ACTIVE";
                return (
                  <li
                    key={link.id}
                    className="flex items-center justify-between gap-3 rounded-xl border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{link.title}</p>
                      <p className="text-muted-foreground truncate font-mono text-xs">
                        {link.slug} · {link.usesCount} uses
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          active
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {link.status}
                      </span>
                      <span className="text-xs font-medium tabular-nums">
                        {link.amountMinor ? naira(link.amountMinor) : "Any"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={LinkIcon}
              title="No payment links yet"
              description="Create your first payment link to start collecting."
              action={
                <Button size="sm" onClick={() => setView("payment-links")} className="gap-1.5">
                  <Plus className="h-4 w-4" /> Create link
                </Button>
              }
            />
          )}
        </Card>
      </div>

      {/* ============ API keys section ============ */}
      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <KeyRound className="text-primary h-5 w-5" />
            <h2 className="text-base font-semibold">API keys</h2>
            <Badge variant="secondary" className="text-[10px]">
              {apiKeys.filter((k) => k.active).length} active
            </Badge>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Generate new key
          </Button>
        </div>

        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            API keys are shown <span className="font-semibold">only once</span> at creation. Store
            them securely — losing a key means you must revoke and recreate it.
          </p>
        </div>

        {keysLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : apiKeys.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No API keys yet"
            description="Generate an API key to integrate Turbopay payments into your website or app."
            action={
              <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
                <Plus className="h-4 w-4" /> Generate new key
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {apiKeys.map((k) => {
              const name =
                typeof k.scopes === "object" && !Array.isArray(k.scopes) && k.scopes !== null
                  ? ((k.scopes as { name?: string }).name ?? "Unnamed key")
                  : "API key";
              const isRevoked = !!k.revokedAt;
              return (
                <div
                  key={k.id}
                  className={`flex flex-wrap items-center gap-3 rounded-xl border p-4 transition-colors ${
                    isRevoked ? "opacity-60" : "hover:bg-muted/30"
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">{name}</p>
                      {isRevoked ? (
                        <Badge
                          variant="outline"
                          className="bg-red-500/10 text-[10px] text-red-600 dark:text-red-400"
                        >
                          Revoked
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400"
                        >
                          Active
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-0.5 truncate font-mono text-xs">
                      {k.prefix}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-[11px]">
                      Created {formatDate(k.createdAt, true)}
                      {k.lastUsedAt && ` · Last used ${timeAgo(k.lastUsedAt)}`}
                      {isRevoked && ` · Revoked ${timeAgo(k.revokedAt!)}`}
                    </p>
                  </div>
                  {!isRevoked && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive gap-1.5"
                      disabled={revokingId === k.id}
                      onClick={() => revokeKey(k.id)}
                    >
                      {revokingId === k.id ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Revoke
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ============ Create API key dialog ============ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate new API key</DialogTitle>
            <DialogDescription>
              Give your key a name so you can recognize it later. The full key will be shown only
              once.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="api-key-name">Key name</Label>
              <Input
                id="api-key-name"
                placeholder="e.g. Production webhook"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                maxLength={60}
                autoFocus
              />
            </div>
            <div className="bg-muted/30 rounded-xl border p-3">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                Default scopes
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["READ", "PAYMENTS", "LINKS"].map((s) => (
                  <Badge key={s} variant="secondary" className="text-[10px]">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createKey} disabled={creating} className="gap-1.5">
              {creating ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              Generate key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Show-once newly created key dialog ============ */}
      <Dialog open={!!newKey} onOpenChange={(o) => !o && setNewKey(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Save your API key
            </DialogTitle>
            <DialogDescription>
              Copy this key now and store it securely. For your security, we will never show it
              again.
            </DialogDescription>
          </DialogHeader>
          {newKey && (
            <div className="space-y-3 py-2">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase dark:text-emerald-400">
                  {newKey.name}
                </p>
                <button
                  onClick={copyNewKey}
                  className="bg-background mt-2 flex w-full items-center gap-2 rounded-lg p-3 text-left font-mono text-xs"
                >
                  <span className="min-w-0 flex-1 break-all">{newKey.key}</span>
                  {copiedKey ? (
                    <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <Copy className="text-muted-foreground h-4 w-4 shrink-0" />
                  )}
                </button>
              </div>
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <p className="text-xs text-amber-700 dark:text-amber-300">{newKey.warning}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={copyNewKey} className="gap-1.5">
              {copiedKey ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              Copy key
            </Button>
            <Button onClick={() => setNewKey(null)} className="gap-1.5">
              I&apos;ve saved it <ArrowRight className="h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "emerald" | "amber";
}) {
  const bg =
    tone === "emerald"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return (
    <Card className="tp-card-hover p-5">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2.5 text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>
    </Card>
  );
}
