"use client";

import * as React from "react";
import { QRCodeSVG } from "qrcode.react";
import { useApp } from "../store";
import { PageHeader, EmptyState } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Gift,
  Users,
  TrendingUp,
  Sparkles,
  Copy,
  Check,
  Share2,
  Twitter,
  MessageCircle,
  Trophy,
  ArrowDownLeft,
  RefreshCw,
  Link2,
  UserPlus,
  ShieldCheck,
  Wallet,
  ChevronRight,
} from "lucide-react";
import { naira, nairaCompact, formatDate, timeAgo } from "@/lib/money";
import { toast } from "sonner";

interface RewardTx {
  id: string;
  type: string;
  direction: string;
  amountKobo: number;
  status: string;
  reference: string;
  description: string | null;
  counterpartyName: string | null;
  createdAt: string;
}

interface ReferredUser {
  id: string;
  username: string;
  fullName: string;
  status: "VERIFIED" | "PENDING";
  dateJoined: string;
  rewardEarned: number;
  reference: string;
}

interface RewardsData {
  referralCode: string;
  shareLink: string;
  bonusAmountKobo: number;
  stats: {
    totalReferrals: number;
    thisMonthReferrals: number;
    pendingReferrals: number;
    totalEarned: number;
    availableToWithdraw: number;
    activeCampaigns: number;
  };
  referredUsers: ReferredUser[];
  recentRewards: RewardTx[];
  campaigns: Array<{
    id: string;
    title: string;
    description: string;
    rewardKobo: number;
    endsIn: string;
  }>;
}

const STATUS_TONE: Record<string, string> = {
  VERIFIED: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  PENDING: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  SUCCESS: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  PENDING_TX: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  FAILED: "bg-red-500/15 text-red-600 dark:text-red-400",
  REVERSED: "bg-muted text-muted-foreground",
};

