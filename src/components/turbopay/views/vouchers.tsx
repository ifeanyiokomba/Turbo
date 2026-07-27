"use client";

import * as React from "react";
import { PageHeader, EmptyState } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  Ticket,
  Gift,
  Copy,
  Check,
  Loader2,
  Sparkles,
  Wallet,
  CalendarClock,
  Percent,
  Receipt,
  Tag,
  Hash,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { naira, formatDate, timeAgo } from "@/lib/money";
import { usePin } from "../parts/pin-dialog";

// ---------- Types ----------
interface VoucherItem {
  id: string;
  code: string;
  type: string;
  valueKobo: number;
  percentOff: number;
  description: string;
  minAmountKobo: number;
  maxRedemptions: number;
  redemptionsCount: number;
  perUserLimit: number;
  validFrom: string;
  validUntil: string | null;
  status: string;
}

interface Redemption {
  id: string;
  voucherId: string;
  valueAppliedKobo: number;
  status: string;
  createdAt: string;
  voucher: {
    id: string;
    code: string;
    type: string;
    valueKobo: number;
    percentOff: number;
    description: string;
  };
}

interface VouchersData {
  vouchers: VoucherItem[];
  redemptions: Redemption[];
}

// ---------- Display maps ----------
const TYPE_TONE: Record<string, string> = {
  CASHBACK: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  FLAT_OFF: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  PERCENT_OFF: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  FEE_WAIVER: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  DISCOUNT: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
};

