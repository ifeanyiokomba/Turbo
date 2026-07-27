"use client";

// TurboCore — Architecture Compliance Tab
//
// Shows how the platform maps to the Global Payment Orchestration Platform spec.
// Each of the 19 requirements is checked: IMPLEMENTED, PARTIAL, or MISSING.

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  CheckCircle2,
  AlertCircle,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Shield,
  Server,
  Database,
  Network,
  Globe,
  Zap,
  Cpu,
  GitBranch,
  BookOpen,
  CreditCard,
  Wallet,
  Scale,
  Bell,
  BarChart3,
  Settings,
  Rocket,
  Plug,
  Lock,
  Activity,
  ArrowLeftRight,
} from "lucide-react";

interface Requirement {
  id: string;
  name: string;
  spec: string;
  status: "IMPLEMENTED" | "PARTIAL" | "MISSING";
  details: Record<string, unknown>;
}

interface ArchitectureData {
  platform: string;
  version: string;
  specCompliance: {
    total: number;
    implemented: number;
    partial: number;
    missing: number;
    percentage: number;
  };
  requirements: Requirement[];
  generatedAt: string;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  "provider-engine": Server,
  "sync-engine": RefreshCw,
  "capability-registry": Network,
  "country-registry": Globe,
  "geo-routing": Globe,
  "dynamic-service-registry": Zap,
  "health-engine": Activity,
  "intelligent-selection": Cpu,
  "failover-engine": GitBranch,
  "provider-communication": ArrowLeftRight,
  "universal-transaction": CreditCard,
  "universal-ledger": BookOpen,
  "credential-vault": Lock,
  "plug-and-play": Plug,
  "auto-discovery": Rocket,
  "event-driven": Zap,
  "admin-dashboard": BarChart3,
  scalability: Settings,
  security: Shield,
};

const STATUS_CONFIG = {
  IMPLEMENTED: {
    icon: CheckCircle2,
    color: "text-emerald-600",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/40",
    badge: "bg-emerald-100 text-emerald-700",
  },
  PARTIAL: {
    icon: AlertCircle,
    color: "text-amber-600",
    bg: "bg-amber-500/10",
    border: "border-amber-500/40",
    badge: "bg-amber-100 text-amber-700",
  },
  MISSING: {
    icon: XCircle,
    color: "text-rose-600",
    bg: "bg-rose-500/10",
    border: "border-rose-500/40",
    badge: "bg-rose-100 text-rose-700",
  },
};

export default function ArchitectureTab() {
  const [data, setData] = React.useState<ArchitectureData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/architecture", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load architecture data");
        return;
      }
      const d = await res.json();
      setData(d);
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-20 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const { specCompliance: sc } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
            <Network className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Architecture Compliance</h2>
            <p className="text-muted-foreground text-sm">
              {data.platform} — how the platform maps to the spec
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Compliance score */}
      <Card className="p-6">
        <div className="flex items-center gap-6">
          <div className="relative flex h-24 w-24 items-center justify-center">
            <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-muted"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 42 * (sc.percentage / 100)} ${2 * Math.PI * 42}`}
                className="text-emerald-500 transition-all duration-1000"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute text-2xl font-bold">{sc.percentage}%</div>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold">Spec Compliance</h3>
            <p className="text-muted-foreground mb-3 text-sm">
              {sc.implemented} of {sc.total} requirements fully implemented
            </p>
            <div className="flex gap-3">
              <Badge className="bg-emerald-100 text-emerald-700">
                {sc.implemented} IMPLEMENTED
              </Badge>
              {sc.partial > 0 && (
                <Badge className="bg-amber-100 text-amber-700">{sc.partial} PARTIAL</Badge>
              )}
              {sc.missing > 0 && (
                <Badge className="bg-rose-100 text-rose-700">{sc.missing} MISSING</Badge>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Architecture flow diagram */}
      <Card className="p-6">
        <h3 className="mb-3 text-lg font-semibold">Platform Architecture Flow</h3>
        <div className="bg-muted/50 overflow-x-auto rounded-lg p-4 font-mono text-xs leading-relaxed">
          <pre className="whitespace-pre">{`Customer → Geo Routing → Country Profile → Capability Registry → Provider Selection
                                                                         ↓
                              Adapter Interface ← Provider Engine ← Health Engine ← Intelligent Scoring
                                      ↓
                              Provider API (Paystack / Flutterwave / M-Pesa / ...)
                                      ↓
         Analytics ← Notification ← Webhook ← Ledger ← Confirmation ← Provider Response
              ↓                                    ↑
         Event Store ← Outbox ← Audit ← Risk ← Compliance ← Validate`}</pre>
        </div>
      </Card>

      {/* Requirements list */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Requirements ({data.requirements.length})</h3>
        {data.requirements.map((req) => {
          const config = STATUS_CONFIG[req.status];
          const Icon = ICON_MAP[req.id] ?? Server;
          const StatusIcon = config.icon;
          const isExpanded = expanded.has(req.id);

          return (
            <Card key={req.id} className={`border-l-4 ${config.border}`}>
              <div
                className="flex cursor-pointer items-start gap-3 p-4"
                onClick={() => toggleExpand(req.id)}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${config.bg}`}
                >
                  <Icon className={`h-4 w-4 ${config.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-semibold">{req.name}</h4>
                    <Badge className={`text-xs ${config.badge}`}>{req.status}</Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{req.spec}</p>
                </div>
                {isExpanded ? (
                  <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                )}
              </div>
              {isExpanded && (
                <>
                  <Separator />
                  <div className="bg-muted/30 p-4">
                    <div className="space-y-2 text-sm">
                      {Object.entries(req.details).map(([key, value]) => (
                        <div key={key} className="flex gap-3">
                          <span className="text-muted-foreground min-w-[140px] shrink-0">
                            {key}:
                          </span>
                          <div className="flex-1">
                            {Array.isArray(value) ? (
                              <div className="flex flex-wrap gap-1">
                                {value.map((v, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {String(v)}
                                  </Badge>
                                ))}
                              </div>
                            ) : typeof value === "object" && value !== null ? (
                              <pre className="bg-muted overflow-x-auto rounded p-2 text-xs">
                                {JSON.stringify(value, null, 2)}
                              </pre>
                            ) : (
                              <span className="font-mono text-xs">{String(value)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