export default function RewardsView() {
  const { user } = useApp();
  const [data, setData] = React.useState<RewardsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [copiedCode, setCopiedCode] = React.useState(false);
  const [copiedLink, setCopiedLink] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rewards", { cache: "no-store" });
      if (res.status === 401) {
        toast.error("Session expired. Please log in again.");
        return;
      }
      if (!res.ok) {
        toast.error("Failed to load rewards.");
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

  function copyCode() {
    if (!data?.referralCode) return;
    navigator.clipboard.writeText(data.referralCode);
    setCopiedCode(true);
    toast.success("Referral code copied");
    setTimeout(() => setCopiedCode(false), 1500);
  }

  function copyLink() {
    if (!data?.shareLink) return;
    navigator.clipboard.writeText(data.shareLink);
    setCopiedLink(true);
    toast.success("Share link copied");
    setTimeout(() => setCopiedLink(false), 1500);
  }

  function shareWhatsApp() {
    if (!data) return;
    const text = `Join me on Turbopay and we both earn ${naira(data.bonusAmountKobo)}! Use my code ${data.referralCode}. ${data.shareLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  function shareTwitter() {
    if (!data) return;
    const text = `Just invited friends to @turbopay — use my code ${data.referralCode} and we both get ${nairaCompact(data.bonusAmountKobo)} 🚀 ${data.shareLink}`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  function shareNative() {
    if (!data) return;
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (nav.share) {
      nav.share({
        title: "Join me on Turbopay",
        text: `Use my referral code ${data.referralCode} and we both earn rewards!`,
        url: data.shareLink,
      }).catch(() => {
        copyLink();
      });
    } else {
      copyLink();
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Rewards" subtitle="Refer friends, earn bonuses, and track rewards" />
        <Skeleton className="h-72 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  const firstName = user?.fullName.split(" ")[0] ?? "there";
  const bonusNaira = data?.bonusAmountKobo ?? 50_000;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rewards"
        subtitle="Refer friends, earn bonuses, and track rewards"
        actions={
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      {/* ============ Referral hero card ============ */}
      <Card className="tp-emerald-grad relative overflow-hidden p-5 sm:p-7 text-white tp-sheen">
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Badge className="bg-white/20 text-white">
              <Sparkles className="mr-1 h-3 w-3" /> Refer &amp; earn
            </Badge>
            <h2 className="mt-3 text-2xl font-bold sm:text-3xl">
              Give {naira(bonusNaira)}, get {naira(bonusNaira)}
            </h2>
            <p className="mt-1 max-w-md text-sm text-white/85">
              Share your code with {firstName}. When your friend verifies their KYC, you both get {naira(bonusNaira)} in your Turbopay wallet.
            </p>
          </div>
          <Trophy className="hidden h-16 w-16 text-white/30 sm:block" />
        </div>

        <div className="relative z-10 mt-5 grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            {/* Referral code */}
            <div>
              <p className="mb-1.5 text-xs text-white/80">Your referral code</p>
              <div className="flex items-center gap-2 rounded-xl bg-white/15 px-4 py-3 backdrop-blur">
                <span className="font-mono text-xl font-bold tracking-[0.3em] sm:text-2xl">
                  {data?.referralCode ?? "—"}
                </span>
                <button
                  onClick={copyCode}
                  className="ml-auto rounded-md p-1.5 hover:bg-white/20"
                  aria-label="Copy code"
                >
                  {copiedCode ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Share link */}
            <div>
              <p className="mb-1.5 text-xs text-white/80">Share link</p>
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 truncate rounded-xl bg-white/15 px-4 py-3 text-sm backdrop-blur">
                  <Link2 className="h-4 w-4 shrink-0 text-white/70" />
                  <span className="truncate">{data?.shareLink ?? "—"}</span>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={copyLink}
                  className="gap-1.5 bg-white text-emerald-700 hover:bg-white/90"
                >
                  {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span className="hidden sm:inline">Copy</span>
                </Button>
              </div>
            </div>

            {/* Share buttons */}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="secondary" onClick={shareWhatsApp} className="gap-1.5 bg-white text-emerald-700 hover:bg-white/90">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </Button>
              <Button size="sm" variant="secondary" onClick={shareTwitter} className="gap-1.5 bg-white text-emerald-700 hover:bg-white/90">
                <Twitter className="h-4 w-4" /> Twitter
              </Button>
              <Button size="sm" variant="secondary" onClick={shareNative} className="gap-1.5 bg-white/10 text-white hover:bg-white/20">
                <Share2 className="h-4 w-4" /> More
              </Button>
            </div>
          </div>

          {/* QR code */}
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-white/15 p-4 backdrop-blur lg:w-44">
            <div className="rounded-xl bg-white p-3">
              {data?.shareLink && (
                <QRCodeSVG
                  value={data.shareLink}
                  size={120}
                  level="M"
                  fgColor="#047857"
                  bgColor="#ffffff"
                />
              )}
            </div>
            <p className="text-center text-xs text-white/80">Scan to sign up with your code</p>
          </div>
        </div>
      </Card>

      {/* ============ Stats row ============ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="This month's referrals"
          value={String(data?.stats.thisMonthReferrals ?? 0)}
          hint="Friends who joined this month"
          icon={UserPlus}
          tone="emerald"
        />
        <StatTile
          label="Pending referrals"
          value={String(data?.stats.pendingReferrals ?? 0)}
          hint="Registered, not yet verified"
          icon={ShieldCheck}
          tone="amber"
        />
        <StatTile
          label="Total earnings"
          value={naira(data?.stats.totalEarned ?? 0)}
          hint="All-time from referrals + rewards"
          icon={TrendingUp}
          tone="emerald"
        />
        <StatTile
          label="Available to withdraw"
          value={naira(data?.stats.availableToWithdraw ?? 0)}
          hint="Current wallet balance"
          icon={Wallet}
          tone="emerald"
        />
      </div>

      {/* ============ How it works ============ */}
      <Card className="p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">How it works</h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          <HowItWorksStep
            n={1}
            icon={Share2}
            title="Share your code"
            description="Send your referral link or code to friends via WhatsApp, X, or any channel."
          />
          <HowItWorksStep
            n={2}
            icon={UserPlus}
            title="Friend signs up & verifies"
            description="They create a Turbopay account and complete KYC verification."
          />
          <HowItWorksStep
            n={3}
            icon={Gift}
            title={`You both get ${naira(bonusNaira)}`}
            description={`Once verified, ${naira(bonusNaira)} is credited to both your wallets instantly.`}
          />
        </div>
      </Card>

      {/* ============ Referral history table ============ */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Referral history</h2>
            {data?.referredUsers && data.referredUsers.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {data.referredUsers.length}
              </Badge>
            )}
          </div>
        </div>
        {data?.referredUsers && data.referredUsers.length > 0 ? (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date joined</TableHead>
                    <TableHead className="text-right">Reward earned</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.referredUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold uppercase text-emerald-600 dark:text-emerald-400">
                            {(u.username || u.fullName || "?").slice(0, 2)}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{u.fullName}</p>
                            <p className="text-xs text-muted-foreground">@{u.username}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[u.status]}`}>
                          {u.status === "VERIFIED" ? "Verified" : "Pending"}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(u.dateJoined)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {u.status === "VERIFIED" ? naira(u.rewardEarned) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="divide-y sm:hidden">
              {data.referredUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold uppercase text-emerald-600 dark:text-emerald-400">
                    {(u.username || u.fullName || "?").slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{u.fullName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      @{u.username} · {formatDate(u.dateJoined)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[u.status]}`}>
                      {u.status === "VERIFIED" ? "Verified" : "Pending"}
                    </span>
                    {u.status === "VERIFIED" && (
                      <span className="text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {nairaCompact(u.rewardEarned)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="p-6">
            <EmptyState
              icon={Users}
              illustration="no-data"
              title="No referrals yet"
              description="Share your referral code to start earning bonuses for every friend who verifies their account."
              action={
                <Button size="sm" onClick={copyCode} className="gap-1.5">
                  <Copy className="h-4 w-4" /> Copy referral code
                </Button>
              }
            />
          </div>
        )}
      </Card>

      {/* ============ Recent referral rewards ============ */}
      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Recent referral rewards</h2>
          </div>
        </div>
        {data?.recentRewards && data.recentRewards.length > 0 ? (
          <ul className="max-h-96 overflow-y-auto pr-1 scrollbar-thin">
            {data.recentRewards.map((r) => {
              const isReferral = r.type === "REFERRAL";
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/60"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    {isReferral ? <Users className="h-5 w-5" /> : <Gift className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {isReferral ? "Referral bonus" : "Reward"} · {r.counterpartyName || r.description || "Turbopay"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.reference} · {timeAgo(r.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      <ArrowDownLeft className="mr-0.5 inline h-3 w-3" />
                      {naira(r.amountKobo)}
                    </p>
                    {r.status !== "SUCCESS" && (
                      <Badge variant="outline" className="mt-0.5 text-[10px]">{r.status}</Badge>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={Gift}
            title="No rewards yet"
            description="Share your referral code to start earning."
            action={
              <Button size="sm" onClick={copyCode} className="gap-1.5">
                <Copy className="h-4 w-4" /> Copy referral code
              </Button>
            }
          />
        )}
      </Card>

      {/* ============ Active campaigns (kept) ============ */}
      {data?.campaigns && data.campaigns.length > 0 && (
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Active campaigns</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.campaigns.map((c) => (
              <div key={c.id} className="group rounded-xl border p-4 transition-colors hover:border-primary/30">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{c.title}</p>
                  {c.rewardKobo > 0 ? (
                    <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      +{nairaCompact(c.rewardKobo)}
                    </Badge>
                  ) : (
                    <Badge variant="outline">{c.endsIn}</Badge>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{c.description}</p>
                {c.rewardKobo > 0 && (
                  <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                    Ends in
                    <span className="font-medium text-foreground">{c.endsIn}</span>
                    <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ============ Sub-components ============

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
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2.5 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

function HowItWorksStep({
  n,
  icon: Icon,
  title,
  description,
}: {
  n: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="relative">
      <div className="flex items-center gap-3">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <Icon className="h-5 w-5" />
          <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground shadow-sm">
            {n}
          </span>
        </div>
        <p className="font-medium">{title}</p>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
