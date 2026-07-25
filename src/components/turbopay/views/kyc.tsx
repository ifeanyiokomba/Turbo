"use client";

import * as React from "react";
import { useApp } from "../store";
import { PageHeader, StatCard } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  ShieldCheck,
  ShieldAlert,
  IdCard,
  Fingerprint,
  CheckCircle2,
  RefreshCw,
  TrendingUp,
  Wallet,
  ArrowLeftRight,
  Lock,
} from "lucide-react";
import { naira, formatDate } from "@/lib/money";
import { KYC_TIER_LIMITS } from "@/lib/constants";
import { toast } from "sonner";

interface KycLimits {
  label: string;
  singleTxLimitKobo: number;
  dailyLimitKobo: number;
  maxBalanceKobo: number;
}

interface Verification {
  id: string;
  tier: number;
  status: string;
  provider: string;
  verifiedAt: string | null;
  createdAt: string;
}

interface KycData {
  kycTier: number;
  kycStatus: string;
  nin: string | null;
  bvn: string | null;
  limits: KycLimits;
  verifications: Verification[];
}

const TIER_LABELS: Record<number, string> = {
  1: "Starter",
  2: "Verified",
  3: "Premium",
};

const TIER_DESCRIPTIONS: Record<number, string> = {
  1: "Default tier — perfect for everyday spending.",
  2: "Verify with NIN to unlock higher limits.",
  3: "Verify with BVN for premium limits and features.",
};

function maxBalanceLabel(kobo: number): string {
  if (kobo >= Number.MAX_SAFE_INTEGER || kobo > 1_000_000_000_000) return "Unlimited";
  return naira(kobo);
}

