"use client";

import * as React from "react";
import { useApp } from "../store";
import { PageHeader, StatCard, EmptyState } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
  Users,
  ArrowLeftRight,
  TrendingUp,
  Snowflake,
  ShieldAlert,
  RefreshCw,
  Search,
  Loader2,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { naira, nairaCompact, formatDate, timeAgo } from "@/lib/money";
import { toast } from "sonner";

interface AdminStats {
  users: number;
  transactions: number;
  volume: number;
  frozenWallets: number;
  frozenUsers: number;
  amlFlags: number;
}

interface RecentUser {
  id: string;
  fullName: string;
  username: string;
  email: string | null;
  kycTier: number;
  kycStatus: string;
  status: string;
  createdAt: string;
}

interface RecentTransaction {
  id: string;
  reference: string;
  type: string;
  direction: string;
  amountKobo: number;
  status: string;
  createdAt: string;
  userName: string | null;
  userUsername: string | null;
}

interface AmlFlag {
  id: string;
  rule: string;
  severity: string;
  description: string;
  createdAt: string;
  userName: string | null;
  userUsername: string | null;
}

interface AdminData {
  stats: AdminStats;
  recentUsers: RecentUser[];
  recentTransactions: RecentTransaction[];
  amlFlags: AmlFlag[];
}

interface CustomerRow {
  id: string;
  fullName: string;
  username: string;
  email: string | null;
  phone: string | null;
  country: string;
  role: string;
  kycTier: number;
  kycStatus: string;
  status: string;
  emailVerified: boolean;
  createdAt: string;
  wallet: { balanceKobo: number; status: string; currency: string } | null;
}

