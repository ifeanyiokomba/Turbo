"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useApp } from "../store";
import { PageHeader, StatCard, EmptyState } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  Shield,
  RefreshCw,
  Search,
  Loader2,
  Lock,
  AlertTriangle,
  PiggyBank,
  ScrollText,
  Download,
  Server,
  GitBranch,
  Webhook,
  Flag,
  History,
  Database,
  Settings2,
  Activity,
  Gauge,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  Bell,
  Inbox,
  CircuitBoard,
  ShieldCheck,
  Network,
  Plug,
  Cpu,
  Building2,
  FileSpreadsheet,
} from "lucide-react";
import { naira, nairaCompact, formatDate, timeAgo } from "@/lib/money";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import ProvidersTab from "./admin/providers-tab";
import CapabilitiesTab from "./admin/capabilities-tab";
import RoutingTab from "./admin/routing-tab";
import WebhooksTab from "./admin/webhooks-tab";
import ComplianceTab from "./admin/compliance-tab";
import FeatureFlagsTab from "./admin/feature-flags-tab";
import ConfigHistoryTab from "./admin/config-history-tab";
import TeamTab from "./admin/team-tab";
import RolesTab from "./admin/roles-tab";
// Plug-and-Play Onboarding wizard (3-step: verify → discover → finalize).
// Lazy-loaded — only needed when an admin clicks the "Onboarding" tab.
const OnboardingTab = dynamic(() => import("./admin/onboarding-tab").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
    </div>
  ),
});
// Architecture Compliance dashboard (spec mapping + flow diagram).
// Lazy-loaded — only needed when an admin clicks the "Architecture" tab.
const ArchitectureTab = dynamic(() => import("./admin/architecture-tab").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
    </div>
  ),
});
// GCR tab is lazy-loaded to keep the admin initial bundle lean — the GCR
// catalogue is large (~2000 lines) and only needed when an admin clicks the
// "GCR" tab. dynamic() with ssr:false prevents server-side evaluation.
const GcrTab = dynamic(() => import("./admin/gcr-tab").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
    </div>
  ),
});
// Database Architecture tab (Chapter 8) — lazy-loaded for the same reason.
const DatabaseTab = dynamic(() => import("./admin/database-tab").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
    </div>
  ),
});
// Event Bus tab (Chapter 9) — the nervous system.
const EventBusTab = dynamic(() => import("./admin/event-bus-tab").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
    </div>
  ),
});
// ZTSA Security Command Center (Chapter 10) — Zero Trust architecture.
const ZtsaTab = dynamic(() => import("./admin/ztsa-tab").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
    </div>
  ),
});
// MTPA Multi-Tenant Platform (Chapter 11) — one TurboCore, unlimited businesses.
const MtpaTab = dynamic(() => import("./admin/mtpa-tab").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
    </div>
  ),
});
// OMO Observability & Operations (Chapter 12) — the 5 pillars.
const OmoTab = dynamic(() => import("./admin/omo-tab").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
    </div>
  ),
});
// Bulk Payments tab — process thousands of payments in batches.
const BulkPaymentsTab = dynamic(() => import("./admin/bulk-payments-tab").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
    </div>
  ),
});
// Security Center tab — lazy-loaded. Surfaces runtime security posture
// (CSP, CSRF, XSS, headers, cookies, sanitizers). Kept lazy so the heavy
// sanitizer live-tester + headers inspector only load when an admin clicks
// the "Security" tab.
const SecurityCenterTab = dynamic(
  () => import("./admin/security-center-tab").then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    ),
  }
);

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

interface TopSavingsProduct {
  id: string;
  name: string;
  type: string;
  interestBps: number;
  lockDays: number;
  depositCount: number;
  totalDepositsKobo: number;
}

interface TopInvestmentProduct {
  id: string;
  name: string;
  type: string;
  riskLevel: string;
  provider: string;
  expectedReturnBps: number;
  holderCount: number;
  totalValueKobo: number;
  totalPrincipalKobo: number;
}

interface SavingsInvestmentsData {
  savings: {
    totalDepositsKobo: number;
    totalInterestAccruedKobo: number;
    totalWithdrawalsKobo: number;
    activeSavers: number;
  };
  investments: {
    totalValueKobo: number;
    totalPrincipalKobo: number;
    activeInvestors: number;
  };
  topSavingsProducts: TopSavingsProduct[];
  topInvestmentProducts: TopInvestmentProduct[];
}

interface AuditLogRow {
  id: string;
  action: string;
  category: string;
  severity: string;
  ip: string | null;
  userAgent: string | null;
  metadata: string | null;
  createdAt: string;
  userName: string | null;
  userUsername: string | null;
}