export default function KycView() {
  const { setUser, user } = useApp();
  const [data, setData] = React.useState<KycData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  // forms
  const [nin, setNin] = React.useState("");
  const [bvn, setBvn] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/kyc", { cache: "no-store" });
      if (res.ok) setData(await res.json());
      else if (res.status === 401) toast.error("Session expired. Please log in again.");
      else toast.error("Failed to load KYC status.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function refreshUser() {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        if (j?.user) setUser(j.user);
      }
    } catch {
      /* ignore */
    }
  }

  async function submitTier(tier: 2 | 3) {
    const identifier = tier === 2 ? nin : bvn;
    const label = tier === 2 ? "NIN" : "BVN";
    if (identifier.length !== 11) {
      toast.error(`${label} must be 11 digits`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tier === 2 ? { tier: 2, nin } : { tier: 3, bvn }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j?.error ?? "Verification failed");
        return;
      }
      toast.success(`Tier ${tier} verified — ${TIER_LABELS[tier]} unlocked!`);
      if (tier === 2) setNin("");
      else setBvn("");
      if (j?.user) setUser(j.user);
      await refreshUser();
      load();
    } finally {
      setBusy(false);
    }
  }

  const tier = data?.kycTier ?? user?.kycTier ?? 1;
  const status = data?.kycStatus ?? user?.kycStatus ?? "UNVERIFIED";
  const limits = data?.limits ?? KYC_TIER_LIMITS[tier] ?? KYC_TIER_LIMITS[1];
  const verified = status === "VERIFIED";
  const canApplyTier2 = tier < 2;
  const canApplyTier3 = tier < 3;

  return (
    <div className="space-y-6 tp-fade-rise">
      <PageHeader
        title="KYC & Limits"
        subtitle="Verify your identity to unlock higher transaction limits."
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Current status */}
          <Card className="overflow-hidden p-0">
            <div
              className={`flex flex-wrap items-center justify-between gap-4 p-6 ${
                verified
                  ? "bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent"
                  : "bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent"
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                    verified
                      ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                      : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {verified ? <ShieldCheck className="h-7 w-7" /> : <ShieldAlert className="h-7 w-7" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold">Tier {tier} · {TIER_LABELS[tier]}</p>
                    <Badge
                      className={
                        verified
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      }
                    >
                      {status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{TIER_DESCRIPTIONS[tier]}</p>
                </div>
              </div>
              {data?.verifications && data.verifications.length > 0 && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Last verified</p>
                  <p className="text-sm font-semibold">
                    {data.verifications[0].verifiedAt
                      ? formatDate(data.verifications[0].verifiedAt, true)
                      : "—"}
                  </p>
                  {data.nin && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      NIN ••••{data.nin.slice(-3)}
                    </p>
                  )}
                  {data.bvn && (
                    <p className="text-xs text-muted-foreground">
                      BVN ••••{data.bvn.slice(-3)}
                    </p>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Current tier limits */}
          <div>
            <h2 className="mb-3 text-sm font-semibold">Current tier limits</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Single transaction"
                value={naira(limits.singleTxLimitKobo)}
                icon={ArrowLeftRight}
                tone="success"
              />
              <StatCard
                label="Daily limit"
                value={naira(limits.dailyLimitKobo)}
                icon={TrendingUp}
                tone="warning"
              />
              <StatCard
                label="Max wallet balance"
                value={maxBalanceLabel(limits.maxBalanceKobo)}
                icon={Wallet}
              />
            </div>
          </div>

          {/* Tier comparison table */}
          <Card className="overflow-hidden p-0">
            <div className="border-b p-5">
              <h2 className="text-sm font-semibold">Tier comparison</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Compare limits across all three tiers. Verify to unlock more.
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Tier</TableHead>
                  <TableHead>Single tx</TableHead>
                  <TableHead>Daily limit</TableHead>
                  <TableHead>Max balance</TableHead>
                  <TableHead className="pr-5 text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(KYC_TIER_LIMITS).map(([t, cfg]) => {
                  const tNum = Number(t);
                  const isCurrent = tNum === tier;
                  const isUnlocked = tNum <= tier;
                  return (
                    <TableRow
                      key={t}
                      className={isCurrent ? "bg-emerald-500/5" : undefined}
                    >
                      <TableCell className="pl-5 font-medium">
                        <div className="flex items-center gap-2">
                          Tier {tNum}
                          <Badge variant="outline" className="text-xs">
                            {cfg.label}
                          </Badge>
                          {isCurrent && (
                            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                              Current
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">{naira(cfg.singleTxLimitKobo)}</TableCell>
                      <TableCell className="tabular-nums">{naira(cfg.dailyLimitKobo)}</TableCell>
                      <TableCell className="tabular-nums">{maxBalanceLabel(cfg.maxBalanceKobo)}</TableCell>
                      <TableCell className="pr-5 text-right">
                        {isUnlocked ? (
                          <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Lock className="ml-auto h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Verification forms */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Tier 2 — NIN */}
            <Card className="flex flex-col p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400">
                  <IdCard className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">Tier 2 · NIN Verification</p>
                    {tier >= 2 && (
                      <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Verified
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Enter your 11-digit National Identification Number. Verification is instant.
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Label htmlFor="nin">NIN (11 digits)</Label>
                <Input
                  id="nin"
                  inputMode="numeric"
                  placeholder="12345678901"
                  maxLength={11}
                  value={nin}
                  onChange={(e) => setNin(e.target.value.replace(/\D+/g, ""))}
                  disabled={!canApplyTier2 || busy}
                />
                <p className="text-[10px] text-muted-foreground">
                  We never store your NIN in plaintext. Verification is via NIMC (mock).
                </p>
              </div>
              <Button
                className="mt-4 w-full gap-1.5"
                disabled={!canApplyTier2 || nin.length !== 11 || busy}
                onClick={() => submitTier(2)}
              >
                {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {canApplyTier2 ? "Verify NIN" : "Already verified"}
              </Button>
            </Card>

            {/* Tier 3 — BVN */}
            <Card className="flex flex-col p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <Fingerprint className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">Tier 3 · BVN Verification</p>
                    {tier >= 3 && (
                      <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Verified
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Enter your 11-digit Bank Verification Number for premium limits.
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Label htmlFor="bvn">BVN (11 digits)</Label>
                <Input
                  id="bvn"
                  inputMode="numeric"
                  placeholder="12345678901"
                  maxLength={11}
                  value={bvn}
                  onChange={(e) => setBvn(e.target.value.replace(/\D+/g, ""))}
                  disabled={!canApplyTier3 || busy}
                />
                <p className="text-[10px] text-muted-foreground">
                  Requires Tier 2 first. Verification is via NIBSS (mock).
                </p>
              </div>
              <Button
                className="mt-4 w-full gap-1.5"
                disabled={!canApplyTier3 || bvn.length !== 11 || busy}
                onClick={() => submitTier(3)}
              >
                {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
                {canApplyTier3 ? "Verify BVN" : "Already verified"}
              </Button>
            </Card>
          </div>

          {/* Verification history */}
          {data?.verifications && data.verifications.length > 0 && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold">Verification history</h2>
              <div className="mt-3 space-y-2">
                {data.verifications.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between rounded-xl border bg-muted/30 px-3 py-2.5 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="font-medium">Tier {v.tier} · {TIER_LABELS[v.tier]}</span>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>{v.verifiedAt ? formatDate(v.verifiedAt, true) : formatDate(v.createdAt, true)}</p>
                      <p>{v.provider} · {v.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
