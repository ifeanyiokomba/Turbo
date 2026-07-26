"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Wallet,
  Send,
  Smartphone,
  Receipt,
  CreditCard,
  PiggyBank,
  TrendingUp,
  BadgeCheck,
  Lock,
  Coins,
  ShoppingBag,
  Bird,
  Gift,
  ShieldCheck,
  Award,
  Lock as LockIcon,
  Sparkles,
  RefreshCw,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "../parts/layout";
import { AnimatedNumber } from "../parts/animated-number";
import { BADGE_COLOR_CLASSES } from "@/lib/badges";
import { formatDate } from "@/lib/money";

// ---------- Types ----------------------------------------------------------

interface BadgePayload {
  key: string;
  name: string;
  description: string;
  icon: string;
  color: "emerald" | "amber" | "violet" | "sky" | "rose";
  earned: boolean;
  earnedAt: string | null;
}

interface StatsPayload {
  earned: number;
  total: number;
  completionPct: number;
}

interface BadgesResponse {
  badges: BadgePayload[];
  stats: StatsPayload;
  newlyEarned: string[];
}

// ---------- Icon resolver --------------------------------------------------

const ICONS: Record<string, LucideIcon> = {
  Wallet,
  Send,
  Smartphone,
  Receipt,
  CreditCard,
  PiggyBank,
  TrendingUp,
  BadgeCheck,
  Lock,
  Coins,
  ShoppingBag,
  Bird,
  Gift,
  ShieldCheck,
};

function resolveIcon(name: string): LucideIcon {
  return ICONS[name] ?? Award;
}

// ---------- Component ------------------------------------------------------

export default function AchievementsView() {
  const [data, setData] = React.useState<BadgesResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true);
      const res = await fetch("/api/badges", { cache: "no-store" });
      if (res.ok) {
        const json: BadgesResponse = await res.json();
        setData(json);
        // Surface a toast for each newly earned badge (max 3 to avoid spam).
        if (json.newlyEarned && json.newlyEarned.length > 0) {
          const slice = json.newlyEarned.slice(0, 3);
          for (const key of slice) {
            const meta = json.badges.find((b) => b.key === key);
            if (meta) {
              toast.success(`Badge unlocked: ${meta.name}`, {
                description: meta.description,
                icon: <Trophy className="h-4 w-4 text-amber-500" />,
              });
            }
          }
          if (json.newlyEarned.length > 3) {
            toast.info(`+${json.newlyEarned.length - 3} more badges unlocked!`);
          }
        }
      }
    } catch {
      if (!silent) toast.error("Couldn't load your achievements");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <AchievementsSkeleton />;
  }

  if (!data) {
    return (
      <>
        <PageHeader
          title="Achievements"
          subtitle="Unlock badges as you use Turbopay"
        />
        <EmptyAchievements onRetry={() => load()} />
      </>
    );
  }

  const { badges, stats } = data;
  const earnedBadges = badges.filter((b) => b.earned);
  const recentEarned = earnedBadges
    .slice()
    .sort((a, b) => (b.earnedAt ?? "").localeCompare(a.earnedAt ?? ""))
    .slice(0, 3);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Achievements"
        subtitle="Unlock badges as you use Turbopay"
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => load(true)}
            disabled={refreshing}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {/* Hero — completion ring + count */}
      <HeroCard stats={stats} earnedBadges={earnedBadges.length} />

      {/* Recently earned */}
      {recentEarned.length > 0 && (
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-semibold">Recently earned</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {recentEarned.map((b) => (
              <RecentBadgeCard key={b.key} badge={b} />
            ))}
          </div>
        </Card>
      )}

      {/* Badge grid */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">All badges</p>
          </div>
          <UiBadge variant="secondary" className="tabular-nums">
            {stats.earned} / {stats.total}
          </UiBadge>
        </div>
        <TooltipProvider delayDuration={150}>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {badges.map((b) => (
              <BadgeTile key={b.key} badge={b} />
            ))}
          </div>
        </TooltipProvider>
      </Card>
    </div>
  );
}

// ---------- Hero card ------------------------------------------------------

