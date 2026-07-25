"use client";

import * as React from "react";
import { useApp } from "../store";
import { PageHeader, EmptyState } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  Loader2,
  ArrowDownLeft,
  RefreshCw,
} from "lucide-react";
import { naira, nairaCompact, timeAgo } from "@/lib/money";
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

interface Campaign {
  id: string;
  title: string;
  description: string;
  rewardKobo: number;
  endsIn: string;
}

interface RewardsData {
  referralCode: string;
  shareLink: string;
  stats: {
    totalReferrals: number;
    totalEarned: number;
    activeCampaigns: number;
  };
  campaigns: Campaign[];
  rewards: RewardTx[];
}

export default function RewardsView() {
  const { user } = useApp();
  const [data, setData] = React.useState<RewardsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [copied, setCopied] = React.useState(false);

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
    setCopied(true);
    toast.success("Referral code copied");
    setTimeout(() => setCopied(false), 1500);
  }

  function copyLink() {
    if (!data?.shareLink) return;
    navigator.clipboard.writeText(data.shareLink);
    setCopied(true);
    toast.success("Share link copied");
    setTimeout(() => setCopied(false), 1500);
  }

  function shareWhatsApp() {
    if (!data) return;
    const text = `Join me on Turbopay and we both earn rewards! Use my code ${data.referralCode}. ${data.shareLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  function shareTwitter() {
    if (!data) return;
    const text = `Just invited friends to @turbopay — use my code ${data.referralCode} and we both get rewarded 🚀 ${data.shareLink}`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Rewards" subtitle="Refer friends, earn bonuses, and track rewards" />
        <Skeleton className="h-56 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  const firstName = user?.fullName.split(" ")[0] ?? "there";

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

      {/* Referral hero card */}
      <Card className="tp-emerald-grad relative overflow-hidden p-5 sm:p-7 text-white tp-sheen">
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Badge className="bg-white/20 text-white">
              <Sparkles className="mr-1 h-3 w-3" /> Refer &amp; earn
            </Badge>
            <h2 className="mt-3 text-2xl font-bold sm:text-3xl">
              Give ₦1,000, get ₦1,000
            </h2>
            <p className="mt-1 max-w-md text-sm text-white/85">
              Share your code with {firstName}. When your friend verifies their KYC, you both get ₦1,000 in your Turbopay wallet.
            </p>
          </div>
          <Trophy className="hidden h-16 w-16 text-white/30 sm:block" />
        </div>

        <div className="relative z-10 mt-5 grid gap-3 sm:grid-cols-[auto,1fr]">
          <div className="flex flex-col gap-2">
            <p className="text-xs text-white/80">Your referral code</p>
            <div className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2.5 backdrop-blur">
              <span className="font-mono text-lg font-bold tracking-widest">
                {data?.referralCode ?? "—"}
              </span>
              <button
                onClick={copyCode}
                className="rounded-md p-1 hover:bg-white/20"
                aria-label="Copy code"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs text-white/80">Share link</p>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 truncate rounded-xl bg-white/15 px-3 py-2.5 text-sm backdrop-blur">
                {data?.shareLink ?? "—"}
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={copyLink}
                className="gap-1.5 bg-white text-emerald-700 hover:bg-white/90"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                Copy
              </Button>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={shareWhatsApp} className="gap-1.5 bg-white text-emerald-700 hover:bg-white/90">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </Button>
          <Button size="sm" variant="secondary" onClick={shareTwitter} className="gap-1.5 bg-white text-emerald-700 hover:bg-white/90">
            <Twitter className="h-4 w-4" /> Twitter
          </Button>
          <Button size="sm" variant="secondary" onClick={copyLink} className="gap-1.5 bg-white/10 text-white hover:bg-white/20">
            <Share2 className="h-4 w-4" /> More
          </Button>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Total referrals</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">{data?.stats.totalReferrals ?? 0}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Friends who used your code</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Total earned</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">{naira(data?.stats.totalEarned ?? 0)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">From referrals + rewards</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Active campaigns</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">{data?.stats.activeCampaigns ?? 0}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Open reward opportunities</p>
        </Card>
      </div>

      {/* Campaigns */}
      {data?.campaigns && data.campaigns.length > 0 && (
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Active campaigns</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.campaigns.map((c) => (
              <div key={c.id} className="rounded-xl border p-4">
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
                  <p className="mt-3 text-xs text-muted-foreground">Ends in <span className="font-medium text-foreground">{c.endsIn}</span></p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Rewards history */}
      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Gift className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Rewards history</h2>
        </div>
        {data?.rewards && data.rewards.length > 0 ? (
          <ul className="max-h-96 overflow-y-auto pr-1 scrollbar-thin">
            {data.rewards.map((r) => {
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
    </div>
  );
}
