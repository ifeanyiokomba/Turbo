"use client";

// Admin tab — Database Architecture (Chapter 8 of the TurboPay Bible)
//
// Visualizes the TurboCore data platform:
//   - 17 bounded domains
//   - ~120 tables (85 existing + 35 planned)
//   - Canonical relationships
//   - Partitioning strategy
//   - Backup & DR strategy
//   - Prefixed ULID ID system
//
// The component uses a simple state-based sub-tab switcher (not the shadcn
// Tabs component) so the admin shell can lazy-load the entire database view
// without affecting other admin tabs.
//
// Sub-tabs:
//   1. Overview        — stat cards, Golden Rule, principles, ID showcase
//   2. Domain Map      — visual grid of all 17 domains
//   3. Table Catalog   — searchable / filterable / sortable table list
//   4. Relationships   — canonical relationships + visual flows
//   5. Index Strategy  — high-priority indexes + partitioning strategy
//   6. Backup & DR     — RPO/RTO targets + backup layers
//   7. Domain Detail   — overlay reached by clicking a domain card
//
// All data is fetched once from GET /api/admin/database with cache: "no-store".

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Database,
  Search,
  Filter,
  ChevronLeft,
  Key,
  HardDrive,
  Archive,
  Clock,
  Shield,
  GitBranch,
  Layers,
  Table as TableIcon,
  Zap,
  Bell,
  ScrollText,
  Settings,
  BarChart3,
  ArrowLeftRight,
  Scale,
  ShieldAlert,
  Globe,
  Store,
  Server,
  Network,
  CreditCard,
  BookOpen,
  Wallet,
  Users,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

// ============================================================================
// Types — mirror the API contract at /api/admin/database
// ============================================================================

interface DomainTable {
  model: string;
  name: string;
  purpose: string;
  exists: boolean;
  keyIndexes: string[];
  partitioned: boolean;
  softDelete: boolean;
  idPrefix: string;
}

interface DomainInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  accent: string;
  order: number;
  principle: string;
  tables: DomainTable[];
}

interface Relationship {
  from: string;
  to: string;
  type: "one-to-one" | "one-to-many" | "many-to-many" | "many-to-one";
  description: string;
}

interface PartitionStrategy {
  table: string;
  partitionBy: "monthly" | "daily" | "yearly";
  reason: string;
  estimatedRowsPerMonth: string;
}

interface BackupStrategy {
  layer: string;
  frequency: string;
  retention: string;
  purpose: string;
}

interface DrTargets {
  rpo: string;
  rto: string;
  description: string;
}

interface DbStats {
  totalDomains: number;
  totalTables: number;
  existingTables: number;
  plannedTables: number;
  partitionedTables: number;
  softDeleteTables: number;
  tablesByDomain: {
    domain: string;
    name: string;
    total: number;
    existing: number;
    planned: number;
  }[];
}

interface DatabaseData {
  domains: DomainInfo[];
  stats: DbStats;
  relationships: Relationship[];
  partitionStrategies: PartitionStrategy[];
  backupStrategies: BackupStrategy[];
  drTargets: DrTargets;
  idPrefixes: Record<string, string>;
}

// ============================================================================
// Accent color map — every domain has an accent color used for borders,
// backgrounds, and badges. None of the accents is indigo or blue-as-primary
// (we use violet/emerald/amber/rose/cyan/etc.).
// ============================================================================

interface AccentClasses {
  border: string;
  bg: string;
  text: string;
  badge: string;
  ring: string;
}