interface AuditPage {
  logs: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
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

// Audit log severity tones — INFO=slate, WARN=amber, ERROR=red, CRITICAL=red bold
const AUDIT_SEVERITY_TONE: Record<string, string> = {
  INFO: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  WARN: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  ERROR: "bg-red-500/10 text-red-600 dark:text-red-400",
  CRITICAL: "bg-red-500/15 text-red-700 dark:text-red-300 font-bold",
};

const RISK_TONE: Record<string, string> = {
  LOW: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  MEDIUM: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  HIGH: "bg-red-500/10 text-red-600 dark:text-red-400",
};

// Tiny CSV export helper — escapes commas/quotes/newlines and triggers a download.
function exportCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
) {
  const escape = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))];
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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

  // savings + investments aggregate
  const [savingsInv, setSavingsInv] = React.useState<SavingsInvestmentsData | null>(null);
  const [loadingSavings, setLoadingSavings] = React.useState(false);

  // audit log
  const [audit, setAudit] = React.useState<AuditPage | null>(null);
  const [loadingAudit, setLoadingAudit] = React.useState(false);

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
      const res = await fetch(`/api/admin/transactions?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        toast.error("Failed to load transactions");
        return;
      }
      setTxns(await res.json());
    } finally {
      setLoadingTx(false);
    }
  }, []);

  const loadSavingsInv = React.useCallback(async () => {
    setLoadingSavings(true);
    try {
      const res = await fetch("/api/admin/savings-investments", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load savings & investments data");
        return;
      }
      setSavingsInv(await res.json());
    } finally {
      setLoadingSavings(false);
    }
  }, []);

  const loadAudit = React.useCallback(async () => {
    setLoadingAudit(true);
    try {
      const res = await fetch("/api/admin/audit?limit=50", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load audit log");
        return;
      }
      setAudit(await res.json());
    } finally {
      setLoadingAudit(false);
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

  // Load savings & investments when tab activated
  React.useEffect(() => {
    if (tab === "savings" && !savingsInv) loadSavingsInv();
  }, [tab, savingsInv, loadSavingsInv]);

  // Load audit log when tab activated
  React.useEffect(() => {
    if (tab === "audit" && !audit) loadAudit();
  }, [tab, audit, loadAudit]);

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
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
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
        <TabsList className="scrollbar-thin flex w-full max-w-4xl overflow-x-auto">
          <TabsTrigger value="overview" className="min-w-[100px] flex-1">
            Overview
          </TabsTrigger>
          <TabsTrigger value="customers" className="min-w-[100px] flex-1">
            Customers
          </TabsTrigger>
          <TabsTrigger value="transactions" className="min-w-[100px] flex-1">
            Transactions
          </TabsTrigger>
          <TabsTrigger value="bulk-payments" className="min-w-[120px] flex-1 gap-1">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Bulk Pay
          </TabsTrigger>
          <TabsTrigger value="savings" className="min-w-[100px] flex-1">
            Savings
          </TabsTrigger>
          <TabsTrigger value="aml" className="min-w-[100px] flex-1">
            AML
          </TabsTrigger>
          <TabsTrigger value="audit" className="min-w-[100px] flex-1">
            Audit Log
          </TabsTrigger>
          <TabsTrigger value="providers" className="min-w-[100px] flex-1 gap-1">
            <Server className="h-3.5 w-3.5" />
            Providers
          </TabsTrigger>
          <TabsTrigger value="onboarding" className="min-w-[110px] flex-1 gap-1">
            <Plug className="h-3.5 w-3.5" />
            Onboarding
          </TabsTrigger>
          <TabsTrigger value="capabilities" className="min-w-[110px] flex-1 gap-1">
            <Settings2 className="h-3.5 w-3.5" />
            Capabilities
          </TabsTrigger>
          <TabsTrigger value="routing" className="min-w-[100px] flex-1 gap-1">
            <GitBranch className="h-3.5 w-3.5" />
            Routing
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="min-w-[100px] flex-1 gap-1">
            <Webhook className="h-3.5 w-3.5" />
            Webhooks
          </TabsTrigger>
          <TabsTrigger value="compliance" className="min-w-[110px] flex-1 gap-1">
            <ShieldAlert className="h-3.5 w-3.5" />
            Compliance
          </TabsTrigger>
          <TabsTrigger value="flags" className="min-w-[100px] flex-1 gap-1">
            <Flag className="h-3.5 w-3.5" />
            Flags
          </TabsTrigger>
          <TabsTrigger value="history" className="min-w-[100px] flex-1 gap-1">
            <History className="h-3.5 w-3.5" />
            Config History
          </TabsTrigger>
          <TabsTrigger value="team" className="min-w-[100px] flex-1 gap-1">
            <Users className="h-3.5 w-3.5" />
            Team
          </TabsTrigger>
          <TabsTrigger value="roles" className="min-w-[120px] flex-1 gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            Roles
          </TabsTrigger>
          <TabsTrigger value="gcr" className="min-w-[100px] flex-1 gap-1">
            <Network className="h-3.5 w-3.5" />
            GCR
          </TabsTrigger>
          <TabsTrigger value="database" className="min-w-[110px] flex-1 gap-1">
            <Database className="h-3.5 w-3.5" />
            Database
          </TabsTrigger>
          <TabsTrigger value="event-bus" className="min-w-[110px] flex-1 gap-1">
            <Zap className="h-3.5 w-3.5" />
            Event Bus
          </TabsTrigger>
          <TabsTrigger value="ztsa" className="min-w-[120px] flex-1 gap-1">
            <Shield className="h-3.5 w-3.5" />
            Zero Trust
          </TabsTrigger>
          <TabsTrigger value="mtpa" className="min-w-[110px] flex-1 gap-1">
            <Building2 className="h-3.5 w-3.5" />
            Tenants
          </TabsTrigger>
          <TabsTrigger value="omo" className="min-w-[100px] flex-1 gap-1">
            <Activity className="h-3.5 w-3.5" />
            Observability
          </TabsTrigger>
          <TabsTrigger value="security" className="min-w-[100px] flex-1 gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            Security
          </TabsTrigger>
          <TabsTrigger value="architecture" className="min-w-[120px] flex-1 gap-1">
            <Cpu className="h-3.5 w-3.5" />
            Architecture
          </TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-5 space-y-5">
          {/* Real-time monitoring dashboard */}
          <MonitoringDashboard />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard
              label="Total users"
              value={String(data?.stats.users ?? 0)}
              icon={Users}
              tone="default"
            />
            <StatCard
              label="Transactions"
              value={String(data?.stats.transactions ?? 0)}
              icon={ArrowLeftRight}
              tone="default"
            />
            <StatCard
              label="Volume"
              value={nairaCompact(data?.stats.volume ?? 0)}
              icon={TrendingUp}
              tone="success"
            />
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
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTab("customers")}
                  className="text-xs"
                >
                  View all
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-left text-xs">
                      <th className="pr-2 pb-2 font-medium">User</th>
                      <th className="pr-2 pb-2 font-medium">Tier</th>
                      <th className="pr-2 pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.recentUsers?.map((u) => (
                      <tr key={u.id} className="hover:bg-muted/40 border-t transition-colors">
                        <td className="py-2 pr-2">
                          <p className="font-medium">{u.fullName}</p>
                          <p className="text-muted-foreground text-xs">@{u.username}</p>
                        </td>
                        <td className="py-2 pr-2 text-xs">
                          {KYC_LABELS[u.kycTier] ?? `Tier ${u.kycTier}`}
                        </td>
                        <td className="py-2 pr-2">
                          <Badge
                            variant="secondary"
                            className={`text-[10px] ${USER_STATUS_TONE[u.status] ?? ""}`}
                          >
                            {u.status}
                          </Badge>
                        </td>
                        <td className="text-muted-foreground py-2 text-xs">
                          {formatDate(u.createdAt)}
                        </td>
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
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTab("transactions")}
                  className="text-xs"
                >
                  View all
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-left text-xs">
                      <th className="pr-2 pb-2 font-medium">Reference</th>
                      <th className="pr-2 pb-2 font-medium">User</th>
                      <th className="pr-2 pb-2 font-medium">Amount</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.recentTransactions?.map((t) => (
                      <tr key={t.id} className="hover:bg-muted/40 border-t transition-colors">
                        <td className="py-2 pr-2">
                          <p className="truncate font-mono text-xs">{t.reference}</p>
                          <p className="text-muted-foreground text-xs">
                            {TX_TYPE_LABELS[t.type] ?? t.type}
                          </p>
                        </td>
                        <td className="py-2 pr-2 text-xs">{t.userName ?? "—"}</td>
                        <td className="py-2 pr-2 text-xs tabular-nums">
                          {nairaCompact(t.amountKobo)}
                        </td>
                        <td className="py-2">
                          <Badge
                            variant="secondary"
                            className={`text-[10px] ${STATUS_TONE[t.status] ?? ""}`}
                          >
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
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${SEVERITY_TONE[f.severity] ?? "bg-muted text-muted-foreground"}`}
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {f.rule
                          .replace(/_/g, " ")
                          .toLowerCase()
                          .replace(/\b\w/g, (c) => c.toUpperCase())}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {f.userName ?? "Unknown"} · {f.description}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${SEVERITY_TONE[f.severity] ?? ""}`}
                    >
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  value={custSearch}
                  onChange={(e) => setCustSearch(e.target.value)}
                  placeholder="Search by name, username, email, or phone..."
                  className="pl-9"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={!customers || customers.users.length === 0}
                onClick={() => {
                  if (!customers) return;
                  exportCsv(
                    `turbopay-customers-${new Date().toISOString().slice(0, 10)}.csv`,
                    [
                      "Name",
                      "Username",
                      "Email",
                      "Phone",
                      "Country",
                      "Role",
                      "KYC Tier",
                      "KYC Status",
                      "Status",
                      "Balance (NGN)",
                      "Joined",
                    ],
                    customers.users.map((u) => [
                      u.fullName,
                      u.username,
                      u.email ?? "",
                      u.phone ?? "",
                      u.country,
                      u.role,
                      u.kycTier,
                      u.kycStatus,
                      u.status,
                      u.wallet ? (u.wallet.balanceKobo / 100).toFixed(2) : "0.00",
                      new Date(u.createdAt).toISOString(),
                    ])
                  );
                  toast.success("Customers exported to CSV");
                }}
              >
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </div>
          </Card>
          <Card className="p-5">
            {loadingCust && !customers ? (
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 rounded-xl" />
                ))}
              </div>
            ) : customers && customers.users.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground text-left text-xs">
                        <th className="pr-2 pb-2 font-medium">User</th>
                        <th className="pr-2 pb-2 font-medium">Contact</th>
                        <th className="pr-2 pb-2 font-medium">Tier</th>
                        <th className="pr-2 pb-2 font-medium">Balance</th>
                        <th className="pr-2 pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customers.users.map((u) => (
                        <tr key={u.id} className="hover:bg-muted/40 border-t transition-colors">
                          <td className="py-2 pr-2">
                            <p className="font-medium">{u.fullName}</p>
                            <p className="text-muted-foreground text-xs">@{u.username}</p>
                          </td>
                          <td className="text-muted-foreground py-2 pr-2 text-xs">
                            {u.email || "—"}
                            {u.phone && (
                              <>
                                <br />
                                {u.phone}
                              </>
                            )}
                          </td>
                          <td className="py-2 pr-2 text-xs">
                            {KYC_LABELS[u.kycTier] ?? `Tier ${u.kycTier}`}
                            <br />
                            <span className="text-muted-foreground">{u.kycStatus}</span>
                          </td>
                          <td className="py-2 pr-2 text-xs tabular-nums">
                            {u.wallet ? naira(u.wallet.balanceKobo) : "—"}
                            {u.wallet && u.wallet.status !== "ACTIVE" && (
                              <Badge variant="outline" className="ml-1 text-[10px]">
                                {u.wallet.status}
                              </Badge>
                            )}
                          </td>
                          <td className="py-2 pr-2">
                            <Badge
                              variant="secondary"
                              className={`text-[10px] ${USER_STATUS_TONE[u.status] ?? ""}`}
                            >
                              {u.status}
                            </Badge>
                          </td>
                          <td className="text-muted-foreground py-2 text-xs">
                            {formatDate(u.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-muted-foreground mt-4 flex items-center justify-between text-xs">
                  <p>
                    {customers.total} total · page {customers.page}
                  </p>
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
              <EmptyState
                icon={Users}
                title="No customers found"
                description="Try a different search."
              />
            )}
          </Card>
        </TabsContent>

        {/* Transactions */}
        <TabsContent value="transactions" className="mt-5 space-y-4">
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-xs">Filter:</span>
              <Select
                value={txType}
                onValueChange={(v) => {
                  setTxType(v);
                  setTxPage(1);
                  loadTxns(1, v);
                }}
              >
                <SelectTrigger className="h-8 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All types</SelectItem>
                  {Object.entries(TX_TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto gap-1.5"
                disabled={!txns || txns.transactions.length === 0}
                onClick={() => {
                  if (!txns) return;
                  exportCsv(
                    `turbopay-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
                    [
                      "Reference",
                      "User",
                      "Username",
                      "Type",
                      "Direction",
                      "Amount (NGN)",
                      "Fee (NGN)",
                      "Status",
                      "State",
                      "Counterparty",
                      "Description",
                      "Date",
                    ],
                    txns.transactions.map((t) => [
                      t.reference,
                      t.userName ?? "",
                      t.userUsername ?? "",
                      t.type,
                      t.direction,
                      (t.amountKobo / 100).toFixed(2),
                      (t.feeKobo / 100).toFixed(2),
                      t.status,
                      t.state,
                      t.counterpartyName ?? "",
                      t.description ?? "",
                      new Date(t.createdAt).toISOString(),
                    ])
                  );
                  toast.success("Transactions exported to CSV");
                }}
              >
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </div>
          </Card>
          <Card className="p-5">
            {loadingTx && !txns ? (
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 rounded-xl" />
                ))}
              </div>
            ) : txns && txns.transactions.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground text-left text-xs">
                        <th className="pr-2 pb-2 font-medium">Reference</th>
                        <th className="pr-2 pb-2 font-medium">User</th>
                        <th className="pr-2 pb-2 font-medium">Type</th>
                        <th className="pr-2 pb-2 font-medium">Amount</th>
                        <th className="pr-2 pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txns.transactions.map((t) => (
                        <tr key={t.id} className="hover:bg-muted/40 border-t transition-colors">
                          <td className="py-2 pr-2">
                            <p className="truncate font-mono text-xs">{t.reference}</p>
                          </td>
                          <td className="py-2 pr-2 text-xs">
                            {t.userName ?? "—"}
                            {t.userUsername && (
                              <span className="text-muted-foreground"> · @{t.userUsername}</span>
                            )}
                          </td>
                          <td className="py-2 pr-2 text-xs">{TX_TYPE_LABELS[t.type] ?? t.type}</td>
                          <td className="py-2 pr-2 text-xs tabular-nums">
                            {naira(t.amountKobo)}
                            {t.feeKobo > 0 && (
                              <span className="text-muted-foreground">
                                {" "}
                                +{nairaCompact(t.feeKobo)} fee
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-2">
                            <Badge
                              variant="secondary"
                              className={`text-[10px] ${STATUS_TONE[t.status] ?? ""}`}
                            >
                              {t.status}
                            </Badge>
                          </td>
                          <td className="text-muted-foreground py-2 text-xs">
                            {formatDate(t.createdAt, true)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-muted-foreground mt-4 flex items-center justify-between text-xs">
                  <p>
                    {txns.total} total · page {txns.page}
                  </p>
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
              <EmptyState
                icon={ArrowLeftRight}
                title="No transactions found"
                description="Try a different filter."
              />
            )}
          </Card>
        </TabsContent>

        {/* Bulk Payments */}
        <TabsContent value="bulk-payments" className="mt-5">
          <BulkPaymentsTab />
        </TabsContent>

        {/* Savings & Investments */}
        <TabsContent value="savings" className="mt-5 space-y-5">
          {loadingSavings && !savingsInv ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-28 rounded-2xl" />
                ))}
              </div>
              <Skeleton className="h-72 rounded-2xl" />
            </div>
          ) : savingsInv ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard
                  label="Savings deposits"
                  value={nairaCompact(savingsInv.savings.totalDepositsKobo)}
                  icon={PiggyBank}
                  tone="success"
                />
                <StatCard
                  label="Interest accrued"
                  value={nairaCompact(savingsInv.savings.totalInterestAccruedKobo)}
                  icon={TrendingUp}
                  tone="success"
                  hint={`${savingsInv.savings.activeSavers} active savers`}
                />
                <StatCard
                  label="Savings withdrawn"
                  value={nairaCompact(savingsInv.savings.totalWithdrawalsKobo)}
                  icon={ArrowLeftRight}
                  tone="default"
                />
                <StatCard
                  label="Investments value"
                  value={nairaCompact(savingsInv.investments.totalValueKobo)}
                  icon={TrendingUp}
                  tone="success"
                />
                <StatCard
                  label="Active investors"
                  value={String(savingsInv.investments.activeInvestors)}
                  icon={Users}
                  tone="default"
                  hint={`${nairaCompact(savingsInv.investments.totalPrincipalKobo)} principal`}
                />
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <Card className="p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <PiggyBank className="text-primary h-5 w-5" />
                    <h2 className="text-sm font-semibold">Top savings products</h2>
                    <span className="text-muted-foreground ml-auto text-xs">by deposit volume</span>
                  </div>
                  {savingsInv.topSavingsProducts.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-muted-foreground text-left text-xs">
                            <th className="pr-2 pb-2 font-medium">Product</th>
                            <th className="pr-2 pb-2 font-medium">Rate</th>
                            <th className="pr-2 pb-2 font-medium">Deposits</th>
                            <th className="pb-2 font-medium">Volume</th>
                          </tr>
                        </thead>
                        <tbody>
                          {savingsInv.topSavingsProducts.map((p) => (
                            <tr key={p.id} className="hover:bg-muted/40 border-t transition-colors">
                              <td className="py-2 pr-2">
                                <p className="font-medium">{p.name}</p>
                                <p className="text-muted-foreground text-xs">{p.type}</p>
                              </td>
                              <td className="py-2 pr-2 text-xs">
                                <Badge
                                  variant="secondary"
                                  className="bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400"
                                >
                                  {(p.interestBps / 100).toFixed(1)}%
                                </Badge>
                              </td>
                              <td className="py-2 pr-2 text-xs tabular-nums">{p.depositCount}</td>
                              <td className="py-2 text-xs tabular-nums">
                                {naira(p.totalDepositsKobo)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState
                      icon={PiggyBank}
                      title="No savings activity yet"
                      description="Deposits will show up here once customers start saving."
                    />
                  )}
                </Card>

                <Card className="p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <TrendingUp className="text-primary h-5 w-5" />
                    <h2 className="text-sm font-semibold">Top investment products</h2>
                    <span className="text-muted-foreground ml-auto text-xs">by holders</span>
                  </div>
                  {savingsInv.topInvestmentProducts.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-muted-foreground text-left text-xs">
                            <th className="pr-2 pb-2 font-medium">Product</th>
                            <th className="pr-2 pb-2 font-medium">Risk</th>
                            <th className="pr-2 pb-2 font-medium">Holders</th>
                            <th className="pb-2 font-medium">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {savingsInv.topInvestmentProducts.map((p) => (
                            <tr key={p.id} className="hover:bg-muted/40 border-t transition-colors">
                              <td className="py-2 pr-2">
                                <p className="font-medium">{p.name}</p>
                                <p className="text-muted-foreground text-xs">
                                  {p.provider} · {p.type}
                                </p>
                              </td>
                              <td className="py-2 pr-2 text-xs">
                                <Badge
                                  variant="secondary"
                                  className={`text-[10px] ${RISK_TONE[p.riskLevel] ?? ""}`}
                                >
                                  {p.riskLevel}
                                </Badge>
                              </td>
                              <td className="py-2 pr-2 text-xs tabular-nums">{p.holderCount}</td>
                              <td className="py-2 text-xs tabular-nums">
                                {naira(p.totalValueKobo)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState
                      icon={TrendingUp}
                      title="No investments yet"
                      description="Active holdings will appear here once users invest."
                    />
                  )}
                </Card>
              </div>
            </>
          ) : (
            <EmptyState icon={PiggyBank} title="No savings data available" />
          )}
        </TabsContent>

        {/* AML */}
        <TabsContent value="aml" className="mt-5">
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <ShieldAlert className="text-primary h-5 w-5" />
              <h2 className="text-base font-semibold">AML flags feed</h2>
              <Badge variant="secondary" className="ml-auto">
                {data?.stats.amlFlags ?? 0} unresolved
              </Badge>
            </div>
            {data?.amlFlags && data.amlFlags.length > 0 ? (
              <ul className="space-y-2">
                {data.amlFlags.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 rounded-xl border p-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${SEVERITY_TONE[f.severity] ?? "bg-muted text-muted-foreground"}`}
                    >
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {f.rule
                          .replace(/_/g, " ")
                          .toLowerCase()
                          .replace(/\b\w/g, (c) => c.toUpperCase())}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {f.userName ?? "Unknown user"}
                        {f.userUsername ? ` · @${f.userUsername}` : ""} · {f.description}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {timeAgo(f.createdAt)} · {formatDate(f.createdAt, true)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${SEVERITY_TONE[f.severity] ?? ""}`}
                    >
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
        {/* Audit Log */}
        <TabsContent value="audit" className="mt-5 space-y-4">
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <ScrollText className="text-primary h-5 w-5" />
              <h2 className="text-base font-semibold">Audit log</h2>
              <Badge variant="secondary" className="ml-auto">
                {audit?.total ?? 0} total
              </Badge>
            </div>
            {loadingAudit && !audit ? (
              <div className="space-y-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 rounded-xl" />
                ))}
              </div>
            ) : audit && audit.logs.length > 0 ? (
              <div className="scrollbar-thin max-h-[32rem] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-card sticky top-0 z-10">
                    <tr className="text-muted-foreground text-left text-xs">
                      <th className="pr-2 pb-2 font-medium">Action</th>
                      <th className="pr-2 pb-2 font-medium">Category</th>
                      <th className="pr-2 pb-2 font-medium">Severity</th>
                      <th className="pr-2 pb-2 font-medium">User</th>
                      <th className="pr-2 pb-2 font-medium">IP</th>
                      <th className="pb-2 font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.logs.map((l) => (
                      <tr key={l.id} className="hover:bg-muted/40 border-t transition-colors">
                        <td className="py-2 pr-2">
                          <p className="font-mono text-xs font-medium">{l.action}</p>
                          {l.metadata && (
                            <p className="text-muted-foreground mt-0.5 max-w-[18rem] truncate text-[11px]">
                              {l.metadata}
                            </p>
                          )}
                        </td>
                        <td className="py-2 pr-2 text-xs">{l.category}</td>
                        <td className="py-2 pr-2">
                          <Badge
                            variant="secondary"
                            className={`text-[10px] ${AUDIT_SEVERITY_TONE[l.severity] ?? "bg-muted text-muted-foreground"}`}
                          >
                            {l.severity}
                          </Badge>
                        </td>
                        <td className="py-2 pr-2 text-xs">
                          {l.userName ?? "—"}
                          {l.userUsername && (
                            <span className="text-muted-foreground"> · @{l.userUsername}</span>
                          )}
                        </td>
                        <td className="text-muted-foreground py-2 pr-2 font-mono text-xs">
                          {l.ip ?? "—"}
                        </td>
                        <td className="text-muted-foreground py-2 text-xs">
                          {formatDate(l.createdAt, true)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={ScrollText}
                title="No audit entries"
                description="System events will appear here as users interact with the platform."
              />
            )}
          </Card>
        </TabsContent>

        {/* Providers */}
        <TabsContent value="providers" className="mt-5">
          <ProvidersTab />
        </TabsContent>

        {/* Plug-and-Play Onboarding wizard */}
        <TabsContent value="onboarding" className="mt-5">
          <OnboardingTab />
        </TabsContent>

        {/* Capabilities */}
        <TabsContent value="capabilities" className="mt-5">
          <CapabilitiesTab />
        </TabsContent>

        {/* Routing */}
        <TabsContent value="routing" className="mt-5">
          <RoutingTab />
        </TabsContent>

        {/* Webhooks */}
        <TabsContent value="webhooks" className="mt-5">
          <WebhooksTab />
        </TabsContent>

        {/* Compliance (TurboCore) */}
        <TabsContent value="compliance" className="mt-5">
          <ComplianceTab />
        </TabsContent>

        {/* Feature Flags */}
        <TabsContent value="flags" className="mt-5">
          <FeatureFlagsTab />
        </TabsContent>

        {/* Config History */}
        <TabsContent value="history" className="mt-5">
          <ConfigHistoryTab />
        </TabsContent>

        {/* Team management */}
        <TabsContent value="team" className="mt-5">
          <TeamTab />
        </TabsContent>

        {/* Roles & Permissions (RBAC explorer) */}
        <TabsContent value="roles" className="mt-5">
          <RolesTab />
        </TabsContent>

        {/* Global Capability Registry (Chapter 7) */}
        <TabsContent value="gcr" className="mt-5">
          <GcrTab />
        </TabsContent>

        {/* Database Architecture (Chapter 8) */}
        <TabsContent value="database" className="mt-5">
          <DatabaseTab />
        </TabsContent>

        {/* Event Bus (Chapter 9) — the nervous system */}
        <TabsContent value="event-bus" className="mt-5">
          <EventBusTab />
        </TabsContent>

        {/* ZTSA Security Command Center (Chapter 10) */}
        <TabsContent value="ztsa" className="mt-5">
          <ZtsaTab />
        </TabsContent>

        {/* MTPA Multi-Tenant Platform (Chapter 11) */}
        <TabsContent value="mtpa" className="mt-5">
          <MtpaTab />
        </TabsContent>

        {/* OMO Observability & Operations (Chapter 12) */}
        <TabsContent value="omo" className="mt-5">
          <OmoTab />
        </TabsContent>

        {/* Security Center — technical security posture (CSP/CSRF/XSS/headers) */}
        <TabsContent value="security" className="mt-5">
          <SecurityCenterTab />
        </TabsContent>

        {/* Architecture Compliance dashboard (spec mapping + flow diagram) */}
        <TabsContent value="architecture" className="mt-5">
          <ArchitectureTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ================================================================== */
/* Monitoring Dashboard — real-time KPIs, live tx feed, provider       */
/* health, error breakdown, queue health, auto-refresh toggle           */
/* ================================================================== */

interface MonitoringData {
  generatedAt: string;
  system: {
    txTodayCount: number;
    txTodaySuccessCount: number;
    txTodayFailedCount: number;
    successRatePct: number;
    avgProcessingMs: number;
    activeUsers24h: number;
  };
  volume: {
    totalTodayKobo: number;
    feesTodayKobo: number;
    largestTodayKobo: number;
    largestTodayRef: string | null;
    largestTodayUser: string | null;
  };
  providerHealth: {
    code: string;
    displayName: string;
    enabled: boolean;
    healthScore: number;
    circuitState: string;
    successRate: number;
    avgLatencyMs: number;
    sampleCount: number;
  }[];
  errorBreakdown: { label: string; count: number }[];
  queues: {
    pendingOutbox: number;
    failedOutbox: number;
    stuckTransactions: number;
    pendingCronTasks: number;
  };
  alerts: {
    unresolvedAml: number;
    openComplianceCases: number;
    failedWebhooks: number;
    openAlerts: number;
  };
  liveFeed: {
    id: string;
    reference: string;
    type: string;
    direction: string;
    amountKobo: number;
    status: string;
    createdAt: string;
    userName: string | null;
    userUsername: string | null;
  }[];
}

function MonitoringDashboard() {
  const [data, setData] = React.useState<MonitoringData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [autoRefresh, setAutoRefresh] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/monitoring", { cache: "no-store" });
      if (res.status === 403) return; // admin gate
      if (res.status === 401) {
        toast.error("Session expired. Please log in again.");
        return;
      }
      if (res.ok) setData(await res.json());
    } catch {
      /* swallow */
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (!autoRefresh) return;
    const interval = window.setInterval(() => {
      load();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [autoRefresh, load]);

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const successRateTone =
    data.system.successRatePct >= 99
      ? "text-emerald-600 dark:text-emerald-400"
      : data.system.successRatePct >= 95
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  const maxErrorCount = Math.max(...data.errorBreakdown.map((e) => e.count), 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Activity className="text-primary h-4 w-4" />
            {autoRefresh && (
              <span className="absolute -top-1 -right-1 h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            )}
          </div>
          <div>
            <h2 className="text-sm font-semibold">Real-time monitoring</h2>
            <p className="text-muted-foreground text-[11px]">
              Updated {timeAgo(data.generatedAt)} ·{" "}
              {autoRefresh ? "auto-refresh every 15s" : "manual"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
            <Switch
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              aria-label="Auto-refresh"
            />
            Auto-refresh
          </label>
          <Button size="sm" variant="ghost" onClick={load} className="gap-1.5 text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh now
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <MonitoringKpi
          label="Today's volume"
          value={nairaCompact(data.volume.totalTodayKobo)}
          icon={TrendingUp}
          tone="success"
          hint={`${data.system.txTodayCount} tx today`}
        />
        <MonitoringKpi
          label="Success rate"
          value={`${data.system.successRatePct.toFixed(1)}%`}
          icon={CheckCircle2}
          tone={
            data.system.successRatePct >= 99
              ? "success"
              : data.system.successRatePct >= 95
                ? "warning"
                : "danger"
          }
          hint={`${data.system.txTodaySuccessCount}/${data.system.txTodayCount} succeeded`}
          valueClass={successRateTone}
        />
        <MonitoringKpi
          label="Active users 24h"
          value={String(data.system.activeUsers24h)}
          icon={Users}
          tone="default"
          hint="distinct transactors"
        />
        <MonitoringKpi
          label="Avg processing"
          value={`${data.system.avgProcessingMs}ms`}
          icon={Clock}
          tone={data.system.avgProcessingMs < 1500 ? "success" : "warning"}
          hint="across providers"
        />
        <MonitoringKpi
          label="Fees collected"
          value={nairaCompact(data.volume.feesTodayKobo)}
          icon={PiggyBank}
          tone="success"
          hint="today"
        />
        <MonitoringKpi
          label="Open alerts"
          value={String(data.alerts.openAlerts)}
          icon={Bell}
          tone={data.alerts.openAlerts > 0 ? "danger" : "success"}
          hint={`${data.alerts.unresolvedAml} AML · ${data.alerts.openComplianceCases} compliance`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <p className="text-sm font-semibold">Live transactions</p>
            </div>
            <span className="text-muted-foreground flex items-center gap-1 text-[10px]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> real-time
            </span>
          </div>
          <div className="scrollbar-thin max-h-96 space-y-1.5 overflow-y-auto pr-1">
            {data.liveFeed.length > 0 ? (
              data.liveFeed.map((t) => {
                const isCredit = t.direction === "CREDIT";
                return (
                  <div
                    key={t.id}
                    className="hover:bg-muted/40 flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors"
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        t.status === "SUCCESS"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : t.status === "PENDING"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "bg-red-500/10 text-red-600 dark:text-red-400"
                      }`}
                    >
                      {isCredit ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowLeftRight className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {t.userName ?? "Unknown"}
                        <span className="text-muted-foreground ml-1">
                          {TX_TYPE_LABELS[t.type] ?? t.type}
                        </span>
                      </p>
                      <p className="text-muted-foreground truncate font-mono text-[10px]">
                        {t.reference}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-xs font-semibold tabular-nums ${isCredit ? "text-emerald-600 dark:text-emerald-400" : ""}`}
                      >
                        {isCredit ? "+" : "−"}
                        {nairaCompact(t.amountKobo)}
                      </p>
                      <p className="text-muted-foreground text-[10px]">{timeAgo(t.createdAt)}</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-muted-foreground py-8 text-center text-xs">
                No transactions today yet.
              </p>
            )}
          </div>
        </Card>

        <Card className="p-5 lg:col-span-1">
          <div className="mb-3 flex items-center gap-2">
            <Server className="text-primary h-4 w-4" />
            <p className="text-sm font-semibold">Provider health</p>
            <span className="text-muted-foreground ml-auto text-[10px]">
              {data.providerHealth.length} providers
            </span>
          </div>
          <div className="space-y-2">
            {data.providerHealth.length > 0 ? (
              data.providerHealth.map((p) => {
                const dot =
                  p.circuitState === "OPEN"
                    ? "bg-red-500"
                    : p.circuitState === "HALF_OPEN"
                      ? "bg-amber-500"
                      : p.healthScore >= 80
                        ? "bg-emerald-500"
                        : "bg-amber-500";
                return (
                  <div key={p.code} className="flex items-center gap-3 rounded-lg border p-2.5">
                    <div className="bg-muted relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                      <CircuitBoard className="text-muted-foreground h-4 w-4" />
                      <span
                        className={`ring-card absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ${dot}`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{p.displayName}</p>
                      <p className="text-muted-foreground text-[10px]">
                        {p.successRate.toFixed(1)}% · {p.avgLatencyMs}ms · {p.circuitState}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-sm font-bold tabular-nums ${p.healthScore >= 80 ? "text-emerald-600 dark:text-emerald-400" : p.healthScore >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}
                      >
                        {p.healthScore}
                      </p>
                      <p className="text-muted-foreground text-[9px]">/100</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-muted-foreground py-8 text-center text-xs">
                No providers configured.
              </p>
            )}
          </div>
        </Card>

        <Card className="p-5 lg:col-span-1">
          <div className="mb-3 flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500" />
            <p className="text-sm font-semibold">Top errors (24h)</p>
            <span className="text-muted-foreground ml-auto text-[10px]">
              {data.system.txTodayFailedCount} failures
            </span>
          </div>
          {data.errorBreakdown.length > 0 ? (
            <div className="space-y-2">
              {data.errorBreakdown.map((e, i) => {
                const pct = (e.count / maxErrorCount) * 100;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="truncate pr-2 font-mono" title={e.label}>
                        {e.label}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">{e.count}</span>
                    </div>
                    <div className="bg-muted mt-0.5 h-2 overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          background:
                            i === 0
                              ? "oklch(0.65 0.20 25)"
                              : i === 1
                                ? "oklch(0.70 0.15 50)"
                                : "oklch(0.80 0.13 75)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="mt-2 text-xs font-medium">No errors in the last 24h</p>
              <p className="text-muted-foreground text-[10px]">All systems nominal.</p>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Inbox className="text-primary h-4 w-4" />
            <p className="text-sm font-semibold">Queue health</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <QueueCard
              label="Pending outbox"
              value={data.queues.pendingOutbox}
              icon={Inbox}
              tone={data.queues.pendingOutbox > 50 ? "warning" : "default"}
              hint={`${data.queues.failedOutbox} failed`}
            />
            <QueueCard
              label="Stuck transactions"
              value={data.queues.stuckTransactions}
              icon={Clock}
              tone={data.queues.stuckTransactions > 0 ? "danger" : "success"}
              hint="PENDING > 1h"
            />
            <QueueCard
              label="Pending cron tasks"
              value={data.queues.pendingCronTasks}
              icon={Clock}
              tone={data.queues.pendingCronTasks > 10 ? "warning" : "default"}
              hint="due now"
            />
            <QueueCard
              label="Failed webhooks"
              value={data.alerts.failedWebhooks}
              icon={Webhook}
              tone={data.alerts.failedWebhooks > 0 ? "danger" : "success"}
              hint="endpoints failing"
            />
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Gauge className="text-primary h-4 w-4" />
            <p className="text-sm font-semibold">Largest transaction today</p>
          </div>
          {data.volume.largestTodayKobo > 0 ? (
            <div className="space-y-2">
              <p className="text-3xl font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                {naira(data.volume.largestTodayKobo)}
              </p>
              <div className="space-y-1 text-xs">
                <p>
                  <span className="text-muted-foreground">Reference:</span>{" "}
                  <span className="font-mono">{data.volume.largestTodayRef}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">User:</span>{" "}
                  {data.volume.largestTodayUser ?? "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Fees collected today:</span>{" "}
                  <span className="font-semibold tabular-nums">
                    {naira(data.volume.feesTodayKobo)}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">Failed today:</span>{" "}
                  <span className="font-semibold tabular-nums">
                    {data.system.txTodayFailedCount} tx
                  </span>
                </p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No transactions yet today.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

function MonitoringKpi({
  label,
  value,
  icon: Icon,
  tone,
  hint,
  valueClass,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "default" | "success" | "warning" | "danger";
  hint?: string;
  valueClass?: string;
}) {
  const toneClass = {
    default: "bg-muted text-muted-foreground",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    danger: "bg-red-500/10 text-red-600 dark:text-red-400",
  }[tone];
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-[11px] font-medium">{label}</p>
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className={`mt-2 text-xl font-bold tabular-nums ${valueClass ?? ""}`}>{value}</p>
      {hint && <p className="text-muted-foreground mt-0.5 text-[10px]">{hint}</p>}
    </Card>
  );
}

function QueueCard({
  label,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "default" | "success" | "warning" | "danger";
  hint?: string;
}) {
  const toneClass = {
    default: "bg-muted text-muted-foreground",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    danger: "bg-red-500/10 text-red-600 dark:text-red-400",
  }[tone];
  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-[11px] font-medium">{label}</p>
        <div className={`flex h-6 w-6 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon className="h-3 w-3" />
        </div>
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
      {hint && <p className="text-muted-foreground text-[10px]">{hint}</p>}
    </div>
  );
}
