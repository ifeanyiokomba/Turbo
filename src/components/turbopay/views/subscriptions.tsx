"use client";

import * as React from "react";
import { useApp } from "../store";
import { PageHeader, StatCard, EmptyState } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Repeat,
  CalendarClock,
  Wallet,
  TrendingDown,
  RefreshCw,
  Ban,
  ChevronDown,
  BadgeCheck,
  Sparkles,
  Clock,
} from "lucide-react";
import { naira, nairaCompact, formatDate, timeAgo } from "@/lib/money";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface SubMerchant {
  id: string;
  name: string;
  category: string | null;
  logoUrl: string | null;
  rating: number;
  verified: boolean;
}

interface SubPlan {
  id: string;
  name: string;
  amountMinor: number;
  currency: string;
  interval: "DAY" | "WEEK" | "MONTH" | "YEAR";
  intervalCount: number;
  trialDays: number;
}

interface Subscription {
  id: string;
  status: "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIALING";
  nextChargeAt: string;
  currentPeriodEnd: string;
  createdAt: string;
  updatedAt: string;
  plan: SubPlan | null;
  merchant: SubMerchant | null;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join("");
}

function merchantHue(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const palettes = [
    "from-emerald-500 to-teal-600",
    "from-amber-500 to-orange-600",
    "from-emerald-600 to-emerald-800",
    "from-amber-400 to-amber-600",
    "from-teal-500 to-emerald-600",
    "from-orange-500 to-amber-600",
  ];
  return palettes[hash % palettes.length];
}

function intervalLabel(plan: SubPlan): string {
  const unit = plan.interval.toLowerCase();
  if (plan.intervalCount === 1) {
    return unit === "day"
      ? "Daily"
      : unit === "week"
        ? "Weekly"
        : unit === "month"
          ? "Monthly"
          : "Yearly";
  }
  return `Every ${plan.intervalCount} ${unit}s`;
}