// Tailwind needs literal class names to include them in the build, so we
// list every accent's classes inline. Each accent is a single line — keeps
// the map compact and grep-friendly.
const accentMap: Record<string, AccentClasses> = {
  violet: {
    border: "border-violet-500/40",
    bg: "bg-violet-500/10",
    text: "text-violet-600 dark:text-violet-400",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    ring: "ring-violet-500/30",
  },
  blue: {
    border: "border-blue-500/40",
    bg: "bg-blue-500/10",
    text: "text-blue-600 dark:text-blue-400",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    ring: "ring-blue-500/30",
  },
  amber: {
    border: "border-amber-500/40",
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    ring: "ring-amber-500/30",
  },
  emerald: {
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    ring: "ring-emerald-500/30",
  },
  rose: {
    border: "border-rose-500/40",
    bg: "bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-400",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    ring: "ring-rose-500/30",
  },
  cyan: {
    border: "border-cyan-500/40",
    bg: "bg-cyan-500/10",
    text: "text-cyan-600 dark:text-cyan-400",
    badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
    ring: "ring-cyan-500/30",
  },
  indigo: {
    border: "border-indigo-500/40",
    bg: "bg-indigo-500/10",
    text: "text-indigo-600 dark:text-indigo-400",
    badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
    ring: "ring-indigo-500/30",
  },
  green: {
    border: "border-green-500/40",
    bg: "bg-green-500/10",
    text: "text-green-600 dark:text-green-400",
    badge: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
    ring: "ring-green-500/30",
  },
  orange: {
    border: "border-orange-500/40",
    bg: "bg-orange-500/10",
    text: "text-orange-600 dark:text-orange-400",
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
    ring: "ring-orange-500/30",
  },
  fuchsia: {
    border: "border-fuchsia-500/40",
    bg: "bg-fuchsia-500/10",
    text: "text-fuchsia-600 dark:text-fuchsia-400",
    badge: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
    ring: "ring-fuchsia-500/30",
  },
  red: {
    border: "border-red-500/40",
    bg: "bg-red-500/10",
    text: "text-red-600 dark:text-red-400",
    badge: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    ring: "ring-red-500/30",
  },
  teal: {
    border: "border-teal-500/40",
    bg: "bg-teal-500/10",
    text: "text-teal-600 dark:text-teal-400",
    badge: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
    ring: "ring-teal-500/30",
  },
  sky: {
    border: "border-sky-500/40",
    bg: "bg-sky-500/10",
    text: "text-sky-600 dark:text-sky-400",
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    ring: "ring-sky-500/30",
  },
  slate: {
    border: "border-slate-500/40",
    bg: "bg-slate-500/10",
    text: "text-slate-600 dark:text-slate-300",
    badge: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
    ring: "ring-slate-500/30",
  },
  purple: {
    border: "border-purple-500/40",
    bg: "bg-purple-500/10",
    text: "text-purple-600 dark:text-purple-400",
    badge: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
    ring: "ring-purple-500/30",
  },
  lime: {
    border: "border-lime-500/40",
    bg: "bg-lime-500/10",
    text: "text-lime-600 dark:text-lime-400",
    badge: "bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300",
    ring: "ring-lime-500/30",
  },
  yellow: {
    border: "border-yellow-500/40",
    bg: "bg-yellow-500/10",
    text: "text-yellow-600 dark:text-yellow-400",
    badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
    ring: "ring-yellow-500/30",
  },
};

function accentFor(accent: string): AccentClasses {
  return accentMap[accent] ?? accentMap.slate;
}

// ============================================================================
// Icon map — domains store their icon as a string. Map them to lucide
// components so we never have to use a `dynamic` import.
// ============================================================================

const iconMap: Record<string, LucideIcon> = {
  ShieldCheck,
  Users,
  Wallet,
  BookOpen,
  CreditCard,
  Server,
  Network,
  Globe,
  Store,
  Scale,
  ShieldAlert,
  ArrowLeftRight,
  Bell,
  ScrollText,
  Settings,
  BarChart3,
  Zap,
  Database,
  Shield,
  Layers,
};

function IconFor({ name, className }: { name: string; className?: string }) {
  const Cmp = iconMap[name] ?? Database;
  return <Cmp className={className} />;
}

// ============================================================================
// Sub-tab definition
// ============================================================================

type SubTab = "overview" | "domains" | "tables" | "relationships" | "indexes" | "backup";

interface SubTabDef {
  id: SubTab;
  label: string;
  icon: LucideIcon;
  description: string;
}

const SUB_TABS: SubTabDef[] = [
  {
    id: "overview",
    label: "Overview",
    icon: Database,
    description: "Architecture at a glance — domains, tables, principles, DR.",
  },
  {
    id: "domains",
    label: "Domain Map",
    icon: Layers,
    description: "All 17 bounded domains and their tables.",
  },
  {
    id: "tables",
    label: "Table Catalog",
    icon: TableIcon,
    description: "Searchable, filterable catalog of every table.",
  },
  {
    id: "relationships",
    label: "Relationships",
    icon: GitBranch,
    description: "Canonical entity relationships and data flows.",
  },
  {
    id: "indexes",
    label: "Index Strategy",
    icon: HardDrive,
    description: "High-priority indexes and partitioning plan.",
  },
  {
    id: "backup",
    label: "Backup & DR",
    icon: Shield,
    description: "Recovery objectives and backup layers.",
  },
];

// ============================================================================
// Relationship type → badge tone
// ============================================================================

const REL_TYPE_TONE: Record<Relationship["type"], { badge: string; arrow: string }> = {
  "one-to-one": {
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    arrow: "text-sky-500",
  },
  "one-to-many": {
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    arrow: "text-emerald-500",
  },
  "many-to-many": {
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    arrow: "text-amber-500",
  },
  "many-to-one": {
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    arrow: "text-violet-500",
  },
};

// ============================================================================
// Pre-built visual flows (canonical chains mentioned in Chapter 8)
// ============================================================================

interface FlowDef {
  title: string;
  steps: string[];
  accent: string;
  caption: string;
}

const CANONICAL_FLOWS: FlowDef[] = [
  {
    title: "Money Flow",
    steps: ["Customer", "Wallet", "LedgerAccount", "JournalEntry"],
    accent: "emerald",
    caption: "How a balance moves from a customer to the immutable ledger.",
  },
  {
    title: "Payment Lifecycle",
    steps: ["Payment", "Provider", "Settlement", "Reconciliation"],
    accent: "cyan",
    caption: "A payment is processed by a provider, then settled, then reconciled.",
  },
  {
    title: "Capability Resolution",
    steps: ["Country", "Capability", "Provider"],
    accent: "violet",
    caption: "Countries enable capabilities that providers implement.",
  },
];

// ============================================================================
// Main component
// ============================================================================