function HeroCard({
  stats,
  earnedBadges,
}: {
  stats: StatsPayload;
  earnedBadges: number;
}) {
  const radius = 56;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (stats.completionPct / 100) * circ;
  return (
    <Card className="relative overflow-hidden p-6">
      {/* Decorative gradient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-amber-500/10"
      />
      <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
        {/* Progress ring */}
        <div className="relative h-36 w-36 shrink-0">
          <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke="var(--muted)"
              strokeWidth="10"
            />
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke="oklch(0.72 0.14 162)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 1s ease-out" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <AnimatedNumber
              value={stats.completionPct}
              duration={1100}
              format={(n) => `${Math.round(n)}%`}
              className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400"
            />
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              complete
            </p>
          </div>
        </div>
        {/* Copy + count */}
        <div className="flex-1 text-center sm:text-left">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
            <Trophy className="h-3 w-3" /> Your Achievements
          </div>
          <h2 className="mt-2 text-2xl font-bold tracking-tight">
            {earnedBadges === 0
              ? "Let's earn your first badge"
              : `${earnedBadges} badge${earnedBadges === 1 ? "" : "s"} unlocked`}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep using Turbopay — every transfer, bill payment, and savings
            deposit brings you closer to the next one.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <UiBadge variant="secondary" className="gap-1">
              <Award className="h-3 w-3 text-primary" />
              {stats.earned} earned
            </UiBadge>
            <UiBadge variant="outline" className="gap-1">
              <LockIcon className="h-3 w-3" />
              {stats.total - stats.earned} locked
            </UiBadge>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------- Recently earned card ------------------------------------------

function RecentBadgeCard({ badge }: { badge: BadgePayload }) {
  const Icon = ICONS[badge.icon as keyof typeof ICONS] ?? Award;
  const colors = BADGE_COLOR_CLASSES[badge.color];
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 ring-1 ${colors.grad} ${colors.ring} ${colors.glow}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/70 dark:bg-white/10">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{badge.name}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {badge.description}
          </p>
          {badge.earnedAt && (
            <p className={`mt-1.5 text-[10px] font-medium ${colors.text}`}>
              Earned on {formatDate(badge.earnedAt)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Badge tile -----------------------------------------------------

function BadgeTile({ badge }: { badge: BadgePayload }) {
  const Icon = ICONS[badge.icon as keyof typeof ICONS] ?? Award;
  const colors = BADGE_COLOR_CLASSES[badge.color];

  if (badge.earned) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`group relative flex flex-col items-center gap-2 overflow-hidden rounded-2xl border bg-gradient-to-br p-4 text-center ring-1 transition-all hover:-translate-y-0.5 ${colors.grad} ${colors.ring} ${colors.glow} focus:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
          >
            {/* Shine sweep on hover */}
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-y-2 -left-1/2 w-1/2 skew-x-12 bg-white/30 opacity-0 transition-all duration-500 group-hover:left-full group-hover:opacity-60"
            />
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/70 dark:bg-white/10">
              <Icon className="h-7 w-7" />
            </div>
            <div className="w-full">
              <p className="truncate text-sm font-semibold">{badge.name}</p>
              <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">
                {badge.description}
              </p>
              {badge.earnedAt && (
                <p className={`mt-1.5 text-[10px] font-medium ${colors.text}`}>
                  Earned {formatDate(badge.earnedAt)}
                </p>
              )}
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-center">
          <p className="font-semibold">{badge.name}</p>
          <p className="text-xs text-muted-foreground">{badge.description}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="group relative flex cursor-default flex-col items-center gap-2 overflow-hidden rounded-2xl border border-dashed bg-muted/40 p-4 text-center opacity-70 grayscale transition-all hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Icon className="h-7 w-7" />
          </div>
          {/* Lock badge */}
          <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-background/80 text-muted-foreground shadow-sm">
            <LockIcon className="h-3 w-3" />
          </span>
          <div className="w-full">
            <p className="truncate text-sm font-medium text-muted-foreground">
              {badge.name}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground/80">
              {badge.description}
            </p>
            <p className="mt-1.5 text-[10px] font-medium text-muted-foreground">
              Locked
            </p>
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] text-center">
        <p className="font-semibold">{badge.name}</p>
        <p className="text-xs text-muted-foreground">{badge.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ---------- Skeleton + empty states ---------------------------------------

function AchievementsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <div className="h-7 w-44 animate-pulse rounded-lg bg-muted" />
          <div className="h-4 w-56 animate-pulse rounded-full bg-muted/70" />
        </div>
        <div className="h-9 w-24 animate-pulse rounded-lg bg-muted" />
      </div>
      {/* Hero skeleton */}
      <Card className="p-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
          <div className="h-36 w-36 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-3">
            <div className="h-6 w-40 animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-full animate-pulse rounded-full bg-muted/70" />
            <div className="h-4 w-3/4 animate-pulse rounded-full bg-muted/70" />
            <div className="flex gap-2">
              <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
              <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
            </div>
          </div>
        </div>
      </Card>
      {/* Grid skeleton */}
      <Card className="p-5">
        <div className="mb-4 h-4 w-32 animate-pulse rounded-full bg-muted" />
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {[...Array(14)].map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-muted/60" />
          ))}
        </div>
      </Card>
    </div>
  );
}

function EmptyAchievements({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="p-10">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Award className="h-7 w-7" />
        </div>
        <p className="mt-4 font-semibold">We couldn't load your badges</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Something went wrong while fetching your achievements. Please try
          again.
        </p>
        <Button size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </Card>
  );
}
