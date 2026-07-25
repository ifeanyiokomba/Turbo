"use client";

import * as React from "react";
import { useApp, type AppUser } from "./store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  ShieldCheck,
  Wallet as WalletIcon,
  Landmark,
  Copy,
  Check,
  ArrowRight,
  ArrowLeft,
  X,
  Sparkles,
  PartyPopper,
  Lock,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

const DISMISS_KEY = "tp_onboarding_done";

const QUICK_FUND_CHIPS = [
  { label: "₦1K", kobo: 100_000 },
  { label: "₦5K", kobo: 500_000 },
  { label: "₦10K", kobo: 1_000_000 },
];

interface WalletSummary {
  wallet: { balanceKobo: number; currency: string; status: string } | null;
  virtualAccount: {
    accountNumber: string;
    accountName: string;
    bankName: string;
    bankCode: string;
  } | null;
}

type StepId = "PIN" | "FUND" | "KYC";

function buildSteps(user: AppUser, balanceKobo: number): StepId[] {
  const steps: StepId[] = [];
  if (!user.hasPin) steps.push("PIN");
  if (balanceKobo <= 0) steps.push("FUND");
  if (user.kycStatus !== "VERIFIED") steps.push("KYC");
  return steps;
}

export function OnboardingOverlay({ user }: { user: AppUser }) {
  const { setView, setUser } = useApp();
  const [open, setOpen] = React.useState(false);
  const [wallet, setWallet] = React.useState<WalletSummary | null>(null);
  const [steps, setSteps] = React.useState<StepId[]>([]);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [completed, setCompleted] = React.useState(false);

  // Initial load — fetch wallet, compute pending steps, decide whether to show
  const load = React.useCallback(async () => {
    let balanceKobo = 0;
    let virtualAccount: WalletSummary["virtualAccount"] = null;
    try {
      const res = await fetch("/api/wallet", { cache: "no-store" });
      if (res.ok) {
        const data: WalletSummary = await res.json();
        setWallet(data);
        balanceKobo = data.wallet?.balanceKobo ?? 0;
        virtualAccount = data.virtualAccount ?? null;
      }
    } catch {
      /* swallow — we just skip onboarding if we can't load */
    }
    const pending = buildSteps(user, balanceKobo);
    if (pending.length === 0) {
      setOpen(false);
      return;
    }
    setSteps(pending);
    setStepIndex(0);
    setCompleted(false);

    // Check localStorage dismissal — only show if not dismissed
    try {
      const dismissed = typeof window !== "undefined" && window.localStorage.getItem(DISMISS_KEY);
      if (!dismissed) {
        setOpen(true);
      }
    } catch {
      setOpen(true);
    }
    void virtualAccount;
  }, [user]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function dismiss() {
    setOpen(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }

  function next() {
    if (stepIndex >= steps.length - 1) {
      // All steps complete — show celebration
      setCompleted(true);
      try {
        window.localStorage.setItem(DISMISS_KEY, "1");
      } catch {}
      return;
    }
    setStepIndex((i) => Math.min(steps.length - 1, i + 1));
  }

  function prev() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  const currentStep = steps[stepIndex];
  const stepNumber = stepIndex + 1;
  const totalSteps = steps.length;

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-md gap-0 overflow-hidden p-0"
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Premium gradient hero header */}
        <div className="tp-wallet-card relative px-6 pb-7 pt-8 text-white">
          <button
            onClick={dismiss}
            aria-label="Skip onboarding"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white/90 transition-colors hover:bg-white/25"
          >
            <X className="h-4 w-4" />
          </button>
          {completed ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
                <PartyPopper className="h-7 w-7" />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
                Welcome aboard
              </p>
              <h2 className="text-xl font-bold">You&apos;re all set, {user.fullName.split(" ")[0]} 🎉</h2>
              <p className="text-xs opacity-80">
                Your Turbopay account is ready to use.
              </p>
            </div>
          ) : (
            <>
              <Badge className="border-none bg-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
                Step {stepNumber} of {totalSteps}
              </Badge>
              <h2 className="mt-3 text-xl font-bold leading-tight">
                {currentStep === "PIN" && "Set your transaction PIN"}
                {currentStep === "FUND" && "Fund your wallet"}
                {currentStep === "KYC" && "Verify your identity"}
              </h2>
              <p className="mt-1 text-xs text-white/80">
                {currentStep === "PIN" && "A 4-digit PIN secures every transaction you make."}
                {currentStep === "FUND" && "Add money to your wallet to start sending and paying."}
                {currentStep === "KYC" && "Verify your identity to unlock higher limits and features."}
              </p>

              {/* Progress dots */}
              <div className="mt-4 flex items-center gap-1.5">
                {steps.map((s, i) => (
                  <span
                    key={s}
                    aria-hidden
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === stepIndex
                        ? "w-7 bg-white"
                        : i < stepIndex
                        ? "w-3 bg-white/80"
                        : "w-3 bg-white/30"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Step body */}
        <div className="bg-card px-6 py-5">
          {completed ? (
            <CelebrationBody
              onDone={() => {
                setOpen(false);
              }}
              onGoDashboard={() => {
                setOpen(false);
                setView("dashboard");
              }}
            />
          ) : currentStep === "PIN" ? (
            <PinStep
              userId={user.id}
              onSaved={(updatedUser) => {
                setUser(updatedUser);
                toast.success("Transaction PIN set");
                next();
              }}
            />
          ) : currentStep === "FUND" ? (
            <FundStep
              virtualAccount={wallet?.virtualAccount ?? null}
              balanceKobo={wallet?.wallet?.balanceKobo ?? 0}
              onReload={load}
              onContinue={next}
            />
          ) : (
            <KycStep
              onVerify={() => {
                setOpen(false);
                setView("kyc");
                try {
                  window.localStorage.setItem(DISMISS_KEY, "1");
                } catch {}
              }}
              onSkip={next}
            />
          )}

          {/* Footer nav */}
          {!completed && (
            <div className="mt-5 flex items-center justify-between gap-2">
              {stepIndex > 0 ? (
                <Button variant="ghost" size="sm" onClick={prev} className="gap-1.5">
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={dismiss} className="text-muted-foreground">
                  Skip for now
                </Button>
              )}
              <p className="text-[11px] text-muted-foreground">
                {stepNumber} / {totalSteps}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- PIN step ---------------- */

function PinStep({
  userId,
  onSaved,
}: {
  userId: string;
  onSaved: (user: AppUser) => void;
}) {
  const [pin, setPin] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [stage, setStage] = React.useState<"enter" | "confirm">("enter");
  const [saving, setSaving] = React.useState(false);

  async function submitPin(value: string) {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: value }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? "Failed to set PIN");
        setPin("");
        setConfirm("");
        setStage("enter");
        return;
      }
      onSaved(json.user as AppUser);
    } catch {
      toast.error("Network error. Try again.");
      setPin("");
      setConfirm("");
      setStage("enter");
    } finally {
      setSaving(false);
    }
  }

  function onChange(value: string) {
    if (stage === "enter") {
      setPin(value);
      if (value.length === 4) {
        setTimeout(() => setStage("confirm"), 200);
      }
    } else {
      setConfirm(value);
      if (value.length === 4) {
        if (value !== pin) {
          toast.error("PINs don't match. Try again.");
          setPin("");
          setConfirm("");
          setStage("enter");
          return;
        }
        void submitPin(value);
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl bg-emerald-500/10 p-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <Lock className="h-4 w-4" />
        </div>
        <p className="text-xs text-muted-foreground">
          Pick a 4-digit PIN you&apos;ll use to authorize transfers, card funding, and bills.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 py-2">
        <p className="text-sm font-medium">
          {stage === "enter" ? "Enter a 4-digit PIN" : "Re-enter to confirm"}
        </p>
        <InputOTP
          maxLength={4}
          value={stage === "enter" ? pin : confirm}
          onChange={onChange}
          disabled={saving}
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
          </InputOTPGroup>
        </InputOTP>
        {saving && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          Avoid obvious PINs like 1234 or 0000.
        </p>
      </div>
    </div>
  );
}

/* ---------------- Fund step ---------------- */

function FundStep({
  virtualAccount,
  balanceKobo,
  onReload,
  onContinue,
}: {
  virtualAccount: WalletSummary["virtualAccount"];
  balanceKobo: number;
  onReload: () => void;
  onContinue: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const [funding, setFunding] = React.useState<number | null>(null);

  function copyAcc() {
    if (!virtualAccount?.accountNumber) return;
    navigator.clipboard.writeText(virtualAccount.accountNumber);
    setCopied(true);
    toast.success("Account number copied");
    setTimeout(() => setCopied(false), 1500);
  }

  async function quickFund(kobo: number) {
    if (funding !== null) return;
    setFunding(kobo);
    try {
      const res = await fetch("/api/wallet/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountKobo: kobo, method: "DEMO" }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? "Funding failed");
        return;
      }
      toast.success(`Wallet credited with demo funds`);
      onReload();
      onContinue();
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setFunding(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Account number card */}
      {virtualAccount ? (
        <div className="rounded-xl border bg-muted/40 p-4">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-primary" />
            <p className="text-xs font-medium text-muted-foreground">Your virtual account</p>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <button onClick={copyAcc} className="flex items-center gap-2 font-mono text-lg font-bold tracking-wider">
              {virtualAccount.accountNumber}
              {copied ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <Copy className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            <Badge variant="secondary" className="text-[10px]">{virtualAccount.bankName}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {virtualAccount.accountName}
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Transfer from any Nigerian bank to instantly fund your wallet.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-muted/40 p-4 text-center text-xs text-muted-foreground">
          Loading virtual account…
        </div>
      )}

      {/* Quick fund chips (demo) */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Or fund instantly with demo credit
        </p>
        <div className="grid grid-cols-3 gap-2">
          {QUICK_FUND_CHIPS.map((chip) => (
            <button
              key={chip.label}
              onClick={() => quickFund(chip.kobo)}
              disabled={funding !== null}
              className="rounded-xl border border-border bg-background p-3 text-center transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-sm disabled:opacity-60"
            >
              {funding === chip.kobo ? (
                <Loader2 className="mx-auto h-4 w-4 animate-spin text-primary" />
              ) : (
                <>
                  <p className="text-sm font-bold">{chip.label}</p>
                  <p className="text-[10px] text-muted-foreground">demo</p>
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* I've funded */}
      <Button onClick={onContinue} className="w-full gap-1.5">
        <Check className="h-4 w-4" /> I&apos;ve funded my wallet
      </Button>
      {balanceKobo > 0 && (
        <p className="text-center text-[11px] text-emerald-600 dark:text-emerald-400">
          Balance: ₦{(balanceKobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      )}
    </div>
  );
}

/* ---------------- KYC step ---------------- */

function KycStep({
  onVerify,
  onSkip,
}: {
  onVerify: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl bg-amber-500/10 p-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <p className="text-xs text-muted-foreground">
          KYC verification unlocks higher transaction limits, international transfers, and bank withdrawals.
        </p>
      </div>

      <ul className="space-y-2 text-xs">
        {[
          "Tier 1 → Tier 2 raises your daily limit to ₦2,000,000",
          "Required for transfers above ₦50,000",
          "Verified badge on your profile and receipts",
        ].map((line) => (
          <li key={line} className="flex items-start gap-2 text-muted-foreground">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <Button onClick={onVerify} className="w-full gap-1.5">
        <ShieldCheck className="h-4 w-4" /> Verify identity
        <ArrowRight className="h-4 w-4" />
      </Button>
      <Button variant="ghost" onClick={onSkip} className="w-full text-xs text-muted-foreground">
        I&apos;ll do this later
      </Button>
    </div>
  );
}

/* ---------------- Celebration ---------------- */

function CelebrationBody({
  onDone,
  onGoDashboard,
}: {
  onDone: () => void;
  onGoDashboard: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: Lock, label: "PIN set" },
          { icon: WalletIcon, label: "Wallet funded" },
          { icon: ShieldCheck, label: "Identity verified" },
        ].map((item) => (
          <div
            key={item.label}
            className="flex flex-col items-center gap-1.5 rounded-xl border bg-emerald-500/5 p-3 text-center"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <item.icon className="h-4 w-4" />
            </div>
            <Check className="h-3 w-3 text-emerald-500" />
            <p className="text-[10px] font-medium text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        You can always update these from Settings → Security.
      </p>
      <div className="flex flex-col gap-2">
        <Button onClick={onDone} className="gap-1.5">
          Start using Turbopay <ArrowRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" onClick={onGoDashboard} className="text-xs text-muted-foreground">
          Go to dashboard
        </Button>
      </div>
    </div>
  );
}