export default function DatabaseTab() {
  const [data, setData] = React.useState<DatabaseData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [subTab, setSubTab] = React.useState<SubTab>("overview");
  const [selectedDomainId, setSelectedDomainId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/database", { cache: "no-store" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      setData((await res.json()) as DatabaseData);
    } catch (e) {
      toast.error(
        e instanceof Error
          ? `Failed to load database catalog: ${e.message}`
          : "Failed to load database catalog"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const selectedDomain = React.useMemo<DomainInfo | null>(() => {
    if (!selectedDomainId || !data) return null;
    return data.domains.find((d) => d.id === selectedDomainId) ?? null;
  }, [selectedDomainId, data]);

  // When a domain is selected we render the Domain Detail overlay regardless
  // of the active sub-tab (most natural when clicked from the Domain Map).
  if (selectedDomain) {
    return <DomainDetailView domain={selectedDomain} onBack={() => setSelectedDomainId(null)} />;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-lg">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Database Architecture</h2>
              <p className="text-muted-foreground text-xs">TurboCore data platform · Chapter 8</p>
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <Database className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Sub-tab switcher (state-based, not the shadcn Tabs component) */}
      <SubTabBar active={subTab} onChange={setSubTab} />

      <Separator />

      {/* Sub-tab content */}
      {loading && !data ? (
        <DatabaseSkeleton />
      ) : data ? (
        <>
          {subTab === "overview" && <OverviewTab data={data} />}
          {subTab === "domains" && (
            <DomainMapTab data={data} onSelectDomain={setSelectedDomainId} />
          )}
          {subTab === "tables" && <TableCatalogTab data={data} />}
          {subTab === "relationships" && <RelationshipsTab data={data} />}
          {subTab === "indexes" && <IndexStrategyTab data={data} />}
          {subTab === "backup" && <BackupDRTab data={data} />}
        </>
      ) : null}
    </div>
  );
}

// ============================================================================
// Sub-tab bar
// ============================================================================

function SubTabBar({ active, onChange }: { active: SubTab; onChange: (t: SubTab) => void }) {
  return (
    <div className="flex w-full gap-1.5 overflow-x-auto pb-1">
      {SUB_TABS.map((t) => {
        const isActive = t.id === active;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-pressed={isActive}
            className={`inline-flex min-w-fit items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Loading skeleton
// ============================================================================

function DatabaseSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-20 rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 1. Overview sub-tab
// ============================================================================

const DB_PRINCIPLES = [
  {
    title: "One Responsibility per Table",
    description:
      "Each table owns exactly one concept. Never mix concerns — a users table is never a ledger table.",
    icon: Layers,
    accent: "emerald",
  },
  {
    title: "Globally Unique IDs",
    description:
      "Every entity receives a prefixed ULID. IDs are self-documenting in logs and never leak database PKs.",
    icon: Key,
    accent: "violet",
  },
  {
    title: "Soft Delete Only",
    description:
      "Records are marked deletedAt / deletedBy, never physically dropped. Audit trails stay intact forever.",
    icon: Archive,
    accent: "amber",
  },
];

// A representative subset of ID prefixes shown in the showcase grid. The full
// map is exposed by the API; we render a curated sample so the visual is
// dense without being a wall of text.
const ID_SHOWCASE: { prefix: string; entity: string; sample: string }[] = [
  { prefix: "usr", entity: "User", sample: "usr_01H7X5K8ZQ3J0WMN2YV4P6R8AB" },
  { prefix: "txn", entity: "Transaction", sample: "txn_01H8A6L9BR4K1XNO3ZW5Q7S9CD" },
  { prefix: "wal", entity: "Wallet", sample: "wal_01H9B7M0CS5L2YOP4AX6R8T0EF" },
  { prefix: "prv", entity: "Provider", sample: "prv_01HAC8N1DT6M3ZPQ4BY7S9U1GH" },
  { prefix: "led", entity: "Ledger Entry", sample: "led_01HBD9O2EU7N4AQR5CZ8T0V2IJ" },
  { prefix: "cap", entity: "Capability", sample: "cap_01HCE0P3FV8O5BRS6DA1U3W3KL" },
  { prefix: "mer", entity: "Merchant", sample: "mer_01HDF1Q4GW9P6CST7EB2V4X4MN" },
  { prefix: "ctry", entity: "Country", sample: "ctry_01HEG2R5HX0Q7DTU8FC3W5Y5OP" },
  { prefix: "sett", entity: "Settlement", sample: "sett_01HFH3S6IY1R8EUV9GD4X6Z6QR" },
  { prefix: "kyc", entity: "KYC Request", sample: "kyc_01HGI4T7JZ2S9FVW0HE5Y7A7ST" },
  { prefix: "pmt", entity: "Payment", sample: "pmt_01HHJ5U8KA3T0GWX1IF6Z8B8UV" },
  { prefix: "evt", entity: "Event Store", sample: "evt_01HJK6V9LB4U1HXY2JG7A9C9WX" },
];

function OverviewTab({ data }: { data: DatabaseData }) {
  const { stats, drTargets, backupStrategies, idPrefixes } = data;

  const idPrefixCount = React.useMemo(() => Object.keys(idPrefixes ?? {}).length, [idPrefixes]);

  return (
    <div className="space-y-5">
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Layers className="h-5 w-5" />}
          accent="violet"
          label="Bounded Domains"
          value={stats.totalDomains}
          hint="Each owns its schema"
        />
        <StatCard
          icon={<TableIcon className="h-5 w-5" />}
          accent="emerald"
          label="Tables"
          value={stats.totalTables}
          hint={`${stats.existingTables} existing · ${stats.plannedTables} planned`}
        />
        <StatCard
          icon={<HardDrive className="h-5 w-5" />}
          accent="cyan"
          label="Partitioned"
          value={stats.partitionedTables}
          hint="By month / day / year"
        />
        <StatCard
          icon={<Archive className="h-5 w-5" />}
          accent="amber"
          label="Soft Delete"
          value={stats.softDeleteTables}
          hint="Never physically deleted"
        />
      </div>

      {/* Golden Rule banner */}
      <Card className="border-emerald-500/30 bg-emerald-500/5 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                The Golden Rule
              </p>
              <p className="text-base font-semibold tracking-tight sm:text-lg">
                “Design for the next 10 years, not the first 10 months.”
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <Badge
              variant="outline"
              className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
            >
              RPO {drTargets.rpo}
            </Badge>
            <Badge
              variant="outline"
              className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
            >
              RTO {drTargets.rto}
            </Badge>
            <Badge
              variant="outline"
              className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
            >
              {backupStrategies.length} backup layers
            </Badge>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Database Principles */}
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="text-primary h-5 w-5" />
            <h3 className="text-sm font-semibold">Database Principles</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {DB_PRINCIPLES.map((p) => {
              const a = accentFor(p.accent);
              const Icon = p.icon;
              return (
                <div key={p.title} className={`rounded-xl border p-4 ${a.border} ${a.bg}`}>
                  <Icon className={`h-5 w-5 ${a.text}`} />
                  <p className="mt-2 text-sm font-semibold">{p.title}</p>
                  <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                    {p.description}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Backup & DR mini summary */}
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Shield className="text-primary h-5 w-5" />
            <h3 className="text-sm font-semibold">Backup &amp; DR</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground text-xs">RPO</span>
              <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                {drTargets.rpo}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground text-xs">RTO</span>
              <span className="text-base font-bold text-cyan-600 dark:text-cyan-400">
                {drTargets.rto}
              </span>
            </div>
            <Separator />
            <ul className="space-y-2">
              {backupStrategies.map((b) => (
                <li key={b.layer} className="flex items-start gap-2 text-xs">
                  <Clock className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{b.layer}</p>
                    <p className="text-muted-foreground">
                      {b.frequency} · retains {b.retention}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      {/* ID prefix showcase */}
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Key className="text-primary h-5 w-5" />
            <h3 className="text-sm font-semibold">Prefixed ID System</h3>
          </div>
          <Badge variant="secondary">{idPrefixCount} prefixes registered</Badge>
        </div>
        <p className="text-muted-foreground mb-4 text-xs">
          Every entity has a prefixed ULID — self-documenting in logs and URLs, time-sortable to the
          millisecond, never leaking the database PK.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ID_SHOWCASE.map((row) => (
            <div
              key={row.prefix}
              className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/40"
            >
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="font-mono text-[10px]">
                  {row.prefix}_
                </Badge>
                <span className="text-muted-foreground text-[10px]">{row.entity}</span>
              </div>
              <code className="text-foreground truncate font-mono text-[11px]">{row.sample}</code>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint?: string;
  accent: string;
}) {
  const a = accentFor(accent);
  return (
    <Card className={`p-4 ${a.border}`}>
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${a.bg} ${a.text}`}>
          {icon}
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
    </Card>
  );
}

// ============================================================================
// 2. Domain Map sub-tab
// ============================================================================

function DomainMapTab({
  data,
  onSelectDomain,
}: {
  data: DatabaseData;
  onSelectDomain: (id: string) => void;
}) {
  const sorted = React.useMemo(
    () => [...data.domains].sort((a, b) => a.order - b.order),
    [data.domains]
  );

  return (
    <div className="space-y-4">
      <SubTabHeader
        icon={<Layers className="h-5 w-5" />}
        title="Domain Map"
        description="17 bounded domains. Each owns its schema and its APIs."
        stats={[
          { label: "Domains", value: data.stats.totalDomains },
          { label: "Tables", value: data.stats.totalTables },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((d) => {
          const a = accentFor(d.accent);
          const existing = d.tables.filter((t) => t.exists).length;
          const planned = d.tables.length - existing;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onSelectDomain(d.id)}
              className={`group text-left transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 ${a.ring} focus-visible:ring-offset-2`}
            >
              <Card className={`h-full p-5 transition-colors ${a.border} hover:${a.bg}`}>
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${a.bg} ${a.text}`}
                  >
                    <IconFor name={d.icon} className="h-5 w-5" />
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${a.badge}`}>
                    {d.tables.length} tables
                  </Badge>
                </div>
                <p className="mt-3 text-sm font-semibold tracking-tight">{d.name}</p>
                <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                  {d.description}
                </p>
                <Separator className="my-3" />
                <p className={`text-[11px] italic ${a.text}`}>“{d.principle}”</p>
                <div className="mt-3 flex items-center gap-2 text-[10px]">
                  <Badge
                    variant="outline"
                    className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                  >
                    {existing} existing
                  </Badge>
                  {planned > 0 && (
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 text-amber-600 dark:text-amber-400"
                    >
                      {planned} planned
                    </Badge>
                  )}
                  <span className="text-muted-foreground ml-auto inline-flex items-center gap-1 transition-transform group-hover:translate-x-0.5">
                    View →
                  </span>
                </div>
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 3. Table Catalog sub-tab
// ============================================================================

type SortKey = "name" | "domain" | "purpose" | "exists" | "partitioned" | "softDelete" | "idPrefix";
type SortDir = "asc" | "desc";

interface CatalogRow {
  model: string;
  name: string;
  purpose: string;
  exists: boolean;
  keyIndexes: string[];
  partitioned: boolean;
  softDelete: boolean;
  idPrefix: string;
  domainId: string;
  domainName: string;
  accent: string;
}

function TableCatalogTab({ data }: { data: DatabaseData }) {
  const [search, setSearch] = React.useState("");
  const [domainFilter, setDomainFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [partitionedFilter, setPartitionedFilter] = React.useState<string>("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("name");
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");

  // Flatten all tables into one row set.
  const rows: CatalogRow[] = React.useMemo(() => {
    const out: CatalogRow[] = [];
    for (const d of data.domains) {
      for (const t of d.tables) {
        out.push({
          ...t,
          domainId: d.id,
          domainName: d.name,
          accent: d.accent,
        });
      }
    }
    return out;
  }, [data.domains]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (domainFilter !== "all" && r.domainId !== domainFilter) return false;
      if (statusFilter === "exists" && !r.exists) return false;
      if (statusFilter === "planned" && r.exists) return false;
      if (partitionedFilter === "yes" && !r.partitioned) return false;
      if (partitionedFilter === "no" && r.partitioned) return false;
      if (!q) return true;
      const hay = [r.name, r.model, r.purpose, r.idPrefix, r.domainName, ...r.keyIndexes]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    out = out.sort((a, b) => {
      const av: string | boolean = a[sortKey];
      const bv: string | boolean = b[sortKey];
      // Coerce booleans to "0"/"1" so they sort predictably alongside strings.
      const as = typeof av === "boolean" ? (av ? "1" : "0") : av;
      const bs = typeof bv === "boolean" ? (bv ? "1" : "0") : bv;
      const cmp = String(as).localeCompare(String(bs), undefined, {
        numeric: true,
        sensitivity: "base",
      });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [rows, search, domainFilter, statusFilter, partitionedFilter, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("asc");
    }
  }

  return (
    <div className="space-y-4">
      <SubTabHeader
        icon={<TableIcon className="h-5 w-5" />}
        title="Table Catalog"
        description="Search, filter, and sort every table across all domains."
        stats={[
          { label: "Total", value: data.stats.totalTables },
          { label: "Existing", value: data.stats.existingTables },
          { label: "Planned", value: data.stats.plannedTables },
        ]}
      />

      {/* Filter controls */}
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="name, purpose, index…"
                className="pl-8"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Domain</Label>
            <Select value={domainFilter} onValueChange={setDomainFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All domains" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All domains</SelectItem>
                {[...data.domains]
                  .sort((a, b) => a.order - b.order)
                  .map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="exists">Exists only</SelectItem>
                <SelectItem value="planned">Planned only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Partitioned</Label>
            <Select value={partitionedFilter} onValueChange={setPartitionedFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                <SelectItem value="yes">Partitioned only</SelectItem>
                <SelectItem value="no">Unpartitioned only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            <Filter className="h-3 w-3" />
            {filtered.length} of {rows.length} tables
          </Badge>
          {(domainFilter !== "all" ||
            statusFilter !== "all" ||
            partitionedFilter !== "all" ||
            search !== "") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setSearch("");
                setDomainFilter("all");
                setStatusFilter("all");
                setPartitionedFilter("all");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card className="p-0">
        <div className="max-h-[36rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 sticky top-0 z-10">
              <tr className="text-left text-xs">
                <ThSort
                  label="Table"
                  active={sortKey === "name"}
                  dir={sortDir}
                  onClick={() => toggleSort("name")}
                />
                <ThSort
                  label="Domain"
                  active={sortKey === "domain"}
                  dir={sortDir}
                  onClick={() => toggleSort("domain")}
                />
                <th className="px-3 py-2 font-medium">Purpose</th>
                <ThSort
                  label="Status"
                  active={sortKey === "exists"}
                  dir={sortDir}
                  onClick={() => toggleSort("exists")}
                />
                <ThSort
                  label="Partition"
                  active={sortKey === "partitioned"}
                  dir={sortDir}
                  onClick={() => toggleSort("partitioned")}
                />
                <ThSort
                  label="Soft Del"
                  active={sortKey === "softDelete"}
                  dir={sortDir}
                  onClick={() => toggleSort("softDelete")}
                />
                <ThSort
                  label="ID"
                  active={sortKey === "idPrefix"}
                  dir={sortDir}
                  onClick={() => toggleSort("idPrefix")}
                />
                <th className="px-3 py-2 font-medium">Key Indexes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const a = accentFor(r.accent);
                return (
                  <tr key={`${r.domainId}-${r.model}`} className="hover:bg-muted/30 border-t">
                    <td className="px-3 py-2 align-top">
                      <div className="font-mono text-xs font-medium">{r.name}</div>
                      <div className="text-muted-foreground text-[10px]">{r.model}</div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Badge variant="outline" className={`text-[10px] ${a.badge}`}>
                        {r.domainName}
                      </Badge>
                    </td>
                    <td className="text-muted-foreground max-w-[20rem] px-3 py-2 align-top text-xs">
                      {r.purpose}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {r.exists ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                        >
                          Exists
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 text-amber-600 dark:text-amber-400"
                        >
                          Planned
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <BooleanPill value={r.partitioned} yesLabel="Yes" noLabel="—" tone="cyan" />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <BooleanPill value={r.softDelete} yesLabel="Yes" noLabel="—" tone="amber" />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <code className="text-foreground rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] dark:bg-slate-800">
                        {r.idPrefix}_
                      </code>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex max-w-[16rem] flex-wrap gap-1">
                        {r.keyIndexes.map((idx) => (
                          <code
                            key={idx}
                            className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px]"
                          >
                            {idx}
                          </code>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-muted-foreground px-3 py-8 text-center text-sm">
                    No tables match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ThSort({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <th className="px-3 py-2 font-medium">
      <button
        type="button"
        onClick={onClick}
        className={`hover:text-foreground inline-flex items-center gap-1 transition-colors ${
          active ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {label}
        <span className="text-[10px]">{active ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

function BooleanPill({
  value,
  yesLabel,
  noLabel,
  tone,
}: {
  value: boolean;
  yesLabel: string;
  noLabel: string;
  tone: "cyan" | "amber" | "emerald";
}) {
  const toneClass =
    tone === "cyan"
      ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
      : tone === "amber"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
  if (!value) {
    return <span className="text-muted-foreground text-xs">{noLabel}</span>;
  }
  return (
    <Badge variant="outline" className={`text-[10px] ${toneClass}`}>
      {yesLabel}
    </Badge>
  );
}

// ============================================================================
// 4. Relationships sub-tab
// ============================================================================

function RelationshipsTab({ data }: { data: DatabaseData }) {
  return (
    <div className="space-y-4">
      <SubTabHeader
        icon={<GitBranch className="h-5 w-5" />}
        title="Canonical Relationships"
        description="How entities reference each other across domain boundaries."
        stats={[
          { label: "Relationships", value: data.relationships.length },
          { label: "Flows", value: CANONICAL_FLOWS.length },
        ]}
      />

      {/* Visual flows */}
      <div className="grid gap-4 lg:grid-cols-3">
        {CANONICAL_FLOWS.map((flow) => {
          const a = accentFor(flow.accent);
          return (
            <Card key={flow.title} className={`p-5 ${a.border}`}>
              <div className="mb-3 flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${a.bg} ${a.text}`}
                >
                  <GitBranch className="h-4 w-4" />
                </div>
                <p className="text-sm font-semibold">{flow.title}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {flow.steps.map((step, i) => (
                  <React.Fragment key={step}>
                    <span
                      className={`rounded-md border px-2 py-1 font-mono text-[11px] font-medium ${a.border} ${a.bg} ${a.text}`}
                    >
                      {step}
                    </span>
                    {i < flow.steps.length - 1 && (
                      <span className={`text-base font-bold ${a.text}`}>→</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
              <p className="text-muted-foreground mt-3 text-xs leading-relaxed">{flow.caption}</p>
            </Card>
          );
        })}
      </div>

      {/* Relationships list */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <GitBranch className="text-primary h-5 w-5" />
          <h3 className="text-sm font-semibold">All Relationships</h3>
          <Badge variant="secondary" className="ml-auto">
            {data.relationships.length}
          </Badge>
        </div>

        {/* Legend */}
        <div className="mb-4 flex flex-wrap gap-2">
          {(Object.keys(REL_TYPE_TONE) as Relationship["type"][]).map((t) => (
            <Badge key={t} variant="outline" className={`text-[10px] ${REL_TYPE_TONE[t].badge}`}>
              {t}
            </Badge>
          ))}
        </div>

        <div className="max-h-[28rem] overflow-y-auto pr-1">
          <ul className="space-y-2">
            {data.relationships.map((r, i) => {
              const tone = REL_TYPE_TONE[r.type];
              return (
                <li key={`${r.from}-${r.to}-${i}`} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {r.from}
                    </Badge>
                    <span className={`text-base font-bold ${tone.arrow}`}>→</span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {r.to}
                    </Badge>
                    <Badge variant="outline" className={`ml-auto text-[10px] ${tone.badge}`}>
                      {r.type}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-2 text-xs">{r.description}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </Card>
    </div>
  );
}

// ============================================================================
// 5. Index Strategy sub-tab
// ============================================================================

function IndexStrategyTab({ data }: { data: DatabaseData }) {
  // Derive a flat list of high-priority indexes (any table with keyIndexes).
  const indexRows = React.useMemo(() => {
    const out: {
      table: string;
      domain: string;
      indexes: string[];
      partitioned: boolean;
      accent: string;
    }[] = [];
    for (const d of data.domains) {
      for (const t of d.tables) {
        if (t.keyIndexes.length === 0) continue;
        out.push({
          table: t.name,
          domain: d.name,
          indexes: t.keyIndexes,
          partitioned: t.partitioned,
          accent: d.accent,
        });
      }
    }
    return out.sort((a, b) => a.table.localeCompare(b.table));
  }, [data.domains]);

  return (
    <div className="space-y-4">
      <SubTabHeader
        icon={<HardDrive className="h-5 w-5" />}
        title="Index Strategy"
        description="High-priority indexes and the partitioning plan that keeps queries fast at scale."
        stats={[
          { label: "Indexed tables", value: indexRows.length },
          { label: "Partitioned", value: data.stats.partitionedTables },
        ]}
      />

      {/* Why partition */}
      <Card className="border-cyan-500/30 bg-cyan-500/5 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
            <HardDrive className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-semibold tracking-wider text-cyan-700 uppercase dark:text-cyan-400">
              Why Partitioning Matters
            </p>
            <p className="mt-1 text-sm font-medium">
              Hot tables (journal entries, audit logs, events) grow by tens of millions of rows per
              month.
            </p>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              Partitioning by month or day lets Postgres prune whole partitions at query time, keeps
              indexes small enough to fit in RAM, and lets us drop old partitions as a single O(1)
              operation instead of an expensive DELETE. The result: predictable query latency at any
              scale.
            </p>
          </div>
        </div>
      </Card>

      {/* High-priority indexes */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Key className="text-primary h-5 w-5" />
          <h3 className="text-sm font-semibold">High-Priority Indexes</h3>
          <Badge variant="secondary" className="ml-auto">
            {indexRows.length} tables
          </Badge>
        </div>
        <div className="max-h-[28rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 sticky top-0">
              <tr className="text-left text-xs">
                <th className="px-3 py-2 font-medium">Table</th>
                <th className="px-3 py-2 font-medium">Domain</th>
                <th className="px-3 py-2 font-medium">Indexes</th>
                <th className="px-3 py-2 font-medium">Partitioned</th>
              </tr>
            </thead>
            <tbody>
              {indexRows.map((r) => {
                const a = accentFor(r.accent);
                return (
                  <tr key={`${r.domain}-${r.table}`} className="hover:bg-muted/30 border-t">
                    <td className="px-3 py-2 align-top">
                      <code className="text-foreground font-mono text-xs font-medium">
                        {r.table}
                      </code>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Badge variant="outline" className={`text-[10px] ${a.badge}`}>
                        {r.domain}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        {r.indexes.map((idx) => (
                          <code
                            key={idx}
                            className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px]"
                          >
                            {idx}
                          </code>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <BooleanPill value={r.partitioned} yesLabel="Yes" noLabel="No" tone="cyan" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Partitioning strategy */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Layers className="text-primary h-5 w-5" />
          <h3 className="text-sm font-semibold">Partitioning Strategy</h3>
          <Badge variant="secondary" className="ml-auto">
            {data.partitionStrategies.length} hot tables
          </Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs">
                <th className="px-3 py-2 font-medium">Table</th>
                <th className="px-3 py-2 font-medium">Partition By</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium">Est. Rows / Month</th>
              </tr>
            </thead>
            <tbody>
              {data.partitionStrategies.map((p) => {
                const tone =
                  p.partitionBy === "daily"
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                    : p.partitionBy === "monthly"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300";
                return (
                  <tr key={p.table} className="hover:bg-muted/30 border-t">
                    <td className="px-3 py-2 align-top">
                      <code className="text-foreground font-mono text-xs font-medium">
                        {p.table}
                      </code>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Badge variant="outline" className={`text-[10px] ${tone}`}>
                        {p.partitionBy}
                      </Badge>
                    </td>
                    <td className="text-muted-foreground px-3 py-2 align-top text-xs">
                      {p.reason}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className="font-mono text-xs font-semibold tabular-nums">
                        {p.estimatedRowsPerMonth}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ============================================================================
// 6. Backup & DR sub-tab
// ============================================================================

function BackupDRTab({ data }: { data: DatabaseData }) {
  const { drTargets, backupStrategies } = data;
  return (
    <div className="space-y-4">
      <SubTabHeader
        icon={<Shield className="h-5 w-5" />}
        title="Backup & Disaster Recovery"
        description="Recovery objectives and the layered backup strategy that protects every byte."
        stats={[
          { label: "Backup layers", value: backupStrategies.length },
          { label: "RPO", value: drTargets.rpo },
          { label: "RTO", value: drTargets.rto },
        ]}
      />

      {/* RPO / RTO hero */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-emerald-500/30 bg-emerald-500/5 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-wider text-emerald-700 uppercase dark:text-emerald-400">
                Recovery Point Objective
              </p>
              <p className="text-3xl font-bold tabular-nums">{drTargets.rpo}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">Max data loss in a disaster</p>
            </div>
          </div>
        </Card>
        <Card className="border-cyan-500/30 bg-cyan-500/5 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
              <Zap className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-wider text-cyan-700 uppercase dark:text-cyan-400">
                Recovery Time Objective
              </p>
              <p className="text-3xl font-bold tabular-nums">{drTargets.rto}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">Max downtime in a disaster</p>
            </div>
          </div>
        </Card>
      </div>

      {/* DR strategy explanation */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
            <Shield className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold">DR Strategy</h3>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              {drTargets.description}
            </p>
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
              Continuous WAL archiving ships every transaction to object storage in real time, so we
              can perform point-in-time recovery to within 5 minutes of any failure. Daily, weekly,
              and monthly snapshots layer on top for fast restore windows and long-term regulatory
              retention.
            </p>
          </div>
        </div>
      </Card>

      {/* Backup layers table */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Archive className="text-primary h-5 w-5" />
          <h3 className="text-sm font-semibold">Backup Layers</h3>
          <Badge variant="secondary" className="ml-auto">
            {backupStrategies.length} layers
          </Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs">
                <th className="px-3 py-2 font-medium">Layer</th>
                <th className="px-3 py-2 font-medium">Frequency</th>
                <th className="px-3 py-2 font-medium">Retention</th>
                <th className="px-3 py-2 font-medium">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {backupStrategies.map((b, i) => {
                const tones = [
                  "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
                  "border-cyan-500/40 text-cyan-600 dark:text-cyan-400",
                  "border-amber-500/40 text-amber-600 dark:text-amber-400",
                  "border-violet-500/40 text-violet-600 dark:text-violet-400",
                ];
                return (
                  <tr key={b.layer} className="hover:bg-muted/30 border-t">
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-[10px] tabular-nums">
                          L{i + 1}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${tones[i % tones.length]}`}
                        >
                          {b.layer}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Clock className="text-muted-foreground h-3 w-3" />
                        {b.frequency}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className="font-mono text-xs font-medium">{b.retention}</span>
                    </td>
                    <td className="text-muted-foreground px-3 py-2 align-top text-xs">
                      {b.purpose}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ============================================================================
// 7. Domain Detail (overlay reached from Domain Map)
// ============================================================================

function DomainDetailView({ domain, onBack }: { domain: DomainInfo; onBack: () => void }) {
  const a = accentFor(domain.accent);
  const existing = domain.tables.filter((t) => t.exists).length;
  const planned = domain.tables.length - existing;
  const partitioned = domain.tables.filter((t) => t.partitioned).length;
  const softDelete = domain.tables.filter((t) => t.softDelete).length;

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Domain Map
      </button>

      {/* Domain header */}
      <Card className={`p-6 ${a.border}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-xl ${a.bg} ${a.text}`}
            >
              <IconFor name={domain.icon} className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight">{domain.name}</h2>
                <Badge variant="outline" className={`text-[10px] ${a.badge}`}>
                  Domain · order {domain.order}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1 text-sm">{domain.description}</p>
              <p className={`mt-2 text-xs italic ${a.text}`}>“{domain.principle}”</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
            >
              {existing} existing
            </Badge>
            {planned > 0 && (
              <Badge
                variant="outline"
                className="border-amber-500/40 text-amber-600 dark:text-amber-400"
              >
                {planned} planned
              </Badge>
            )}
            <Badge
              variant="outline"
              className="border-cyan-500/40 text-cyan-600 dark:text-cyan-400"
            >
              {partitioned} partitioned
            </Badge>
            <Badge
              variant="outline"
              className="border-violet-500/40 text-violet-600 dark:text-violet-400"
            >
              {softDelete} soft-delete
            </Badge>
          </div>
        </div>
      </Card>

      {/* Tables list */}
      <div className="grid gap-3">
        {domain.tables.map((t) => (
          <Card key={t.model} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="text-foreground font-mono text-sm font-semibold">{t.name}</code>
                  <span className="text-muted-foreground text-[10px]">{t.model}</span>
                  {t.exists ? (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                    >
                      Exists
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 text-amber-600 dark:text-amber-400"
                    >
                      Planned
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground mt-1 text-xs">{t.purpose}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground text-[10px]">Key indexes:</span>
                  {t.keyIndexes.map((idx) => (
                    <code
                      key={idx}
                      className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px]"
                    >
                      {idx}
                    </code>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] dark:bg-slate-800">
                  {t.idPrefix}_
                </code>
                <div className="flex gap-1">
                  {t.partitioned && (
                    <Badge
                      variant="outline"
                      className="border-cyan-500/40 text-[10px] text-cyan-600 dark:text-cyan-400"
                    >
                      Partitioned
                    </Badge>
                  )}
                  {t.softDelete && (
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400"
                    >
                      Soft-delete
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Shared sub-tab header
// ============================================================================

function SubTabHeader({
  icon,
  title,
  description,
  stats,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  stats: { label: string; value: number | string }[];
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            {icon}
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
            <p className="text-muted-foreground text-xs">{description}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {stats.map((s) => (
            <div key={s.label} className="text-right">
              <p className="text-muted-foreground text-[10px] tracking-wider uppercase">
                {s.label}
              </p>
              <p className="text-lg font-bold tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
