"use client";

// TurboCore — Global Capability Registry (GCR) Admin Tab (Chapter 7)
// 8 sub-tabs: Overview, Tree, Resolve, Country, Provider, Graph, Flags, Cert.

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Wallet,
  ShieldCheck,
  ArrowLeftRight,
  Store,
  CreditCard,
  Smartphone,
  Landmark,
  Building2,
  ShieldAlert,
  Scale,
  ReceiptText,
  BarChart3,
  Code2,
  PiggyBank,
  Repeat,
  FileText,
  QrCode,
  Bitcoin,
  Coins,
  Bell,
  Search,
  Filter,
  GitBranch,
  Flag,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Network,
  Zap,
  Globe2,
  Layers,
  Workflow,
  type LucideIcon,
} from "lucide-react";

// -------------------- Types --------------------

type Status = "STABLE" | "BETA" | "EXPERIMENTAL" | "DEPRECATED" | "PLANNED";
type Direction = "INBOUND" | "OUTBOUND" | "BOTH" | "NEUTRAL";
type Maturity = "NATIVE" | "SUPPORTED" | "LIMITED" | "BETA" | "PARKED" | "ROADMAP";
type Support = "FULL" | "LIMITED" | "CONFIGURABLE" | "DISABLED" | "BETA";
type Scope = "GLOBAL" | "COUNTRY" | "MERCHANT" | "USER_TIER" | "ENVIRONMENT" | "REGULATORY";
type CertStatus = "PENDING" | "IN_PROGRESS" | "CERTIFIED" | "FAILED";

interface GcrStats {
  totalGroups: number;
  totalCapabilities: number;
  stableCapabilities: number;
  betaCapabilities: number;
  experimentalCapabilities: number;
  deprecatedCapabilities: number;
  plannedCapabilities: number;
  totalFeatures: number;
  totalDependencies: number;
  totalVersions: number;
  totalCertificationTests: number;
  countriesProfiled: number;
  providersMapped: number;
  flagsConfigured: number;
  flagsEnabled: number;
}
interface GroupStats {
  groupId: string;
  groupName: string;
  totalCapabilities: number;
  stableCapabilities: number;
  betaCapabilities: number;
  inbound: number;
  outbound: number;
  both: number;
  totalFeatures: number;
  totalDependencies: number;
}
interface OverviewResponse {
  stats: GcrStats;
  groups: GroupStats[];
  providerMatrix: {
    totalEntries: number;
    byMaturity: Record<string, number>;
    providersMapped: number;
  };
}
interface CapabilityFeature {
  slug: string;
  name: string;
  description: string;
  mandatory?: boolean;
  version?: string;
}
interface CapabilityVersion {
  version: string;
  label: string;
  releaseNotes?: string;
  status: Status;
  current?: boolean;
}
interface CapabilityDependency {
  capabilityId: string;
  kind: "REQUIRES" | "RECOMMENDS" | "OPTIONAL";
  reason?: string;
}
interface TreeCapability {
  id: string;
  name: string;
  description: string;
  direction: Direction;
  status: Status;
  countries: string[];
  currencies: string[];
  requiredKycTier: number;
  supportsRecurring: boolean;
  supportsRefunds: boolean;
  supportsChargeback: boolean;
  features: CapabilityFeature[];
  versions: CapabilityVersion[];
  tags: string[];
}
interface TreeGroup {
  id: string;
  name: string;
  description: string;
  icon: string;
  order: number;
  accent: string;
  capabilities: TreeCapability[];
}
interface TreeResponse {
  groups: number;
  capabilities: number;
  tree: TreeGroup[];
}
interface CapabilityFull extends TreeCapability {
  groupId: string;
  supportsPartial: boolean;
  supportsSplit: boolean;
  documentation: {
    functional: string;
    businessRules: string[];
    technicalContract: string;
    requiredPermissions: string[];
    complianceRequirements: string[];
    failureScenarios: string[];
    uxExpectations: string;
  };
}
interface ProviderEntry {
  providerCode: string;
  capabilityId: string;
  maturity: Maturity;
  features: string[];
  version?: string;
  countries: string[];
  notes?: string;
}
interface CertDetail {
  providerCode: string;
  capabilityId: string;
  status: CertStatus;
  passed: number;
  failed: number;
  total: number;
  mandatoryPassed: number;
  mandatoryTotal: number;
  lastRunAt?: string;
  results?: Array<{
    slug: string;
    name: string;
    passed: boolean;
    mandatory: boolean;
    category: string;
  }>;
}
interface CapabilityDetailResponse {
  capability: CapabilityFull;
  dependencies: CapabilityDependency[];
  dependents: CapabilityDependency[];
  hardDependencies: { satisfied: boolean; missing: string[] };
  prerequisiteTree: { tree: CapabilityDependency[]; hasUnsatisfied: boolean };
  providers: ProviderEntry[];
  certifications: Array<{
    providerCode: string;
    maturity: Maturity;
    certification: CertDetail | null;
  }>;
  countrySupport: Array<{ country: string; support: Support }>;
  tests: Array<{
    slug: string;
    name: string;
    description: string;
    mandatory: boolean;
    category: string;
  }>;
}
interface ResolutionCandidate {
  providerCode: string;
  maturity: Maturity;
  score: number;
  reasons: string[];
  features: string[];
  version?: string;
}
interface ResolutionResult {
  request: {
    country: string;
    capabilityId: string;
    currency?: string;
    direction?: Direction;
    kycTier?: number;
  };
  resolved: boolean;
  candidates: ResolutionCandidate[];
  failoverChain: string[];
  reason?: string;
  capability: CapabilityFull;
  dependenciesChecked: Array<{ capabilityId: string; satisfied: boolean; reason: string }>;
  durationMs: number;
}
interface CountryRow {
  country: string;
  name: string;
  flagEmoji: string;
  currency: string;
  capabilities: Record<string, Support>;
  full: number;
  limited: number;
  beta: number;
  configurable: number;
  disabled: number;
}
interface CountryMatrixResponse {
  countries: CountryRow[];
  totalCapabilities: number;
}
interface ProviderRow {
  providerCode: string;
  entries: ProviderEntry[];
  totalCapabilities: number;
  byMaturity: Record<string, number>;
}
interface ProviderMatrixResponse {
  providers: ProviderRow[];
  totalProviders: number;
  totalEntries: number;
}
interface KGNode {
  id: string;
  label: string;
  group: string;
  status: Status;
  direction: Direction;
  hardDependenciesSatisfied: boolean;
  missingDependencies: string[];
  hasUnsatisfiedPrerequisites: boolean;
  prerequisiteCount: number;
}
interface KGEdge {
  from: string;
  to: string;
  kind: "REQUIRES" | "RECOMMENDS" | "OPTIONAL";
  reason?: string;
}
interface KGResponse {
  nodes: KGNode[];
  edges: KGEdge[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    requiresEdges: number;
    recommendsEdges: number;
    optionalEdges: number;
    nodesWithUnsatisfiedDeps: number;
  };
}
interface KGPathResponse {
  from: string;
  to: string;
  path: {
    path: string[];
    edges: Array<{ from: string; to: string; kind: string }>;
    satisfied: boolean;
    explanation: string;
  } | null;
}
interface GcrFlag {
  id: string;
  capabilityId: string;
  scope: Scope;
  target: string;
  enabled: boolean;
  reason?: string;
  updatedAt: string;
  updatedBy?: string;
}
interface FlagsResponse {
  flags: GcrFlag[];
  count: number;
  stats: { total: number; enabled: number; disabled: number; byScope: Record<string, number> };
}
interface CertMatrixRow {
  providerCode: string;
  capabilityId: string;
  capabilityName: string;
  status: CertStatus;
  mandatoryPassed: number;
  mandatoryTotal: number;
}
interface CertResponse {
  certs: CertDetail[];
  count: number;
  stats: { total: number; certified: number; inProgress: number; failed: number; pending: number };
  matrix: CertMatrixRow[];
}

// -------------------- Tone maps --------------------

const STATUS_TONE: Record<Status, string> = {
  STABLE: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  BETA: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  EXPERIMENTAL: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30",
  DEPRECATED: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  PLANNED: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30",
};
const MATURITY_TONE: Record<Maturity, string> = {
  NATIVE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  SUPPORTED: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
  LIMITED: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  BETA: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
  PARKED: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  ROADMAP: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30",
};
const SUPPORT_TONE: Record<Support, string> = {
  FULL: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  LIMITED: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  CONFIGURABLE: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
  DISABLED: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  BETA: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
};
const SCOPE_TONE: Record<Scope, string> = {
  GLOBAL: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30",
  COUNTRY: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
  MERCHANT: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
  USER_TIER: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  ENVIRONMENT: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
  REGULATORY: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
};
const CERT_TONE: Record<CertStatus, string> = {
  CERTIFIED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  IN_PROGRESS: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  FAILED: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  PENDING: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30",
};
const DIRECTION_TONE: Record<Direction, string> = {
  INBOUND: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  OUTBOUND: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  BOTH: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  NEUTRAL: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
};
const ACCENT_DOT: Record<string, string> = {
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  violet: "bg-violet-500",
  cyan: "bg-cyan-500",
  orange: "bg-orange-500",
  blue: "bg-sky-500",
  green: "bg-green-500",
  teal: "bg-teal-500",
  indigo: "bg-violet-500",
  slate: "bg-slate-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
};
const ACCENT_TEXT: Record<string, string> = {
  emerald: "text-emerald-600 dark:text-emerald-400",
  rose: "text-rose-600 dark:text-rose-400",
  amber: "text-amber-600 dark:text-amber-400",
  violet: "text-violet-600 dark:text-violet-400",
  cyan: "text-cyan-600 dark:text-cyan-400",
  orange: "text-orange-600 dark:text-orange-400",
  blue: "text-sky-600 dark:text-sky-400",
  green: "text-green-600 dark:text-green-400",
  teal: "text-teal-600 dark:text-teal-400",
  indigo: "text-violet-600 dark:text-violet-400",
  slate: "text-slate-600 dark:text-slate-400",
  purple: "text-purple-600 dark:text-purple-400",
  pink: "text-pink-600 dark:text-pink-400",
};