function typeLabel(t: string) {
  return t
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function typeIcon(t: string) {
  switch (t) {
    case "CASHBACK":
      return Wallet;
    case "PERCENT_OFF":
      return Percent;
    case "FLAT_OFF":
    case "DISCOUNT":
      return Tag;
    case "FEE_WAIVER":
      return Receipt;
    default:
      return Gift;
  }
}

function TypeIcon({ type, className }: { type: string; className?: string }) {
  const Cmp = typeIcon(type) as React.ComponentType<{ className?: string }>;
  return React.createElement(Cmp, { className });
}

function describeVoucher(v: VoucherItem): string {
  switch (v.type) {
    case "CASHBACK":
      return `${naira(v.valueKobo)} cashback`;
    case "FLAT_OFF":
      return `${naira(v.valueKobo)} off`;
    case "PERCENT_OFF":
      return `${v.percentOff}% off`;
    case "FEE_WAIVER":
      return "Fees waived";
    case "DISCOUNT":
      return `${naira(v.valueKobo)} discount`;
    default:
      return "Voucher benefit";
  }
}

// ---------- Component ----------
export default function VouchersView() {
  const pin = usePin();
  const [data, setData] = React.useState<VouchersData | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Redeem dialog state
  const [redeemOpen, setRedeemOpen] = React.useState(false);
  const [redeemTarget, setRedeemTarget] = React.useState<VoucherItem | null>(null);
  const [codeInput, setCodeInput] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/vouchers", { cache: "no-store" });
      if (res.status === 401) {
        toast.error("Session expired. Please log in again.");
        return;
      }
      if (!res.ok) {
        toast.error("Failed to load vouchers");
        return;
      }
      const body = await res.json();
      setData({
        vouchers: body.vouchers ?? [],
        redemptions: body.redemptions ?? [],
      });
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  function openRedeemFor(v?: VoucherItem) {
    setRedeemTarget(v ?? null);
    setCodeInput(v?.code ?? "");
    setOtp("");
    setRedeemOpen(true);
  }

  async function submitRedeem() {
    const code = codeInput.trim();
    if (!code) {
      toast.error("Enter a voucher code");
      return;
    }
    // Request PIN via shared dialog
    let pinValue = otp;
    if (!pinValue) {
      try {
        pinValue = await pin.request({
          title: "Confirm redemption",
          description: "Enter your 4-digit transaction PIN to redeem this voucher",
        });
      } catch {
        return;
      }
      if (!pinValue) {
        toast.error("PIN is required");
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/vouchers/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, pin: pinValue }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "Failed to redeem voucher");
        return;
      }
      // Build success message based on type
      const v = body.voucher;
      const applied = body.valueAppliedKobo ?? 0;
      let msg: string;
      if (v?.type === "CASHBACK") {
        msg = `Voucher redeemed! ${naira(applied)} credited to your wallet`;
      } else if (v?.type === "PERCENT_OFF") {
        msg = `Voucher redeemed! ${applied}% off unlocked`;
      } else if (v?.type === "FLAT_OFF" || v?.type === "DISCOUNT") {
        msg = `Voucher redeemed! ${naira(applied)} discount unlocked`;
      } else if (v?.type === "FEE_WAIVER") {
        msg = `Voucher redeemed! Fee waiver activated`;
      } else {
        msg = "Voucher redeemed!";
      }
      toast.success(msg);
      setRedeemOpen(false);
      setCodeInput("");
      setOtp("");
      setRedeemTarget(null);
      await load();
    } catch {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vouchers"
        subtitle="Redeem promo codes for cashback, discounts, and fee waivers"
        actions={
          <Button onClick={() => openRedeemFor()} className="gap-1.5">
            <Sparkles className="h-4 w-4" /> Redeem code
          </Button>
        }
      />

      {/* Quick redeem strip */}
      <Card className="border-primary/20 via-background overflow-hidden bg-gradient-to-br from-emerald-500/10 to-amber-500/5 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="bg-primary/15 text-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">Have a voucher code?</p>
              <p className="text-muted-foreground mt-0.5 text-sm">
                Enter your code to redeem cashback, discounts, or fee waivers.
              </p>
            </div>
          </div>
          <Button onClick={() => openRedeemFor()} className="gap-1.5 sm:shrink-0">
            <Sparkles className="h-4 w-4" /> Redeem voucher
          </Button>
        </div>
      </Card>

      {/* Active vouchers */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Ticket className="text-primary h-5 w-5" />
          <h2 className="text-base font-semibold">Available vouchers</h2>
          {data && (
            <Badge variant="secondary" className="ml-auto">
              {data.vouchers.length}
            </Badge>
          )}
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-52 rounded-2xl" />
            ))}
          </div>
        ) : !data?.vouchers.length ? (
          <EmptyState
            icon={Ticket}
            title="No active vouchers"
            description="Check back later — new promotions and cashback codes are added regularly."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.vouchers.map((v) => (
              <VoucherCard key={v.id} v={v} onRedeem={() => openRedeemFor(v)} />
            ))}
          </div>
        )}
      </section>

      {/* Redemption history */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <History className="text-primary h-5 w-5" />
          <h2 className="text-base font-semibold">My redemptions</h2>
          {data && (
            <Badge variant="secondary" className="ml-auto">
              {data.redemptions.length}
            </Badge>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
        ) : !data?.redemptions.length ? (
          <EmptyState
            icon={History}
            title="No redemptions yet"
            description="Vouchers you redeem will appear here with their applied value."
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <ul className="divide-y">
              {data.redemptions.map((r) => (
                <RedemptionRow key={r.id} r={r} />
              ))}
            </ul>
          </Card>
        )}
      </section>

      {/* Redeem dialog */}
      <Dialog
        open={redeemOpen}
        onOpenChange={(o) => {
          setRedeemOpen(o);
          if (!o) {
            setRedeemTarget(null);
            setCodeInput("");
            setOtp("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="text-primary h-4 w-4" /> Redeem voucher
            </DialogTitle>
            <DialogDescription>
              Enter your voucher code and confirm with your transaction PIN.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="v-code">Voucher code</Label>
              <Input
                id="v-code"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="e.g. WELCOME500"
                className="font-mono"
                autoCapitalize="characters"
                autoComplete="off"
                disabled={!!redeemTarget}
              />
              {redeemTarget && (
                <p className="text-muted-foreground text-xs">
                  {describeVoucher(redeemTarget)} ·{" "}
                  {redeemTarget.minAmountKobo > 0
                    ? `min ${naira(redeemTarget.minAmountKobo)}`
                    : "no minimum"}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>PIN</Label>
              <div className="flex flex-col items-center gap-2">
                <InputOTP maxLength={4} value={otp} onChange={(v) => setOtp(v)}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                  </InputOTPGroup>
                </InputOTP>
                <p className="text-muted-foreground text-xs">Enter your 4-digit transaction PIN</p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRedeemOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={submitRedeem}
              disabled={submitting || codeInput.trim().length === 0}
              className="gap-1.5"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Redeem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Voucher card ----------
function VoucherCard({ v, onRedeem }: { v: VoucherItem; onRedeem: () => void }) {
  const [copied, setCopied] = React.useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(v.code);
      setCopied(true);
      toast.success("Code copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy code");
    }
  }

  const remaining =
    v.maxRedemptions > 0 ? Math.max(0, v.maxRedemptions - v.redemptionsCount) : null;

  return (
    <Card className="flex flex-col overflow-hidden p-0">
      {/* Top ribbon */}
      <div className="relative bg-gradient-to-br from-emerald-500/15 via-amber-500/10 to-transparent p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                TYPE_TONE[v.type] ?? "bg-muted text-muted-foreground"
              }`}
            >
              <TypeIcon type={v.type} className="h-4 w-4" />
            </div>
            <Badge variant="secondary" className={TYPE_TONE[v.type] ?? ""}>
              {typeLabel(v.type)}
            </Badge>
          </div>
          {v.validUntil && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <CalendarClock className="h-3 w-3" />
              {formatDate(v.validUntil)}
            </Badge>
          )}
        </div>
        <p className="mt-3 text-2xl font-bold tabular-nums">{describeVoucher(v)}</p>
        <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{v.description}</p>
      </div>

      {/* Code block */}
      <div className="bg-muted/30 flex items-center justify-between gap-2 border-y border-dashed px-5 py-3">
        <div className="flex items-center gap-1.5">
          <Hash className="text-muted-foreground h-3.5 w-3.5" />
          <code className="font-mono text-sm font-semibold tracking-wider">{v.code}</code>
        </div>
        <Button variant="ghost" size="sm" onClick={copyCode} className="h-8 gap-1 px-2 text-xs">
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-500" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copy
            </>
          )}
        </Button>
      </div>

      {/* Footer */}
      <div className="flex flex-1 flex-col justify-between gap-3 p-5">
        <div className="grid grid-cols-2 gap-2 text-xs">
          {v.minAmountKobo > 0 && (
            <div>
              <p className="text-muted-foreground">Min amount</p>
              <p className="font-semibold tabular-nums">{naira(v.minAmountKobo)}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground">Per user</p>
            <p className="font-semibold">{v.perUserLimit}×</p>
          </div>
          {remaining !== null && (
            <div>
              <p className="text-muted-foreground">Remaining</p>
              <p className="font-semibold tabular-nums">{remaining}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground">Redeemed</p>
            <p className="font-semibold tabular-nums">{v.redemptionsCount}</p>
          </div>
        </div>
        <Button onClick={onRedeem} className="gap-1.5">
          <Sparkles className="h-4 w-4" /> Redeem
        </Button>
      </div>
    </Card>
  );
}

// ---------- Redemption row ----------
function RedemptionRow({ r }: { r: Redemption }) {
  const success = r.status === "SUCCESS";
  return (
    <li className="flex items-center gap-3 p-4">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
          TYPE_TONE[r.voucher.type] ?? "bg-muted text-muted-foreground"
        }`}
      >
        <TypeIcon type={r.voucher.type} className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <code className="font-mono text-sm font-semibold">{r.voucher.code}</code>
          <Badge variant="secondary" className={TYPE_TONE[r.voucher.type] ?? ""}>
            {typeLabel(r.voucher.type)}
          </Badge>
        </div>
        <p className="text-muted-foreground mt-0.5 truncate text-xs">{r.voucher.description}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums">
          {r.voucher.type === "PERCENT_OFF"
            ? `${r.valueAppliedKobo}%`
            : r.voucher.type === "FEE_WAIVER"
              ? "Waived"
              : naira(r.valueAppliedKobo)}
        </p>
        <p className="text-muted-foreground text-[11px]">{timeAgo(r.createdAt)}</p>
      </div>
      <span
        className={`flex h-2 w-2 shrink-0 rounded-full ${
          success ? "bg-emerald-500" : "bg-red-500"
        }`}
        title={success ? "Success" : "Failed"}
      />
    </li>
  );
}