function statusBadge(status: Subscription["status"]) {
  switch (status) {
    case "ACTIVE":
      return (
        <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400">
          Active
        </Badge>
      );
    case "TRIALING":
      return (
        <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400">
          <Sparkles className="mr-1 h-3 w-3" /> Trialing
        </Badge>
      );
    case "PAST_DUE":
      return (
        <Badge className="bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400">
          Past due
        </Badge>
      );
    case "CANCELED":
      return <Badge variant="outline">Cancelled</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function nextChargeLabel(nextChargeAt: string): {
  label: string;
  tone: "default" | "warning" | "danger";
} {
  const d = new Date(nextChargeAt);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffMs < 0) return { label: `Overdue ${timeAgo(d)}`, tone: "danger" };
  if (diffH < 24) return { label: `In ${diffH}h`, tone: "warning" };
  if (diffH < 48) return { label: "Tomorrow", tone: "default" };
  return { label: formatDate(d, true), tone: "default" };
}

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

export default function SubscriptionsView() {
  const { setView } = useApp();

  const [list, setList] = React.useState<Subscription[]>([]);
  const [totalActive, setTotalActive] = React.useState(0);
  const [totalMonthly, setTotalMonthly] = React.useState(0);
  const [monthlyDisplay, setMonthlyDisplay] = React.useState("₦0");
  const [nextChargeAt, setNextChargeAt] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [cancelTarget, setCancelTarget] = React.useState<Subscription | null>(null);
  const [canceling, setCanceling] = React.useState(false);

  const [historyOpen, setHistoryOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/subscriptions", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setList(json.subscriptions ?? []);
        setTotalActive(json.totalActive ?? 0);
        setTotalMonthly(json.totalMonthly ?? 0);
        setMonthlyDisplay(json.monthlyDisplay ?? nairaCompact(json.totalMonthly ?? 0));
        setNextChargeAt(json.nextChargeAt ?? null);
      } else {
        toast.error("Could not load subscriptions");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function confirmCancel() {
    if (!cancelTarget) return;
    setCanceling(true);
    try {
      const res = await fetch(`/api/subscriptions/${cancelTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELED" }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? "Could not cancel subscription");
        return;
      }
      toast.success(`Cancelled ${cancelTarget.plan?.name ?? "subscription"}`, {
        description: "You won't be charged again.",
      });
      setCancelTarget(null);
      load();
    } finally {
      setCanceling(false);
    }
  }

  const active = list.filter((s) => s.status === "ACTIVE" || s.status === "TRIALING");
  const inactive = list.filter((s) => s.status === "CANCELED" || s.status === "PAST_DUE");
  const earliestNext = nextChargeAt
    ? nextChargeLabel(nextChargeAt)
    : active.length
      ? nextChargeLabel(
          active
            .map((s) => new Date(s.nextChargeAt).getTime())
            .sort((a, b) => a - b)[0]
            .toString()
        )
      : null;

  return (
    <div className="tp-fade-rise space-y-6">
      <PageHeader
        title="Subscriptions"
        subtitle="Manage recurring payments, see your monthly spend and cancel anytime."
        actions={
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {loading ? (
          <>
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
          </>
        ) : (
          <>
            <StatCard
              label="Active subscriptions"
              value={String(totalActive)}
              icon={Repeat}
              tone="success"
              hint={totalActive === 1 ? "1 recurring plan" : `${totalActive} recurring plans`}
            />
            <StatCard
              label="Monthly spend"
              value={monthlyDisplay}
              icon={TrendingDown}
              tone="warning"
              hint="Across all active subscriptions"
            />
            <StatCard
              label="Next charge"
              value={earliestNext?.label ?? "—"}
              icon={CalendarClock}
              tone={
                earliestNext?.tone === "danger"
                  ? "danger"
                  : earliestNext?.tone === "warning"
                    ? "warning"
                    : "default"
              }
              hint={earliestNext ? "Earliest upcoming debit" : "No upcoming charges"}
            />
          </>
        )}
      </div>

      {/* Active subscriptions list */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold">Active subscriptions</p>
          <Badge variant="secondary">{active.length} active</Badge>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : active.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title="No active subscriptions"
            description="Subscribe to a merchant plan from the marketplace and it'll show up here."
            illustration="no-data"
            action={
              <Button size="sm" onClick={() => setView("marketplace")} className="gap-1.5">
                <Sparkles className="h-4 w-4" /> Browse marketplace
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {active.map((s) => (
              <SubscriptionRow key={s.id} s={s} onCancel={() => setCancelTarget(s)} />
            ))}
          </div>
        )}
      </Card>

      {/* Cancelled / past-due section (collapsed) */}
      {inactive.length > 0 && (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <Card className="p-3">
            <CollapsibleTrigger asChild>
              <button
                className="hover:bg-muted/50 flex w-full items-center justify-between rounded-xl px-2 py-2 text-sm font-medium transition-colors"
                type="button"
              >
                <span className="flex items-center gap-2">
                  <Clock className="text-muted-foreground h-4 w-4" />
                  Cancelled &amp; past-due ({inactive.length})
                </span>
                <ChevronDown
                  className={`text-muted-foreground h-4 w-4 transition-transform ${
                    historyOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-3 border-t pt-3">
                {inactive.map((s) => (
                  <SubscriptionRow key={s.id} s={s} onCancel={() => setCancelTarget(s)} readonly />
                ))}
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Cancel confirmation */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget?.plan?.name ? (
                <>
                  You&apos;re about to cancel <strong>{cancelTarget.plan.name}</strong>
                  {cancelTarget.merchant?.name ? ` from ${cancelTarget.merchant.name}` : ""}. You
                  won&apos;t be charged again, and you&apos;ll keep access until the end of the
                  current billing period.
                </>
              ) : (
                <>You won&apos;t be charged again after cancellation.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={canceling}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmCancel();
              }}
              disabled={canceling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
            >
              {canceling ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Ban className="h-4 w-4" />
              )}
              Cancel subscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Row                                                                 */
/* ------------------------------------------------------------------ */

function SubscriptionRow({
  s,
  onCancel,
  readonly = false,
}: {
  s: Subscription;
  onCancel: () => void;
  readonly?: boolean;
}) {
  const plan = s.plan;
  const merchant = s.merchant;
  const next = plan ? nextChargeLabel(s.nextChargeAt) : null;
  const amountDisplay = plan ? naira(plan.amountMinor) : "—";

  return (
    <div className="rounded-2xl border p-4 transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${merchantHue(
              merchant?.name ?? "M"
            )} text-sm font-bold text-white shadow`}
          >
            {initials(merchant?.name ?? "M")}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{plan?.name ?? "Subscription"}</p>
              {statusBadge(s.status)}
              {merchant?.verified && (
                <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" aria-label="Verified" />
              )}
            </div>
            <p className="text-muted-foreground mt-0.5 truncate text-xs">
              {merchant?.name ?? "Unknown merchant"}
              {merchant?.category
                ? ` · ${merchant.category.charAt(0) + merchant.category.slice(1).toLowerCase()}`
                : ""}
            </p>
            <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-3 text-xs">
              <span className="text-foreground inline-flex items-center gap-1 font-semibold">
                <Wallet className="h-3 w-3" /> {amountDisplay}
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Repeat className="h-3 w-3" />
                {plan ? intervalLabel(plan) : "—"}
              </span>
              {plan?.trialDays ? (
                <>
                  <span>·</span>
                  <span className="text-amber-600 dark:text-amber-400">
                    {plan.trialDays}d trial
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {next && s.status !== "CANCELED" && (
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium ${
                next.tone === "danger"
                  ? "text-red-600 dark:text-red-400"
                  : next.tone === "warning"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground"
              }`}
            >
              <CalendarClock className="h-3 w-3" />
              {next.label}
            </span>
          )}
          {!readonly && (s.status === "ACTIVE" || s.status === "TRIALING") && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancel}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
            >
              <Ban className="h-3.5 w-3.5" /> Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