const GROUP_ICONS: Record<string, LucideIcon> = {
  ArrowDownToLine,
  ArrowUpFromLine,
  Wallet,
  ShieldCheck,
  ArrowLeftRight,
  Store,
  CreditCard,
  Smartphone,
  Landmark,
  Building2,
  ShieldAlert,
  Scale,
  ReceiptText,
  BarChart3,
  Code2,
  PiggyBank,
  Repeat,
  FileText,
  QrCode,
  Bitcoin,
  Coins,
  Bell,
};
const groupIcon = (n: string): LucideIcon => GROUP_ICONS[n] ?? Layers;

// -------------------- Small primitives --------------------

function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] tracking-wide uppercase ${STATUS_TONE[status]}`}
    >
      {status}
    </Badge>
  );
}
function MaturityBadge({ maturity }: { maturity: Maturity }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] tracking-wide uppercase ${MATURITY_TONE[maturity]}`}
    >
      {maturity}
    </Badge>
  );
}
function SupportBadge({ support }: { support: Support }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] tracking-wide uppercase ${SUPPORT_TONE[support]}`}
    >
      {support}
    </Badge>
  );
}
function ScopeBadge({ scope }: { scope: Scope }) {
  return (
    <Badge variant="outline" className={`text-[10px] tracking-wide uppercase ${SCOPE_TONE[scope]}`}>
      {scope}
    </Badge>
  );
}
function CertBadge({ status }: { status: CertStatus }) {
  return (
    <Badge variant="outline" className={`text-[10px] tracking-wide uppercase ${CERT_TONE[status]}`}>
      {status.replace("_", " ")}
    </Badge>
  );
}
function DirectionBadge({ direction }: { direction: Direction }) {
  return (
    <Badge
      variant="secondary"
      className={`text-[10px] tracking-wide uppercase ${DIRECTION_TONE[direction]}`}
    >
      {direction}
    </Badge>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "emerald",
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon?: LucideIcon;
  accent?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
          {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
        </div>
        {Icon && (
          <div className="rounded-lg bg-emerald-500/10 p-2">
            <Icon className={`h-4 w-4 ${ACCENT_TEXT[accent] ?? ACCENT_TEXT.emerald}`} />
          </div>
        )}
      </div>
    </Card>
  );
}

function SectionHeader({
  title,
  description,
  icon: Icon,
  actions,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="rounded-lg bg-emerald-500/10 p-2">
            <Icon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
        )}
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          {description && <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
function GridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}
function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-12 text-sm">
      <AlertCircle className="h-8 w-8 opacity-50" />
      <p>{message}</p>
    </div>
  );
}

async function gcrFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (res.status === 403) {
      toast.error("Permission denied — Capabilities View required");
      return null;
    }
    if (res.status === 401) {
      toast.error("Session expired. Please log in again.");
      return null;
    }
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      toast.error(e.error ?? `Request failed (${res.status})`);
      return null;
    }
    return (await res.json()) as T;
  } catch {
    toast.error("Network error — please retry");
    return null;
  }
}

// -------------------- Sub-tab nav --------------------

type SubTab =
  "overview" | "tree" | "resolve" | "country" | "provider" | "graph" | "flags" | "certification";
const SUB_TABS: Array<{ id: SubTab; label: string; icon: LucideIcon; description: string }> = [
  {
    id: "overview",
    label: "Overview",
    icon: BarChart3,
    description: "Top-level stats + group breakdown",
  },
  {
    id: "tree",
    label: "Capability Tree",
    icon: GitBranch,
    description: "Browse the 22 groups × ~200 capabilities",
  },
  {
    id: "resolve",
    label: "Resolution Engine",
    icon: Zap,
    description: "Find providers for a capability in a country",
  },
  {
    id: "country",
    label: "Country Matrix",
    icon: Globe2,
    description: "Country × capability support grid",
  },
  {
    id: "provider",
    label: "Provider Matrix",
    icon: Layers,
    description: "Provider × capability maturity grid",
  },
  {
    id: "graph",
    label: "Knowledge Graph",
    icon: Network,
    description: "Capability dependencies + path finder",
  },
  { id: "flags", label: "Feature Flags", icon: Flag, description: "Capability overrides (CRUD)" },
  {
    id: "certification",
    label: "Certification",
    icon: ShieldCheck,
    description: "Provider × capability certification matrix",
  },
];

// -------------------- Main --------------------

export default function GcrTab() {
  const [sub, setSub] = React.useState<SubTab>("overview");
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-emerald-500/10 p-3">
              <Network className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Global Capability Registry</h2>
              <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
                TurboCore&apos;s capability-first knowledge layer. Routes target{" "}
                <span className="text-foreground font-medium">Capabilities</span>, never providers —
                providers merely implement them.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            >
              Chapter 7
            </Badge>
            <Badge variant="outline">TurboCore</Badge>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-1.5">
        {SUB_TABS.map((t) => {
          const active = sub === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSub(t.id)}
              className={`group inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              aria-pressed={active}
            >
              <t.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      <p className="text-muted-foreground text-xs">
        {SUB_TABS.find((t) => t.id === sub)?.description}
      </p>

      {sub === "overview" && <OverviewSubTab />}
      {sub === "tree" && <CapabilityTreeSubTab />}
      {sub === "resolve" && <ResolutionEngineSubTab />}
      {sub === "country" && <CountryMatrixSubTab />}
      {sub === "provider" && <ProviderMatrixSubTab />}
      {sub === "graph" && <KnowledgeGraphSubTab />}
      {sub === "flags" && <FeatureFlagsSubTab />}
      {sub === "certification" && <CertificationSubTab />}
    </div>
  );
}

// -------------------- 1. Overview --------------------