interface CustomerPage {
  users: CustomerRow[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

interface AdminTxRow {
  id: string;
  reference: string;
  type: string;
  direction: string;
  amountKobo: number;
  feeKobo: number;
  status: string;
  state: string;
  counterpartyName: string | null;
  description: string | null;
  createdAt: string;
  userName: string | null;
  userUsername: string | null;
}

interface AdminTxPage {
  transactions: AdminTxRow[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

const STATUS_TONE: Record<string, string> = {
  SUCCESS: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  PENDING: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  FAILED: "bg-red-500/10 text-red-600 dark:text-red-400",
  REVERSED: "bg-muted text-muted-foreground",
};

const USER_STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  FROZEN: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  SUSPENDED: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  CLOSED: "bg-muted text-muted-foreground",
};

const SEVERITY_TONE: Record<string, string> = {
  LOW: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  MEDIUM: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  HIGH: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const TX_TYPE_LABELS: Record<string, string> = {
  FUNDING: "Funding",
  TRANSFER: "Transfer",
  AIRTIME: "Airtime",
  DATA: "Data",
  BILL: "Bill",
  CARD_FUND: "Card fund",
  CARD_WITHDRAW: "Card withdraw",
  REWARD: "Reward",
  REFERRAL: "Referral",
  SAVINGS_DEPOSIT: "Savings",
  SAVINGS_WITHDRAW: "Savings",
  INVESTMENT: "Investment",
};

const KYC_LABELS: Record<number, string> = { 1: "Tier 1", 2: "Tier 2", 3: "Tier 3" };

export default function AdminView() {
  const { user } = useApp();
  const [data, setData] = React.useState<AdminData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState("overview");

  // customers pagination
  const [customers, setCustomers] = React.useState<CustomerPage | null>(null);
  const [custSearch, setCustSearch] = React.useState("");
  const [custPage, setCustPage] = React.useState(1);
  const [loadingCust, setLoadingCust] = React.useState(false);
  const custSearchRef = React.useRef<number | null>(null);

  // transactions pagination
  const [txns, setTxns] = React.useState<AdminTxPage | null>(null);
  const [txPage, setTxPage] = React.useState(1);
  const [txType, setTxType] = React.useState("ALL");
  const [loadingTx, setLoadingTx] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin", { cache: "no-store" });
      if (res.status === 403) {
        return; // admin gate shows on render
      }
      if (res.status === 401) {
        toast.error("Session expired. Please log in again.");
        return;
      }
      if (!res.ok) {
        toast.error("Failed to load admin data.");
        return;
      }
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const loadCustomers = React.useCallback(async (page: number, search: string) => {
    setLoadingCust(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/customers?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load customers");
        return;
      }
      setCustomers(await res.json());
    } finally {
      setLoadingCust(false);
    }
  }, []);

  const loadTxns = React.useCallback(async (page: number, type: string) => {
    setLoadingTx(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (type !== "ALL") params.set("type", type);
      const res = await fetch(`/api/admin/transactions?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load transactions");
        return;
      }
      setTxns(await res.json());
    } finally {
      setLoadingTx(false);
    }
  }, []);

  // Load customers when tab activated
  React.useEffect(() => {
    if (tab === "customers" && !customers) loadCustomers(1, "");
  }, [tab, customers, loadCustomers]);

  // Load transactions when tab activated
  React.useEffect(() => {
    if (tab === "transactions" && !txns) loadTxns(1, "ALL");
  }, [tab, txns, loadTxns]);

  // Debounced customer search
  React.useEffect(() => {
    if (tab !== "customers") return;
    if (custSearchRef.current) window.clearTimeout(custSearchRef.current);
    custSearchRef.current = window.setTimeout(() => {
      setCustPage(1);
      loadCustomers(1, custSearch);
    }, 350);
    return () => {
      if (custSearchRef.current) window.clearTimeout(custSearchRef.current);
    };
  }, [custSearch, tab, loadCustomers]);

  // Admin gate
  if (user && user.role !== "ADMIN") {
    return (
      <div className="space-y-5">
        <PageHeader title="Admin Console" subtitle="Restricted area" />
        <EmptyState
          icon={Lock}
          title="Admin access required"
          description="You don't have permission to view this page. Contact an administrator if you believe this is an error."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Admin Console" subtitle="Manage Turbopay operations" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[0,1,2,3,4].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Admin Console"
        subtitle="Manage Turbopay operations"
        actions={
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full max-w-md grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="aml">AML</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Total users" value={String(data?.stats.users ?? 0)} icon={Users} tone="default" />
            <StatCard label="Transactions" value={String(data?.stats.transactions ?? 0)} icon={ArrowLeftRight} tone="default" />
            <StatCard label="Volume" value={nairaCompact(data?.stats.volume ?? 0)} icon={TrendingUp} tone="success" />
            <StatCard
              label="Frozen wallets"
              value={String(data?.stats.frozenWallets ?? 0)}
              icon={Snowflake}
              tone={data && data.stats.frozenWallets > 0 ? "warning" : "default"}
              hint={`${data?.stats.frozenUsers ?? 0} frozen users`}
            />
            <StatCard
              label="Open AML flags"
              value={String(data?.stats.amlFlags ?? 0)}
              icon={ShieldAlert}
              tone={data && data.stats.amlFlags > 0 ? "danger" : "default"}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Recent users */}
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Recent users</h2>
                <Button size="sm" variant="ghost" onClick={() => setTab("customers")} className="text-xs">
                  View all
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-2 font-medium">User</th>
                      <th className="pb-2 pr-2 font-medium">Tier</th>
                      <th className="pb-2 pr-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.recentUsers?.map((u) => (
                      <tr key={u.id} className="border-t">
                        <td className="py-2 pr-2">
                          <p className="font-medium">{u.fullName}</p>
                          <p className="text-xs text-muted-foreground">@{u.username}</p>
                        </td>
                        <td className="py-2 pr-2 text-xs">{KYC_LABELS[u.kycTier] ?? `Tier ${u.kycTier}`}</td>
                        <td className="py-2 pr-2">
                          <Badge variant="secondary" className={`text-[10px] ${USER_STATUS_TONE[u.status] ?? ""}`}>
                            {u.status}
                          </Badge>
                        </td>
                        <td className="py-2 text-xs text-muted-foreground">{formatDate(u.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Recent transactions */}
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Recent transactions</h2>
                <Button size="sm" variant="ghost" onClick={() => setTab("transactions")} className="text-xs">
                  View all
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-2 font-medium">Reference</th>
                      <th className="pb-2 pr-2 font-medium">User</th>
                      <th className="pb-2 pr-2 font-medium">Amount</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.recentTransactions?.map((t) => (
                      <tr key={t.id} className="border-t">
                        <td className="py-2 pr-2">
                          <p className="truncate font-mono text-xs">{t.reference}</p>
                          <p className="text-xs text-muted-foreground">{TX_TYPE_LABELS[t.type] ?? t.type}</p>
                        </td>
                        <td className="py-2 pr-2 text-xs">{t.userName ?? "—"}</td>
                        <td className="py-2 pr-2 text-xs tabular-nums">{nairaCompact(t.amountKobo)}</td>
                        <td className="py-2">
                          <Badge variant="secondary" className={`text-[10px] ${STATUS_TONE[t.status] ?? ""}`}>
                            {t.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* AML flags feed */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Unresolved AML flags</h2>
              <Button size="sm" variant="ghost" onClick={() => setTab("aml")} className="text-xs">
                View all
              </Button>
            </div>
            {data?.amlFlags && data.amlFlags.length > 0 ? (
              <ul className="space-y-2">
                {data.amlFlags.slice(0, 5).map((f) => (
                  <li key={f.id} className="flex items-center gap-3 rounded-xl border p-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${SEVERITY_TONE[f.severity] ?? "bg-muted text-muted-foreground"}`}>
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{f.rule.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {f.userName ?? "Unknown"} · {f.description}
                      </p>
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${SEVERITY_TONE[f.severity] ?? ""}`}>
                      {f.severity}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={ShieldAlert}
                title="No unresolved AML flags"
                description="All clear — no suspicious activity pending review."
              />
            )}
          </Card>
        </TabsContent>

        {/* Customers */}
        <TabsContent value="customers" className="mt-5 space-y-4">
          <Card className="p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={custSearch}
                onChange={(e) => setCustSearch(e.target.value)}
                placeholder="Search by name, username, email, or phone..."
                className="pl-9"
              />
            </div>
          </Card>
          <Card className="p-5">
            {loadingCust && !customers ? (
              <div className="space-y-2">
                {[0,1,2,3,4].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
              </div>
            ) : customers && customers.users.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="pb-2 pr-2 font-medium">User</th>
                        <th className="pb-2 pr-2 font-medium">Contact</th>
                        <th className="pb-2 pr-2 font-medium">Tier</th>
                        <th className="pb-2 pr-2 font-medium">Balance</th>
                        <th className="pb-2 pr-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customers.users.map((u) => (
                        <tr key={u.id} className="border-t">
                          <td className="py-2 pr-2">
                            <p className="font-medium">{u.fullName}</p>
                            <p className="text-xs text-muted-foreground">@{u.username}</p>
                          </td>
                          <td className="py-2 pr-2 text-xs text-muted-foreground">
                            {u.email || "—"}
                            {u.phone && <><br />{u.phone}</>}
                          </td>
                          <td className="py-2 pr-2 text-xs">
                            {KYC_LABELS[u.kycTier] ?? `Tier ${u.kycTier}`}
                            <br />
                            <span className="text-muted-foreground">{u.kycStatus}</span>
                          </td>
                          <td className="py-2 pr-2 text-xs tabular-nums">
                            {u.wallet ? naira(u.wallet.balanceKobo) : "—"}
                            {u.wallet && u.wallet.status !== "ACTIVE" && (
                              <Badge variant="outline" className="ml-1 text-[10px]">{u.wallet.status}</Badge>
                            )}
                          </td>
                          <td className="py-2 pr-2">
                            <Badge variant="secondary" className={`text-[10px] ${USER_STATUS_TONE[u.status] ?? ""}`}>
                              {u.status}
                            </Badge>
                          </td>
                          <td className="py-2 text-xs text-muted-foreground">{formatDate(u.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <p>{customers.total} total · page {customers.page}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={customers.page <= 1 || loadingCust}
                      onClick={() => {
                        const p = Math.max(1, customers.page - 1);
                        setCustPage(p);
                        loadCustomers(p, custSearch);
                      }}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!customers.hasMore || loadingCust}
                      onClick={() => {
                        const p = customers.page + 1;
                        setCustPage(p);
                        loadCustomers(p, custSearch);
                      }}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState icon={Users} title="No customers found" description="Try a different search." />
            )}
          </Card>
        </TabsContent>

        {/* Transactions */}
        <TabsContent value="transactions" className="mt-5 space-y-4">
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Filter:</span>
              <Select value={txType} onValueChange={(v) => { setTxType(v); setTxPage(1); loadTxns(1, v); }}>
                <SelectTrigger className="h-8 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All types</SelectItem>
                  {Object.entries(TX_TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Card>
          <Card className="p-5">
            {loadingTx && !txns ? (
              <div className="space-y-2">
                {[0,1,2,3,4].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
              </div>
            ) : txns && txns.transactions.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="pb-2 pr-2 font-medium">Reference</th>
                        <th className="pb-2 pr-2 font-medium">User</th>
                        <th className="pb-2 pr-2 font-medium">Type</th>
                        <th className="pb-2 pr-2 font-medium">Amount</th>
                        <th className="pb-2 pr-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txns.transactions.map((t) => (
                        <tr key={t.id} className="border-t">
                          <td className="py-2 pr-2">
                            <p className="truncate font-mono text-xs">{t.reference}</p>
                          </td>
                          <td className="py-2 pr-2 text-xs">
                            {t.userName ?? "—"}
                            {t.userUsername && <span className="text-muted-foreground"> · @{t.userUsername}</span>}
                          </td>
                          <td className="py-2 pr-2 text-xs">{TX_TYPE_LABELS[t.type] ?? t.type}</td>
                          <td className="py-2 pr-2 text-xs tabular-nums">
                            {naira(t.amountKobo)}
                            {t.feeKobo > 0 && <span className="text-muted-foreground"> +{nairaCompact(t.feeKobo)} fee</span>}
                          </td>
                          <td className="py-2 pr-2">
                            <Badge variant="secondary" className={`text-[10px] ${STATUS_TONE[t.status] ?? ""}`}>
                              {t.status}
                            </Badge>
                          </td>
                          <td className="py-2 text-xs text-muted-foreground">{formatDate(t.createdAt, true)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <p>{txns.total} total · page {txns.page}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={txns.page <= 1 || loadingTx}
                      onClick={() => {
                        const p = Math.max(1, txns.page - 1);
                        setTxPage(p);
                        loadTxns(p, txType);
                      }}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!txns.hasMore || loadingTx}
                      onClick={() => {
                        const p = txns.page + 1;
                        setTxPage(p);
                        loadTxns(p, txType);
                      }}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState icon={ArrowLeftRight} title="No transactions found" description="Try a different filter." />
            )}
          </Card>
        </TabsContent>

        {/* AML */}
        <TabsContent value="aml" className="mt-5">
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">AML flags feed</h2>
              <Badge variant="secondary" className="ml-auto">
                {data?.stats.amlFlags ?? 0} unresolved
              </Badge>
            </div>
            {data?.amlFlags && data.amlFlags.length > 0 ? (
              <ul className="space-y-2">
                {data.amlFlags.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 rounded-xl border p-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${SEVERITY_TONE[f.severity] ?? "bg-muted text-muted-foreground"}`}>
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {f.rule.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {f.userName ?? "Unknown user"}{f.userUsername ? ` · @${f.userUsername}` : ""} · {f.description}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(f.createdAt)} · {formatDate(f.createdAt, true)}</p>
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${SEVERITY_TONE[f.severity] ?? ""}`}>
                      {f.severity}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={ShieldAlert}
                title="No unresolved AML flags"
                description="All clear — no suspicious activity pending review."
              />
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