function OverviewSubTab() {
  const [data, setData] = React.useState<OverviewResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    const d = await gcrFetch<OverviewResponse>("/api/admin/gcr");
    setData(d);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  if (loading)
    return (
      <div className="space-y-4">
        <GridSkeleton count={8} />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  if (!data) return <EmptyState message="Could not load GCR overview" />;
  const s = data.stats;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Groups"
          value={s.totalGroups}
          icon={Layers}
          accent="emerald"
          hint="Top-level domains"
        />
        <StatCard
          label="Capabilities"
          value={s.totalCapabilities}
          icon={GitBranch}
          accent="violet"
          hint={`${s.stableCapabilities} stable`}
        />
        <StatCard
          label="Stable"
          value={s.stableCapabilities}
          icon={CheckCircle2}
          accent="emerald"
          hint="Production-routable"
        />
        <StatCard
          label="Beta"
          value={s.betaCapabilities}
          icon={Clock}
          accent="amber"
          hint="Flag-gated in prod"
        />
        <StatCard
          label="Experimental"
          value={s.experimentalCapabilities}
          icon={AlertCircle}
          accent="orange"
          hint="Sandbox only"
        />
        <StatCard
          label="Planned"
          value={s.plannedCapabilities}
          icon={FileText}
          accent="slate"
          hint="Declared, no provider"
        />
        <StatCard
          label="Countries"
          value={s.countriesProfiled}
          icon={Globe2}
          accent="cyan"
          hint="Profiled markets"
        />
        <StatCard
          label="Providers"
          value={s.providersMapped}
          icon={Layers}
          accent="violet"
          hint="Mapped to capabilities"
        />
        <StatCard
          label="Features"
          value={s.totalFeatures}
          icon={Code2}
          accent="emerald"
          hint="Sub-features"
        />
        <StatCard
          label="Dependencies"
          value={s.totalDependencies}
          icon={Network}
          accent="rose"
          hint="Knowledge-graph edges"
        />
        <StatCard
          label="Versions"
          value={s.totalVersions}
          icon={Repeat}
          accent="cyan"
          hint="Capability versions"
        />
        <StatCard
          label="Cert. Tests"
          value={s.totalCertificationTests}
          icon={ShieldCheck}
          accent="amber"
          hint="Test suite size"
        />
        <StatCard
          label="Flags"
          value={s.flagsConfigured}
          icon={Flag}
          accent="violet"
          hint={`${s.flagsEnabled} enabled`}
        />
        <StatCard
          label="Provider Entries"
          value={data.providerMatrix.totalEntries}
          icon={Workflow}
          accent="emerald"
          hint="Provider × capability rows"
        />
        <StatCard
          label="Deprecated"
          value={s.deprecatedCapabilities}
          icon={XCircle}
          accent="rose"
          hint="Superseded"
        />
        <StatCard
          label="Flags Enabled"
          value={s.flagsEnabled}
          icon={Zap}
          accent="amber"
          hint="Active overrides"
        />
      </div>

      <Card className="p-5">
        <SectionHeader
          title="Provider Matrix Summary"
          description={`${data.providerMatrix.providersMapped} providers × ${s.totalCapabilities} capabilities = ${data.providerMatrix.totalEntries} entries`}
          icon={Layers}
        />
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {Object.entries(data.providerMatrix.byMaturity).map(([k, v]) => (
            <div
              key={k}
              className={`rounded-lg border p-3 ${MATURITY_TONE[k as Maturity] ?? "border-border bg-muted"}`}
            >
              <p className="text-[10px] font-semibold tracking-wide uppercase opacity-70">{k}</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{v}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeader
          title="Capability Groups"
          description={`${s.totalGroups} groups — ordered by financial domain`}
          icon={GitBranch}
          actions={
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          }
        />
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data.groups.map((g) => (
            <div
              key={g.groupId}
              className="bg-card rounded-lg border p-4 transition-colors hover:border-emerald-500/40"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="text-muted-foreground h-4 w-4" />
                  <span className="font-semibold">{g.groupName}</span>
                </div>
                <Badge variant="outline" className="text-[10px] tabular-nums">
                  {g.totalCapabilities} caps
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1 font-mono text-[10px]">{g.groupId}</p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300"
                >
                  {g.stableCapabilities} stable
                </Badge>
                {g.betaCapabilities > 0 && (
                  <Badge
                    variant="outline"
                    className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300"
                  >
                    {g.betaCapabilities} beta
                  </Badge>
                )}
                {g.inbound > 0 && (
                  <Badge
                    variant="secondary"
                    className="bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300"
                  >
                    ↓{g.inbound} in
                  </Badge>
                )}
                {g.outbound > 0 && (
                  <Badge
                    variant="secondary"
                    className="bg-rose-500/10 text-[10px] text-rose-700 dark:text-rose-300"
                  >
                    ↑{g.outbound} out
                  </Badge>
                )}
                {g.both > 0 && (
                  <Badge
                    variant="secondary"
                    className="bg-violet-500/10 text-[10px] text-violet-700 dark:text-violet-300"
                  >
                    ↔{g.both} both
                  </Badge>
                )}
              </div>
              <Separator className="my-3" />
              <div className="text-muted-foreground flex items-center justify-between text-xs">
                <span>{g.totalFeatures} features</span>
                <span>{g.totalDependencies} deps</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// -------------------- 2. Capability Tree --------------------

function CapabilityTreeSubTab() {
  const [tree, setTree] = React.useState<TreeResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [groupFilter, setGroupFilter] = React.useState("ALL");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [detail, setDetail] = React.useState<CapabilityDetailResponse | null>(null);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const d = await gcrFetch<TreeResponse>("/api/admin/gcr/tree");
    if (d) {
      setTree(d);
      if (d.tree.length > 0) setExpanded(new Set([d.tree[0].id]));
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const loadDetail = React.useCallback(async (id: string) => {
    setLoadingDetail(true);
    setDetailId(id);
    const d = await gcrFetch<CapabilityDetailResponse>(
      `/api/admin/gcr/capabilities?id=${encodeURIComponent(id)}`
    );
    setDetail(d);
    setLoadingDetail(false);
  }, []);

  const toggleGroup = React.useCallback((id: string) => {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const filteredTree = React.useMemo(() => {
    if (!tree) return [];
    const q = search.toLowerCase().trim();
    return tree.tree
      .filter((g) => groupFilter === "ALL" || g.id === groupFilter)
      .map((g) => ({
        ...g,
        capabilities: g.capabilities.filter((c) => {
          if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
          if (!q) return true;
          return (
            c.id.toLowerCase().includes(q) ||
            c.name.toLowerCase().includes(q) ||
            c.description.toLowerCase().includes(q) ||
            c.tags.some((t) => t.toLowerCase().includes(q))
          );
        }),
      }))
      .filter((g) => g.capabilities.length > 0);
  }, [tree, search, statusFilter, groupFilter]);

  const matchCount = React.useMemo(
    () => filteredTree.reduce((sum, g) => sum + g.capabilities.length, 0),
    [filteredTree]
  );

  if (loading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <ListSkeleton rows={6} />
      </div>
    );

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="Search by name, id, description, tag…"
              className="h-9 pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-36">
              <Filter className="text-muted-foreground mr-1 h-3.5 w-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="STABLE">Stable</SelectItem>
              <SelectItem value="BETA">Beta</SelectItem>
              <SelectItem value="EXPERIMENTAL">Experimental</SelectItem>
              <SelectItem value="DEPRECATED">Deprecated</SelectItem>
              <SelectItem value="PLANNED">Planned</SelectItem>
            </SelectContent>
          </Select>
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All groups</SelectItem>
              {tree?.tree.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Badge variant="outline" className="ml-auto tabular-nums">
            {matchCount} matches
          </Badge>
        </div>
      </Card>

      <div className="space-y-2">
        {filteredTree.length === 0 && (
          <Card className="p-6">
            <EmptyState message="No capabilities match your filters" />
          </Card>
        )}
        {filteredTree.map((g) => {
          const Icon = groupIcon(g.icon);
          const isOpen = expanded.has(g.id);
          return (
            <Card key={g.id} className="overflow-hidden p-0">
              <button
                onClick={() => toggleGroup(g.id)}
                className="hover:bg-accent/50 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
              >
                <div
                  className={`rounded-lg p-2 ${ACCENT_DOT[g.accent] ? `${ACCENT_DOT[g.accent]}/15` : "bg-emerald-500/10"}`}
                >
                  <Icon className={`h-4 w-4 ${ACCENT_TEXT[g.accent] ?? ACCENT_TEXT.emerald}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{g.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {g.capabilities.length}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground truncate text-xs">{g.description}</p>
                </div>
                {isOpen ? (
                  <ChevronDown className="text-muted-foreground h-4 w-4" />
                ) : (
                  <ChevronRight className="text-muted-foreground h-4 w-4" />
                )}
              </button>
              {isOpen && (
                <div className="border-t">
                  {g.capabilities.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => loadDetail(c.id)}
                      className="hover:bg-accent/40 flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors"
                    >
                      <div className="mt-1.5">
                        <ChevronRight className="text-muted-foreground h-3 w-3" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{c.name}</span>
                          <StatusBadge status={c.status} />
                          <DirectionBadge direction={c.direction} />
                          <span className="text-muted-foreground font-mono text-[10px]">
                            {c.id}
                          </span>
                        </div>
                        <p className="text-muted-foreground mt-0.5 truncate text-xs">
                          {c.description}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          {c.countries.slice(0, 5).map((cc) => (
                            <Badge key={cc} variant="secondary" className="text-[9px]">
                              {cc}
                            </Badge>
                          ))}
                          {c.countries.length > 5 && (
                            <span className="text-muted-foreground text-[10px]">
                              +{c.countries.length - 5}
                            </span>
                          )}
                          {c.features.length > 0 && (
                            <Badge variant="outline" className="text-[9px]">
                              {c.features.length} features
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <CapabilityDetailDialog
        detail={detail}
        detailId={detailId}
        loading={loadingDetail}
        onClose={() => {
          setDetail(null);
          setDetailId(null);
        }}
      />
    </div>
  );
}

function CapabilityDetailDialog({
  detail,
  detailId,
  loading,
  onClose,
}: {
  detail: CapabilityDetailResponse | null;
  detailId: string | null;
  loading: boolean;
  onClose: () => void;
}) {
  const open = detailId !== null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            {loading || !detail ? (
              <span className="text-muted-foreground text-sm">Loading…</span>
            ) : (
              <>
                <span>{detail.capability.name}</span>
                <StatusBadge status={detail.capability.status} />
                <DirectionBadge direction={detail.capability.direction} />
              </>
            )}
          </DialogTitle>
          <DialogDescription className="font-mono text-[11px]">{detailId}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="p-6">
            <ListSkeleton rows={4} />
          </div>
        ) : !detail ? (
          <div className="p-6">
            <EmptyState message="Could not load capability detail" />
          </div>
        ) : (
          <ScrollArea className="max-h-[70vh]">
            <div className="space-y-4 p-6">
              <DetailSection title="Metadata">
                <p className="text-sm">{detail.capability.description}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                  {[
                    ["KYC Tier", `Tier ${detail.capability.requiredKycTier}`],
                    ["Group", detail.capability.groupId],
                    ["Recurring", detail.capability.supportsRecurring ? "Yes" : "No"],
                    ["Refunds", detail.capability.supportsRefunds ? "Yes" : "No"],
                    ["Chargeback", detail.capability.supportsChargeback ? "Yes" : "No"],
                    ["Partial", detail.capability.supportsPartial ? "Yes" : "No"],
                    ["Split", detail.capability.supportsSplit ? "Yes" : "No"],
                    ["Versions", `${detail.capability.versions.length}`],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg border p-2">
                      <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
                        {k}
                      </p>
                      <p className="mt-0.5 text-sm font-medium">{v}</p>
                    </div>
                  ))}
                </div>
                <PillRow label="Countries" items={detail.capability.countries} />
                <PillRow label="Currencies" items={detail.capability.currencies} />
                {detail.capability.tags.length > 0 && (
                  <PillRow label="Tags" items={detail.capability.tags} outline />
                )}
              </DetailSection>

              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  {detail.hardDependencies.satisfied ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-500" />
                  )}
                  <span className="text-sm font-medium">
                    Hard dependencies{" "}
                    {detail.hardDependencies.satisfied ? "satisfied" : "unsatisfied"}
                  </span>
                  {detail.prerequisiteTree.hasUnsatisfied && (
                    <Badge
                      variant="outline"
                      className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300"
                    >
                      Has unsatisfied prerequisites
                    </Badge>
                  )}
                </div>
                {detail.hardDependencies.missing.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {detail.hardDependencies.missing.map((m) => (
                      <Badge
                        key={m}
                        variant="outline"
                        className="border-rose-500/30 bg-rose-500/10 text-[10px] text-rose-700 dark:text-rose-300"
                      >
                        {m}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {detail.capability.features.length > 0 && (
                <DetailSection title={`Features (${detail.capability.features.length})`}>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {detail.capability.features.map((f) => (
                      <div key={f.slug} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{f.name}</span>
                          {f.mandatory && (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-700 dark:text-emerald-300"
                            >
                              MANDATORY
                            </Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground mt-1 text-xs">{f.description}</p>
                        <p className="text-muted-foreground mt-1 font-mono text-[10px]">
                          {f.slug}
                          {f.version && ` · ${f.version}`}
                        </p>
                      </div>
                    ))}
                  </div>
                </DetailSection>
              )}

              {detail.capability.versions.length > 0 && (
                <DetailSection title={`Versions (${detail.capability.versions.length})`}>
                  <div className="flex flex-wrap gap-2">
                    {detail.capability.versions.map((v) => (
                      <div
                        key={v.version}
                        className={`rounded-lg border p-2 ${v.current ? "border-emerald-500/40 bg-emerald-500/5" : "border-border"}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold">{v.version}</span>
                          {v.current && (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-700 dark:text-emerald-300"
                            >
                              CURRENT
                            </Badge>
                          )}
                          <StatusBadge status={v.status} />
                        </div>
                        <p className="mt-1 text-xs">{v.label}</p>
                      </div>
                    ))}
                  </div>
                </DetailSection>
              )}

              {(detail.dependencies.length > 0 || detail.dependents.length > 0) && (
                <DetailSection title="Dependency Graph">
                  {detail.dependencies.length > 0 && (
                    <>
                      <p className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
                        Dependencies ({detail.dependencies.length})
                      </p>
                      <div className="space-y-1.5">
                        {detail.dependencies.map((d) => (
                          <div
                            key={d.capabilityId}
                            className="flex items-start gap-2 rounded-lg border p-2"
                          >
                            <Badge
                              variant="outline"
                              className={`text-[9px] ${d.kind === "REQUIRES" ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300" : d.kind === "RECOMMENDS" ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300"}`}
                            >
                              {d.kind}
                            </Badge>
                            <div className="min-w-0 flex-1">
                              <p className="font-mono text-xs">{d.capabilityId}</p>
                              {d.reason && (
                                <p className="text-muted-foreground mt-0.5 text-xs">{d.reason}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {detail.dependents.length > 0 && (
                    <div className="mt-3">
                      <p className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
                        Dependents ({detail.dependents.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {detail.dependents.map((d) => (
                          <Badge
                            key={d.capabilityId}
                            variant="outline"
                            className="font-mono text-[10px]"
                          >
                            {d.capabilityId}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </DetailSection>
              )}

              {detail.providers.length > 0 && (
                <DetailSection title={`Providers (${detail.providers.length})`}>
                  <div className="space-y-2">
                    {detail.providers.map((p) => {
                      const cert = detail.certifications.find(
                        (c) => c.providerCode === p.providerCode
                      );
                      return (
                        <div key={p.providerCode} className="rounded-lg border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-semibold">
                                {p.providerCode}
                              </span>
                              <MaturityBadge maturity={p.maturity} />
                              {p.version && (
                                <Badge variant="secondary" className="text-[10px]">
                                  {p.version}
                                </Badge>
                              )}
                            </div>
                            {cert?.certification && (
                              <CertBadge status={cert.certification.status} />
                            )}
                          </div>
                          {p.countries.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {p.countries.map((cc) => (
                                <Badge key={cc} variant="secondary" className="text-[9px]">
                                  {cc}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {p.features.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {p.features.map((f) => (
                                <Badge key={f} variant="outline" className="font-mono text-[9px]">
                                  {f}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {p.notes && (
                            <p className="text-muted-foreground mt-1 text-xs">{p.notes}</p>
                          )}
                          {cert?.certification && (
                            <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-3 text-xs">
                              <span>
                                Passed:{" "}
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                  {cert.certification.passed}
                                </span>
                                /{cert.certification.total}
                              </span>
                              <span>
                                Mandatory:{" "}
                                <span className="font-semibold">
                                  {cert.certification.mandatoryPassed}/
                                  {cert.certification.mandatoryTotal}
                                </span>
                              </span>
                              {cert.certification.failed > 0 && (
                                <span className="text-rose-600 dark:text-rose-400">
                                  Failed: {cert.certification.failed}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </DetailSection>
              )}

              {detail.countrySupport.length > 0 && (
                <DetailSection title={`Country Support (${detail.countrySupport.length})`}>
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6">
                    {detail.countrySupport.map((cs) => (
                      <div
                        key={cs.country}
                        className={`rounded-lg border p-2 text-center ${SUPPORT_TONE[cs.support]}`}
                      >
                        <p className="text-xs font-bold">{cs.country}</p>
                        <p className="text-[9px] uppercase">{cs.support}</p>
                      </div>
                    ))}
                  </div>
                </DetailSection>
              )}

              {detail.capability.documentation && (
                <DetailSection title="Documentation">
                  <div className="space-y-2">
                    <div className="rounded-lg border p-3">
                      <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                        Functional
                      </p>
                      <p className="mt-1 text-sm whitespace-pre-wrap">
                        {detail.capability.documentation.functional}
                      </p>
                    </div>
                    {detail.capability.documentation.businessRules.length > 0 && (
                      <DocList
                        title="Business Rules"
                        items={detail.capability.documentation.businessRules}
                        accent="emerald"
                      />
                    )}
                    {detail.capability.documentation.complianceRequirements.length > 0 && (
                      <DocList
                        title="Compliance Requirements"
                        items={detail.capability.documentation.complianceRequirements}
                        accent="amber"
                      />
                    )}
                    {detail.capability.documentation.failureScenarios.length > 0 && (
                      <DocList
                        title="Failure Scenarios"
                        items={detail.capability.documentation.failureScenarios}
                        accent="rose"
                      />
                    )}
                  </div>
                </DetailSection>
              )}

              {detail.tests.length > 0 && (
                <DetailSection title={`Certification Tests (${detail.tests.length})`}>
                  <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                    {detail.tests.map((t) => (
                      <div key={t.slug} className="flex items-start gap-2 rounded-lg border p-2">
                        {t.mandatory ? (
                          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Clock className="text-muted-foreground mt-0.5 h-3.5 w-3.5" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium">{t.name}</p>
                          <p className="text-muted-foreground font-mono text-[10px]">{t.slug}</p>
                        </div>
                        <Badge variant="secondary" className="text-[9px]">
                          {t.category}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </DetailSection>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-muted-foreground mb-2 text-sm font-semibold tracking-wide uppercase">
        {title}
      </h4>
      {children}
    </section>
  );
}

function PillRow({ label, items, outline }: { label: string; items: string[]; outline?: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground text-xs">{label}:</span>
      {items.map((c) => (
        <Badge key={c} variant={outline ? "outline" : "secondary"} className="text-[10px]">
          {c}
        </Badge>
      ))}
    </div>
  );
}

function DocList({
  title,
  items,
  accent = "emerald",
}: {
  title: string;
  items: string[];
  accent?: string;
}) {
  const dot = ACCENT_DOT[accent] ?? ACCENT_DOT.emerald;
  return (
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{title}</p>
      <ul className="mt-1 space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            <span className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// -------------------- 3. Resolution Engine --------------------

const RESOLVE_COUNTRIES = ["NG", "KE", "GH", "ZA", "UG", "TZ", "RW", "GB", "US"];

function ResolutionEngineSubTab() {
  const [tree, setTree] = React.useState<TreeResponse | null>(null);
  const [country, setCountry] = React.useState("NG");
  const [capabilityId, setCapabilityId] = React.useState("collections.cards");
  const [currency, setCurrency] = React.useState("NGN");
  const [direction, setDirection] = React.useState<Direction>("INBOUND");
  const [kycTier, setKycTier] = React.useState("1");
  const [result, setResult] = React.useState<ResolutionResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [autoRan, setAutoRan] = React.useState(false);

  React.useEffect(() => {
    gcrFetch<TreeResponse>("/api/admin/gcr/tree").then((d) => d && setTree(d));
  }, []);

  const allCapabilities = React.useMemo(() => {
    if (!tree) return [];
    return tree.tree.flatMap((g) =>
      g.capabilities.map((c) => ({ id: c.id, name: c.name, group: g.name }))
    );
  }, [tree]);

  const resolve = React.useCallback(async () => {
    if (!capabilityId) {
      toast.error("Select a capability");
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ country, capability: capabilityId });
    if (currency.trim()) params.set("currency", currency.trim().toUpperCase());
    if (direction) params.set("direction", direction);
    if (kycTier) params.set("kycTier", kycTier);
    const r = await gcrFetch<ResolutionResult>(`/api/admin/gcr/resolve?${params.toString()}`);
    setResult(r);
    setLoading(false);
  }, [country, capabilityId, currency, direction, kycTier]);

  React.useEffect(() => {
    if (allCapabilities.length > 0 && !autoRan) {
      setAutoRan(true);
      resolve();
    }
  }, [allCapabilities.length, autoRan, resolve]);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <SectionHeader
          title="Resolution Engine"
          description="Given a country + capability (+ optional currency/direction/KYC), TurboCore returns the ordered failover chain of providers."
          icon={Zap}
        />
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label className="text-xs">Country</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOLVE_COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Capability</Label>
            <Select value={capabilityId} onValueChange={setCapabilityId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {allCapabilities.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="truncate">{c.name}</span>
                    <span className="text-muted-foreground ml-1 text-[10px]">({c.group})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Currency (optional)</Label>
            <Input
              placeholder="NGN"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="uppercase"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Direction</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as Direction)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INBOUND">INBOUND</SelectItem>
                <SelectItem value="OUTBOUND">OUTBOUND</SelectItem>
                <SelectItem value="BOTH">BOTH</SelectItem>
                <SelectItem value="NEUTRAL">NEUTRAL</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">KYC Tier</Label>
            <Select value={kycTier} onValueChange={setKycTier}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Tier 0 (none)</SelectItem>
                <SelectItem value="1">Tier 1 (basic)</SelectItem>
                <SelectItem value="2">Tier 2 (KYC)</SelectItem>
                <SelectItem value="3">Tier 3 (full)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Button onClick={resolve} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}{" "}
            Resolve
          </Button>
          {result && (
            <Badge variant="outline" className="tabular-nums">
              {result.durationMs}ms
            </Badge>
          )}
        </div>
      </Card>

      {loading && !result ? (
        <Skeleton className="h-64 w-full" />
      ) : !result ? (
        <Card className="p-6">
          <EmptyState message="Run a resolution to see results" />
        </Card>
      ) : (
        <div className="space-y-4">
          <Card
            className={`p-5 ${result.resolved ? "border-emerald-500/40 bg-emerald-500/5" : "border-rose-500/40 bg-rose-500/5"}`}
          >
            <div className="flex items-start gap-3">
              {result.resolved ? (
                <CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-500" />
              ) : (
                <XCircle className="mt-0.5 h-6 w-6 text-rose-500" />
              )}
              <div className="flex-1">
                <h3 className="text-lg font-semibold">
                  {result.resolved
                    ? `Resolved — ${result.candidates.length} candidate${result.candidates.length === 1 ? "" : "s"}`
                    : "Not resolved"}
                </h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  {result.resolved
                    ? `Capability ${result.capability.id} is routable in ${result.request.country}.`
                    : (result.reason ?? "No provider can serve this request.")}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground text-xs">Capability:</span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {result.capability.id}
                  </Badge>
                  <StatusBadge status={result.capability.status} />
                  <DirectionBadge direction={result.capability.direction} />
                </div>
              </div>
            </div>
          </Card>

          {result.failoverChain.length > 0 && (
            <Card className="p-5">
              <h4 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wide uppercase">
                Failover Chain (ordered, best-first)
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                {result.failoverChain.map((p, i) => {
                  const cand = result.candidates.find((c) => c.providerCode === p);
                  return (
                    <div key={p} className="flex items-center gap-2">
                      <div
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${i === 0 ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-card"}`}
                      >
                        <span className="text-[10px] font-bold tabular-nums opacity-60">
                          #{i + 1}
                        </span>
                        <span className="font-mono text-sm font-semibold">{p}</span>
                        {cand && (
                          <>
                            <MaturityBadge maturity={cand.maturity} />
                            <Badge variant="secondary" className="text-[10px] tabular-nums">
                              {cand.score}
                            </Badge>
                          </>
                        )}
                      </div>
                      {i < result.failoverChain.length - 1 && (
                        <ChevronRight className="text-muted-foreground h-4 w-4" />
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {result.candidates.length > 0 && (
            <Card className="p-5">
              <h4 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wide uppercase">
                Candidates ({result.candidates.length})
              </h4>
              <div className="space-y-2">
                {result.candidates.map((c) => (
                  <div key={c.providerCode} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{c.providerCode}</span>
                        <MaturityBadge maturity={c.maturity} />
                        {c.version && (
                          <Badge variant="secondary" className="text-[10px]">
                            {c.version}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="bg-muted h-2 w-24 overflow-hidden rounded-full">
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${Math.max(0, Math.min(100, c.score))}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold tabular-nums">{c.score}</span>
                      </div>
                    </div>
                    {c.reasons.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {c.reasons.map((r, i) => (
                          <Badge key={i} variant="secondary" className="text-[9px]">
                            {r}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {c.features.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {c.features.map((f) => (
                          <Badge key={f} variant="outline" className="font-mono text-[9px]">
                            {f}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {result.dependenciesChecked.length > 0 && (
            <Card className="p-5">
              <h4 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wide uppercase">
                Dependencies Checked ({result.dependenciesChecked.length})
              </h4>
              <div className="space-y-1.5">
                {result.dependenciesChecked.map((d) => (
                  <div
                    key={d.capabilityId}
                    className="flex items-start gap-2 rounded-lg border p-2"
                  >
                    {d.satisfied ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 text-rose-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs font-medium">{d.capabilityId}</p>
                      <p className="text-muted-foreground text-xs">{d.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// -------------------- 4. Country Matrix --------------------

function CountryMatrixSubTab() {
  const [data, setData] = React.useState<CountryMatrixResponse | null>(null);
  const [tree, setTree] = React.useState<TreeResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [cm, tr] = await Promise.all([
      gcrFetch<CountryMatrixResponse>("/api/admin/gcr/country-matrix"),
      gcrFetch<TreeResponse>("/api/admin/gcr/tree"),
    ]);
    setData(cm);
    setTree(tr);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const groups = React.useMemo(() => {
    if (!tree) return [];
    return tree.tree.map((g) => ({
      id: g.id,
      name: g.name,
      accent: g.accent,
      icon: g.icon,
      capabilities: g.capabilities.map((c) => c.id),
    }));
  }, [tree]);

  const matrix = React.useMemo(() => {
    if (!data || groups.length === 0) return [];
    return data.countries.map((country) => ({
      country,
      perGroup: groups.map((g) => {
        const counts: Record<Support, number> = {
          FULL: 0,
          LIMITED: 0,
          CONFIGURABLE: 0,
          DISABLED: 0,
          BETA: 0,
        };
        let total = 0;
        for (const capId of g.capabilities) {
          const sup = country.capabilities[capId];
          if (!sup) continue;
          counts[sup]++;
          total++;
        }
        return { group: g, counts, total };
      }),
    }));
  }, [data, groups]);

  if (loading)
    return (
      <div className="space-y-3">
        <GridSkeleton count={6} />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  if (!data || !tree) return <EmptyState message="Could not load country matrix" />;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionHeader
          title="Country × Capability-Group Matrix"
          description={`${data.countries.length} countries × ${groups.length} groups — colour-coded by support level`}
          icon={Globe2}
          actions={
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          }
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(SUPPORT_TONE) as Support[]).map((s) => (
            <Badge key={s} variant="outline" className={`text-[9px] ${SUPPORT_TONE[s]}`}>
              {s}
            </Badge>
          ))}
        </div>
      </Card>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            <div
              className="grid border-b"
              style={{ gridTemplateColumns: `220px repeat(${groups.length}, minmax(80px, 1fr))` }}
            >
              <div className="px-3 py-2 text-xs font-semibold tracking-wide uppercase">Country</div>
              {groups.map((g) => {
                const Icon = groupIcon(g.icon);
                return (
                  <div key={g.id} className="border-l px-2 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Icon className={`h-3 w-3 ${ACCENT_TEXT[g.accent] ?? ACCENT_TEXT.emerald}`} />
                      <span className="text-xs font-semibold">{g.name}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {matrix.map((row) => {
              const isOpen = expanded === row.country.country;
              return (
                <div key={row.country.country} className="border-b last:border-b-0">
                  <button
                    onClick={() => setExpanded(isOpen ? null : row.country.country)}
                    className="hover:bg-accent/30 grid w-full items-center text-left transition-colors"
                    style={{
                      gridTemplateColumns: `220px repeat(${groups.length}, minmax(80px, 1fr))`,
                    }}
                  >
                    <div className="flex items-center gap-2 px-3 py-2">
                      <span className="text-lg">{row.country.flagEmoji}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{row.country.name}</p>
                        <p className="text-muted-foreground text-[10px]">
                          {row.country.country} · {row.country.currency}
                        </p>
                      </div>
                    </div>
                    {row.perGroup.map((pg) => {
                      const dominant = pickDominant(pg.counts);
                      return (
                        <div
                          key={pg.group.id}
                          className={`border-l px-2 py-2 text-center ${dominant ? SUPPORT_TONE[dominant] : ""}`}
                        >
                          <p className="text-sm font-bold tabular-nums">{pg.total}</p>
                          <p className="text-[9px] uppercase opacity-80">{dominant ?? "—"}</p>
                        </div>
                      );
                    })}
                  </button>
                  {isOpen && (
                    <div className="bg-muted/30 px-3 py-3">
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                        {Object.entries(row.country.capabilities).map(([capId, sup]) => (
                          <div key={capId} className={`rounded-lg border p-2 ${SUPPORT_TONE[sup]}`}>
                            <p className="font-mono text-[10px] font-semibold">{capId}</p>
                            <p className="text-[9px] uppercase">{sup}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}

function pickDominant(counts: Record<Support, number>): Support | null {
  let max = 0;
  let dominant: Support | null = null;
  (Object.keys(counts) as Support[]).forEach((k) => {
    if (counts[k] > max) {
      max = counts[k];
      dominant = k;
    }
  });
  return dominant;
}

// -------------------- 5. Provider Matrix --------------------

function ProviderMatrixSubTab() {
  const [data, setData] = React.useState<ProviderMatrixResponse | null>(null);
  const [tree, setTree] = React.useState<TreeResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [pm, tr] = await Promise.all([
      gcrFetch<ProviderMatrixResponse>("/api/admin/gcr/provider-matrix"),
      gcrFetch<TreeResponse>("/api/admin/gcr/tree"),
    ]);
    setData(pm);
    setTree(tr);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const groups = React.useMemo(() => {
    if (!tree) return [];
    return tree.tree.map((g) => ({ id: g.id, name: g.name, accent: g.accent, icon: g.icon }));
  }, [tree]);

  if (loading)
    return (
      <div className="space-y-3">
        <GridSkeleton count={6} />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  if (!data || !tree) return <EmptyState message="Could not load provider matrix" />;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionHeader
          title="Provider × Capability-Group Matrix"
          description={`${data.totalProviders} providers × ${groups.length} groups — ${data.totalEntries} total entries`}
          icon={Layers}
          actions={
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          }
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(MATURITY_TONE) as Maturity[]).map((m) => (
            <Badge key={m} variant="outline" className={`text-[9px] ${MATURITY_TONE[m]}`}>
              {m}
            </Badge>
          ))}
        </div>
      </Card>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            <div
              className="grid border-b"
              style={{ gridTemplateColumns: `220px repeat(${groups.length}, minmax(80px, 1fr))` }}
            >
              <div className="px-3 py-2 text-xs font-semibold tracking-wide uppercase">
                Provider
              </div>
              {groups.map((g) => {
                const Icon = groupIcon(g.icon);
                return (
                  <div key={g.id} className="border-l px-2 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Icon className={`h-3 w-3 ${ACCENT_TEXT[g.accent] ?? ACCENT_TEXT.emerald}`} />
                      <span className="text-xs font-semibold">{g.name}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {data.providers.map((p) => {
              const isOpen = expanded === p.providerCode;
              const byGroup = groups.map((g) => {
                const entries = p.entries.filter((e) => e.capabilityId.startsWith(g.id + "."));
                const byMat: Record<string, number> = {};
                entries.forEach((e) => {
                  byMat[e.maturity] = (byMat[e.maturity] ?? 0) + 1;
                });
                return { group: g, count: entries.length, byMat, entries };
              });
              return (
                <div key={p.providerCode} className="border-b last:border-b-0">
                  <button
                    onClick={() => setExpanded(isOpen ? null : p.providerCode)}
                    className="hover:bg-accent/30 grid w-full items-center text-left transition-colors"
                    style={{
                      gridTemplateColumns: `220px repeat(${groups.length}, minmax(80px, 1fr))`,
                    }}
                  >
                    <div className="px-3 py-2">
                      <p className="font-mono text-sm font-semibold">{p.providerCode}</p>
                      <p className="text-muted-foreground text-[10px]">
                        {p.totalCapabilities} caps
                      </p>
                    </div>
                    {byGroup.map((bg) => {
                      const dominant = bg.count > 0 ? pickDominantMaturity(bg.byMat) : null;
                      return (
                        <div
                          key={bg.group.id}
                          className={`border-l px-2 py-2 text-center ${dominant ? MATURITY_TONE[dominant as Maturity] : ""}`}
                        >
                          <p className="text-sm font-bold tabular-nums">{bg.count || "—"}</p>
                          {dominant && (
                            <p className="text-[9px] uppercase opacity-80">{dominant}</p>
                          )}
                        </div>
                      );
                    })}
                  </button>
                  {isOpen && (
                    <div className="bg-muted/30 px-3 py-3">
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                        {p.entries.map((e) => (
                          <div key={e.capabilityId} className="rounded-lg border p-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[10px] font-semibold">
                                {e.capabilityId}
                              </span>
                              <MaturityBadge maturity={e.maturity} />
                            </div>
                            {e.version && (
                              <p className="text-muted-foreground mt-1 text-[10px]">
                                Version: {e.version}
                              </p>
                            )}
                            {e.countries.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-0.5">
                                {e.countries.slice(0, 6).map((c) => (
                                  <Badge key={c} variant="secondary" className="text-[8px]">
                                    {c}
                                  </Badge>
                                ))}
                                {e.countries.length > 6 && (
                                  <span className="text-muted-foreground text-[8px]">
                                    +{e.countries.length - 6}
                                  </span>
                                )}
                              </div>
                            )}
                            {e.features.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-0.5">
                                {e.features.slice(0, 4).map((f) => (
                                  <Badge key={f} variant="outline" className="font-mono text-[8px]">
                                    {f}
                                  </Badge>
                                ))}
                                {e.features.length > 4 && (
                                  <span className="text-muted-foreground text-[8px]">
                                    +{e.features.length - 4}
                                  </span>
                                )}
                              </div>
                            )}
                            {e.notes && (
                              <p className="text-muted-foreground mt-1 text-[10px]">{e.notes}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}

function pickDominantMaturity(byMat: Record<string, number>): string | null {
  const order: Maturity[] = ["NATIVE", "SUPPORTED", "LIMITED", "BETA", "PARKED", "ROADMAP"];
  for (const m of order) {
    if ((byMat[m] ?? 0) > 0) return m;
  }
  return null;
}

// -------------------- 6. Knowledge Graph --------------------

function KnowledgeGraphSubTab() {
  const [data, setData] = React.useState<KGResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [filterGroup, setFilterGroup] = React.useState("ALL");
  const [pathFrom, setPathFrom] = React.useState("");
  const [pathTo, setPathTo] = React.useState("");
  const [pathResult, setPathResult] = React.useState<KGPathResponse["path"] | null>(null);
  const [loadingPath, setLoadingPath] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const d = await gcrFetch<KGResponse>("/api/admin/gcr/knowledge-graph");
    if (d) {
      setData(d);
      if (d.edges.length > 0) {
        setPathFrom(d.edges[0].from);
        setPathTo(d.edges[0].to);
      }
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const findPath = React.useCallback(async () => {
    if (!pathFrom || !pathTo) {
      toast.error("Select both from and to");
      return;
    }
    if (pathFrom === pathTo) {
      toast.error("From and to must differ");
      return;
    }
    setLoadingPath(true);
    const r = await gcrFetch<KGPathResponse>(
      `/api/admin/gcr/knowledge-graph?from=${encodeURIComponent(pathFrom)}&to=${encodeURIComponent(pathTo)}`
    );
    setPathResult(r?.path ?? null);
    setLoadingPath(false);
  }, [pathFrom, pathTo]);

  const filteredNodes = React.useMemo(() => {
    if (!data) return [];
    return filterGroup === "ALL" ? data.nodes : data.nodes.filter((n) => n.group === filterGroup);
  }, [data, filterGroup]);

  const nodeGroups = React.useMemo(() => {
    if (!data) return [];
    const map = new Map<string, KGNode[]>();
    data.nodes.forEach((n) => {
      const arr = map.get(n.group) ?? [];
      arr.push(n);
      map.set(n.group, arr);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  if (loading)
    return (
      <div className="space-y-3">
        <GridSkeleton count={4} />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  if (!data) return <EmptyState message="Could not load knowledge graph" />;
  const s = data.stats;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Nodes" value={s.totalNodes} icon={Network} accent="emerald" />
        <StatCard label="Edges" value={s.totalEdges} icon={GitBranch} accent="violet" />
        <StatCard label="REQUIRES" value={s.requiresEdges} icon={ShieldAlert} accent="rose" />
        <StatCard label="RECOMMENDS" value={s.recommendsEdges} icon={Clock} accent="amber" />
        <StatCard label="OPTIONAL" value={s.optionalEdges} icon={FileText} accent="slate" />
        <StatCard
          label="Unsatisfied Deps"
          value={s.nodesWithUnsatisfiedDeps}
          icon={AlertCircle}
          accent="rose"
          hint={s.nodesWithUnsatisfiedDeps === 0 ? "All clean" : "Needs attention"}
        />
      </div>

      <Card className="p-5">
        <SectionHeader
          title="Dependency Path Finder"
          description="BFS shortest path between two capabilities through the dependency graph"
          icon={Workflow}
        />
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1 space-y-1.5">
            <Label className="text-xs">From</Label>
            <Select value={pathFrom} onValueChange={setPathFrom}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select source capability" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {data.nodes.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    <span className="font-mono text-xs">{n.id}</span>
                    <span className="text-muted-foreground ml-1 text-[10px]">{n.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ArrowLeftRight className="text-muted-foreground mb-2 h-4 w-4" />
          <div className="min-w-[200px] flex-1 space-y-1.5">
            <Label className="text-xs">To</Label>
            <Select value={pathTo} onValueChange={setPathTo}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select target capability" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {data.nodes.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    <span className="font-mono text-xs">{n.id}</span>
                    <span className="text-muted-foreground ml-1 text-[10px]">{n.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={findPath} disabled={loadingPath} className="gap-2">
            {loadingPath ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Network className="h-4 w-4" />
            )}{" "}
            Find Path
          </Button>
        </div>
        {pathResult !== null && (
          <div className="mt-4 rounded-lg border p-3">
            {!pathResult || pathResult.path.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No path found between these capabilities.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  {pathResult.satisfied ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                  )}
                  <span className="text-sm font-medium">
                    Path ({pathResult.path.length} steps) —{" "}
                    {pathResult.satisfied ? "all hard deps satisfied" : "has unsatisfied hard deps"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {pathResult.path.map((p, i) => (
                    <div key={p} className="flex items-center gap-1.5">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {p}
                      </Badge>
                      {i < pathResult.path.length - 1 && (
                        <ChevronRight className="text-muted-foreground h-3 w-3" />
                      )}
                    </div>
                  ))}
                </div>
                {pathResult.explanation && (
                  <p className="text-muted-foreground mt-2 text-xs">{pathResult.explanation}</p>
                )}
              </>
            )}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <SectionHeader
          title="Capability Nodes"
          description={`${data.nodes.length} nodes grouped by capability group`}
          icon={Layers}
          actions={
            <Select value={filterGroup} onValueChange={setFilterGroup}>
              <SelectTrigger className="h-8 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All groups</SelectItem>
                {nodeGroups.map(([g]) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <div className="mt-4 max-h-96 space-y-3 overflow-y-auto pr-1">
          {filterGroup === "ALL" ? (
            nodeGroups.map(([groupId, nodes]) => (
              <div key={groupId}>
                <p className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
                  {groupId} <span className="opacity-60">({nodes.length})</span>
                </p>
                <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                  {nodes.map((n) => (
                    <KGNodeRow key={n.id} node={n} />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
              {filteredNodes.map((n) => (
                <KGNodeRow key={n.id} node={n} />
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeader
          title="Dependency Edges"
          description={`${data.edges.length} edges between capabilities`}
          icon={GitBranch}
        />
        <div className="mt-4 max-h-96 space-y-1.5 overflow-y-auto pr-1">
          {data.edges.map((e, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border p-2">
              <Badge
                variant="outline"
                className={`text-[9px] ${e.kind === "REQUIRES" ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300" : e.kind === "RECOMMENDS" ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300"}`}
              >
                {e.kind}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs">
                  <span className="font-semibold">{e.from}</span>
                  <span className="text-muted-foreground mx-1">→</span>
                  <span className="font-semibold">{e.to}</span>
                </p>
                {e.reason && <p className="text-muted-foreground mt-0.5 text-xs">{e.reason}</p>}
              </div>
            </div>
          ))}
          {data.edges.length === 0 && <EmptyState message="No dependency edges" />}
        </div>
      </Card>
    </div>
  );
}

function KGNodeRow({ node }: { node: KGNode }) {
  return (
    <div className="rounded-lg border p-2">
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-[10px] font-semibold">{node.id}</span>
        {node.hardDependenciesSatisfied ? (
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
        ) : (
          <XCircle className="h-3 w-3 text-rose-500" />
        )}
      </div>
      <p className="mt-0.5 truncate text-xs">{node.label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <StatusBadge status={node.status} />
        <Badge variant="secondary" className="text-[9px]">
          {node.group}
        </Badge>
        {node.prerequisiteCount > 0 && (
          <Badge variant="outline" className="text-[9px]">
            {node.prerequisiteCount} prereqs
          </Badge>
        )}
        {node.hasUnsatisfiedPrerequisites && (
          <Badge
            variant="outline"
            className="border-amber-500/30 bg-amber-500/10 text-[9px] text-amber-700 dark:text-amber-300"
          >
            unsatisfied
          </Badge>
        )}
      </div>
      {node.missingDependencies.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-0.5">
          {node.missingDependencies.map((m) => (
            <Badge
              key={m}
              variant="outline"
              className="border-rose-500/30 bg-rose-500/10 text-[8px] text-rose-700 dark:text-rose-300"
            >
              {m}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// -------------------- 7. Feature Flags --------------------

function FeatureFlagsSubTab() {
  const [data, setData] = React.useState<FlagsResponse | null>(null);
  const [tree, setTree] = React.useState<TreeResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [addOpen, setAddOpen] = React.useState(false);
  const [addForm, setAddForm] = React.useState({
    capabilityId: "",
    scope: "COUNTRY" as Scope,
    target: "",
    enabled: false,
    reason: "",
  });
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [f, t] = await Promise.all([
      gcrFetch<FlagsResponse>("/api/admin/gcr/flags"),
      gcrFetch<TreeResponse>("/api/admin/gcr/tree"),
    ]);
    setData(f);
    setTree(t);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const allCapabilities = React.useMemo(() => {
    if (!tree) return [];
    return tree.tree.flatMap((g) => g.capabilities.map((c) => c.id));
  }, [tree]);

  const toggleFlag = React.useCallback(
    async (flag: GcrFlag, enabled: boolean) => {
      setData((cur) =>
        cur
          ? {
              ...cur,
              flags: cur.flags.map((f) =>
                f.capabilityId === flag.capabilityId &&
                f.scope === flag.scope &&
                f.target === flag.target
                  ? { ...f, enabled }
                  : f
              ),
              stats: {
                ...cur.stats,
                enabled: cur.stats.enabled + (enabled ? 1 : -1),
                disabled: cur.stats.disabled + (enabled ? -1 : 1),
              },
            }
          : cur
      );
      try {
        const res = await fetch("/api/admin/gcr/flags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            capabilityId: flag.capabilityId,
            scope: flag.scope,
            target: flag.target,
            enabled,
            reason: flag.reason ?? "Toggled via admin UI",
          }),
        });
        if (!res.ok) throw new Error();
        toast.success(`Flag ${enabled ? "enabled" : "disabled"}`);
      } catch {
        toast.error("Failed to update flag");
        load();
      }
    },
    [load]
  );

  const deleteFlag = React.useCallback(
    async (flag: GcrFlag) => {
      if (!confirm(`Delete flag for ${flag.capabilityId} (${flag.scope}=${flag.target})?`)) return;
      setData((cur) =>
        cur
          ? {
              ...cur,
              flags: cur.flags.filter(
                (f) =>
                  !(
                    f.capabilityId === flag.capabilityId &&
                    f.scope === flag.scope &&
                    f.target === flag.target
                  )
              ),
              count: cur.count - 1,
            }
          : cur
      );
      try {
        const params = new URLSearchParams({
          capabilityId: flag.capabilityId,
          scope: flag.scope,
          target: flag.target,
        });
        const res = await fetch(`/api/admin/gcr/flags?${params.toString()}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        toast.success("Flag deleted");
        load();
      } catch {
        toast.error("Failed to delete flag");
        load();
      }
    },
    [load]
  );

  const submitAdd = React.useCallback(async () => {
    if (!addForm.capabilityId || !addForm.scope || !addForm.target) {
      toast.error("Capability, scope, and target are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/gcr/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capabilityId: addForm.capabilityId,
          scope: addForm.scope,
          target: addForm.target.trim(),
          enabled: addForm.enabled,
          reason: addForm.reason.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed");
      }
      toast.success("Flag created");
      setAddOpen(false);
      setAddForm({ capabilityId: "", scope: "COUNTRY", target: "", enabled: false, reason: "" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create flag");
    } finally {
      setSaving(false);
    }
  }, [addForm, load]);

  if (loading)
    return (
      <div className="space-y-3">
        <GridSkeleton count={4} />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  if (!data) return <EmptyState message="Could not load feature flags" />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total" value={data.stats.total} icon={Flag} accent="violet" />
        <StatCard label="Enabled" value={data.stats.enabled} icon={Zap} accent="emerald" />
        <StatCard label="Disabled" value={data.stats.disabled} icon={XCircle} accent="rose" />
        <StatCard
          label="Scopes"
          value={Object.keys(data.stats.byScope).length}
          icon={Layers}
          accent="amber"
        />
      </div>

      <Card className="p-5">
        <SectionHeader
          title="By Scope"
          description="Distribution of overrides across the 6 scope types"
          icon={Layers}
        />
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
          {(Object.keys(SCOPE_TONE) as Scope[]).map((s) => (
            <div key={s} className={`rounded-lg border p-3 ${SCOPE_TONE[s]}`}>
              <p className="text-[10px] font-semibold tracking-wide uppercase opacity-70">{s}</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{data.stats.byScope[s] ?? 0}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeader
          title="Capability Overrides"
          description={`${data.flags.length} flag${data.flags.length === 1 ? "" : "s"} configured`}
          icon={Flag}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
              <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Flag
              </Button>
            </>
          }
        />
        <div className="mt-4 max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
          {data.flags.length === 0 && <EmptyState message="No flags configured" />}
          {data.flags.map((f) => (
            <div
              key={`${f.capabilityId}-${f.scope}-${f.target}`}
              className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-xs font-semibold">{f.capabilityId}</span>
                  <ScopeBadge scope={f.scope} />
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {f.target}
                  </Badge>
                </div>
                {f.reason && <p className="text-muted-foreground mt-1 text-xs">{f.reason}</p>}
                <p className="text-muted-foreground mt-0.5 text-[10px]">
                  Updated {new Date(f.updatedAt).toLocaleString()}
                  {f.updatedBy && ` · by ${f.updatedBy}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={f.enabled}
                  onCheckedChange={(v) => toggleFlag(f, v)}
                  aria-label="Toggle flag"
                />
                <span
                  className={`text-xs font-medium ${f.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
                >
                  {f.enabled ? "Enabled" : "Disabled"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteFlag(f)}
                  className="text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Capability Override</DialogTitle>
            <DialogDescription>
              Override a capability&apos;s availability for a specific scope.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Capability</Label>
              <Select
                value={addForm.capabilityId}
                onValueChange={(v) => setAddForm((f) => ({ ...f, capabilityId: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select capability" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {allCapabilities.map((c) => (
                    <SelectItem key={c} value={c}>
                      <span className="font-mono text-xs">{c}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Scope</Label>
              <Select
                value={addForm.scope}
                onValueChange={(v) => setAddForm((f) => ({ ...f, scope: v as Scope }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SCOPE_TONE) as Scope[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Target</Label>
              <Input
                placeholder="NG / merchant_123 / 2 / production…"
                value={addForm.target}
                onChange={(e) => setAddForm((f) => ({ ...f, target: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason (audit trail)</Label>
              <Input
                placeholder="Why is this override being set?"
                value={addForm.reason}
                onChange={(e) => setAddForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-medium">Enabled</Label>
                <p className="text-muted-foreground text-xs">
                  Whether the override enables the capability.
                </p>
              </div>
              <Switch
                checked={addForm.enabled}
                onCheckedChange={(v) => setAddForm((f) => ({ ...f, enabled: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitAdd} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// -------------------- 8. Certification --------------------

function CertificationSubTab() {
  const [data, setData] = React.useState<CertResponse | null>(null);
  const [tree, setTree] = React.useState<TreeResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<{ provider: string; capability: string } | null>(
    null
  );
  const [detail, setDetail] = React.useState<CapabilityDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [running, setRunning] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [c, t] = await Promise.all([
      gcrFetch<CertResponse>("/api/admin/gcr/certification"),
      gcrFetch<TreeResponse>("/api/admin/gcr/tree"),
    ]);
    setData(c);
    setTree(t);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const topCapabilities = React.useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, { id: string; name: string; count: number }>();
    data.matrix.forEach((row) => {
      const existing = counts.get(row.capabilityId);
      if (existing) existing.count++;
      else
        counts.set(row.capabilityId, { id: row.capabilityId, name: row.capabilityName, count: 1 });
    });
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [data]);

  const providers = React.useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    data.matrix.forEach((r) => set.add(r.providerCode));
    return Array.from(set).sort();
  }, [data]);

  const lookup = React.useMemo(() => {
    const m = new Map<string, CertMatrixRow>();
    data?.matrix.forEach((r) => m.set(`${r.providerCode}|${r.capabilityId}`, r));
    return m;
  }, [data]);

  const openDetail = React.useCallback(async (provider: string, capability: string) => {
    setSelected({ provider, capability });
    setDetail(null);
    setLoadingDetail(true);
    const d = await gcrFetch<CapabilityDetailResponse>(
      `/api/admin/gcr/capabilities?id=${encodeURIComponent(capability)}`
    );
    setDetail(d);
    setLoadingDetail(false);
  }, []);

  const runCert = React.useCallback(
    async (provider: string, capability: string) => {
      setRunning(`${provider}|${capability}`);
      try {
        const res = await fetch("/api/admin/gcr/certification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, capability }),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error ?? "Failed");
        }
        const cert = (await res.json()).cert as CertDetail;
        toast.success(
          `Certification ${cert.status.toLowerCase()} — ${cert.passed}/${cert.total} passed`
        );
        load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to run certification");
      } finally {
        setRunning(null);
      }
    },
    [load]
  );

  if (loading)
    return (
      <div className="space-y-3">
        <GridSkeleton count={4} />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  if (!data) return <EmptyState message="Could not load certification data" />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total" value={data.stats.total} icon={ShieldCheck} accent="violet" />
        <StatCard
          label="Certified"
          value={data.stats.certified}
          icon={CheckCircle2}
          accent="emerald"
        />
        <StatCard label="In Progress" value={data.stats.inProgress} icon={Clock} accent="amber" />
        <StatCard label="Failed" value={data.stats.failed} icon={XCircle} accent="rose" />
        <StatCard label="Pending" value={data.stats.pending} icon={AlertCircle} accent="slate" />
      </div>

      <Card className="p-4">
        <SectionHeader
          title="Certification Matrix"
          description={`${providers.length} providers × top ${topCapabilities.length} capabilities (by provider count)`}
          icon={ShieldCheck}
          actions={
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          }
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(CERT_TONE) as CertStatus[]).map((s) => (
            <Badge key={s} variant="outline" className={`text-[9px] ${CERT_TONE[s]}`}>
              {s.replace("_", " ")}
            </Badge>
          ))}
        </div>
      </Card>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            <div
              className="grid border-b"
              style={{
                gridTemplateColumns: `180px repeat(${topCapabilities.length}, minmax(90px, 1fr))`,
              }}
            >
              <div className="px-3 py-2 text-xs font-semibold tracking-wide uppercase">
                Provider
              </div>
              {topCapabilities.map((c) => (
                <div key={c.id} className="border-l px-2 py-2 text-center">
                  <p className="truncate text-xs font-semibold" title={c.name}>
                    {c.name}
                  </p>
                  <p className="text-muted-foreground font-mono text-[9px]">{c.id}</p>
                </div>
              ))}
            </div>
            {providers.map((p) => (
              <div
                key={p}
                className="grid border-b last:border-b-0"
                style={{
                  gridTemplateColumns: `180px repeat(${topCapabilities.length}, minmax(90px, 1fr))`,
                }}
              >
                <div className="px-3 py-2">
                  <p className="font-mono text-sm font-semibold">{p}</p>
                </div>
                {topCapabilities.map((c) => {
                  const row = lookup.get(`${p}|${c.id}`);
                  if (!row)
                    return (
                      <div key={c.id} className="border-l px-2 py-2 text-center">
                        <span className="text-muted-foreground text-xs">—</span>
                      </div>
                    );
                  return (
                    <button
                      key={c.id}
                      onClick={() => openDetail(p, c.id)}
                      className={`border-l px-2 py-2 text-center transition-colors hover:opacity-80 ${CERT_TONE[row.status]}`}
                    >
                      <p className="text-[10px] font-bold uppercase">
                        {row.status.replace("_", " ")}
                      </p>
                      <p className="text-[9px] tabular-nums">
                        {row.mandatoryPassed}/{row.mandatoryTotal} mandatory
                      </p>
                    </button>
                  );
                })}
              </div>
            ))}
            {providers.length === 0 && (
              <div className="p-6">
                <EmptyState message="No certification entries" />
              </div>
            )}
          </div>
        </div>
      </Card>

      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selected && (
                <>
                  <span className="font-mono">{selected.provider}</span>
                  <ChevronRight className="text-muted-foreground h-4 w-4" />
                  <span className="font-mono text-sm">{selected.capability}</span>
                </>
              )}
            </DialogTitle>
            <DialogDescription>Certification details and test execution</DialogDescription>
          </DialogHeader>

          {loadingDetail ? (
            <ListSkeleton rows={3} />
          ) : !detail || !selected ? (
            <EmptyState message="Could not load detail" />
          ) : (
            <div className="space-y-3">
              {(() => {
                const cert = detail.certifications.find(
                  (c) => c.providerCode === selected.provider
                )?.certification;
                if (!cert) {
                  return (
                    <div className="rounded-lg border border-slate-500/30 bg-slate-500/10 p-3">
                      <p className="text-sm font-medium">No certification run yet.</p>
                      <p className="text-muted-foreground text-xs">
                        Run a certification to evaluate this provider against the test suite.
                      </p>
                    </div>
                  );
                }
                return (
                  <div className={`rounded-lg border p-3 ${CERT_TONE[cert.status]}`}>
                    <div className="flex items-center justify-between">
                      <CertBadge status={cert.status} />
                      {cert.lastRunAt && (
                        <span className="text-[10px] opacity-70">
                          {new Date(cert.lastRunAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                      {[
                        ["Passed", cert.passed, "emerald"],
                        ["Failed", cert.failed, "rose"],
                        ["Total", cert.total, "violet"],
                        ["Mandatory", `${cert.mandatoryPassed}/${cert.mandatoryTotal}`, "amber"],
                      ].map(([k, v, accent]) => (
                        <div key={k as string} className="rounded-lg border border-current/20 p-2">
                          <p className="text-[10px] font-semibold tracking-wide uppercase opacity-70">
                            {k}
                          </p>
                          <p
                            className={`mt-0.5 text-lg font-bold tabular-nums ${ACCENT_TEXT[accent as string] ?? ACCENT_TEXT.emerald}`}
                          >
                            {v as string | number}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {detail.tests.length > 0 && (
                <div className="max-h-60 space-y-1 overflow-y-auto pr-1">
                  {detail.tests.map((t) => {
                    const result = detail.certifications
                      .find((c) => c.providerCode === selected.provider)
                      ?.certification?.results?.find((r) => r.slug === t.slug);
                    return (
                      <div key={t.slug} className="flex items-start gap-2 rounded-lg border p-2">
                        {result ? (
                          result.passed ? (
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <XCircle className="mt-0.5 h-3.5 w-3.5 text-rose-500" />
                          )
                        ) : (
                          <Clock className="text-muted-foreground mt-0.5 h-3.5 w-3.5" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium">{t.name}</span>
                            {t.mandatory && (
                              <Badge
                                variant="outline"
                                className="border-emerald-500/30 bg-emerald-500/10 text-[8px] text-emerald-700 dark:text-emerald-300"
                              >
                                MANDATORY
                              </Badge>
                            )}
                          </div>
                          <p className="text-muted-foreground font-mono text-[10px]">
                            {t.slug} · {t.category}
                          </p>
                          <p className="text-muted-foreground text-[10px]">{t.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>
              Close
            </Button>
            {selected && (
              <Button
                onClick={() => runCert(selected.provider, selected.capability)}
                disabled={running === `${selected.provider}|${selected.capability}`}
                className="gap-1.5"
              >
                {running === `${selected.provider}|${selected.capability}` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}{" "}
                Run Certification
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
