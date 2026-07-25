"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface PinRequestOpts {
  title?: string;
  description?: string;
  /** If true, after PIN entry the dialog calls /api/auth/step-up with
   * `amountKobo` and, if the server says a code is required, shows a
   * 6-digit OTP step before resolving. */
  requireStepUp?: boolean;
  /** Amount in kobo — used to decide whether step-up is required. */
  amountKobo?: number;
}

interface PinDialogHandle {
  request: (opts?: PinRequestOpts) => Promise<string>;
}

const PinContext = React.createContext<PinDialogHandle | null>(null);

export function usePin() {
  const ctx = React.useContext(PinContext);
  if (!ctx) throw new Error("usePin must be used within PinDialogProvider");
  return ctx;
}

type Stage = "pin" | "requesting-otp" | "otp" | "verifying";

export function PinDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("Enter PIN");
  const [description, setDescription] = React.useState("Confirm this transaction");
  const [pinValue, setPinValue] = React.useState("");
  const [otpValue, setOtpValue] = React.useState("");
  const [stage, setStage] = React.useState<Stage>("pin");
  const [stepUpRequired, setStepUpRequired] = React.useState(false);
  const [devCode, setDevCode] = React.useState<string | null>(null);
  const [channel, setChannel] = React.useState<string | null>(null);
  const optsRef = React.useRef<PinRequestOpts>({});
  const resolver = React.useRef<((v: string) => void) | null>(null);

  const request = React.useCallback<PinDialogHandle["request"]>((opts) => {
    optsRef.current = opts ?? {};
    setTitle(opts?.title ?? "Enter PIN");
    setDescription(opts?.description ?? "Confirm this transaction");
    setPinValue("");
    setOtpValue("");
    setStage("pin");
    setStepUpRequired(false);
    setDevCode(null);
    setChannel(null);
    setOpen(true);
    return new Promise<string>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function cancel() {
    setOpen(false);
    resolver.current?.("");
    resolver.current = null;
  }

  // Trigger the step-up OTP (called after the PIN is captured).
  async function triggerStepUp(amountKobo: number) {
    setStage("requesting-otp");
    try {
      const res = await fetch("/api/auth/step-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountKobo }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Could not send OTP");
        setOpen(false);
        resolver.current?.("");
        resolver.current = null;
        return;
      }
      if (body.required) {
        setStepUpRequired(true);
        setChannel(body.channel ?? "SMS");
        setDevCode(body.devCode ?? null);
        setStage("otp");
      } else {
        // No step-up required — resolve with the PIN.
        setOpen(false);
        resolver.current?.(pinValue);
        resolver.current = null;
      }
    } catch {
      toast.error("Network error");
      setOpen(false);
      resolver.current?.("");
      resolver.current = null;
    }
  }

  // Submit PIN (4-digit). If step-up is requested, kick off the OTP flow;
  // otherwise resolve immediately.
  function submitPin(v: string) {
    if (v.length !== 4) return;
    const opts = optsRef.current;
    if (opts.requireStepUp && typeof opts.amountKobo === "number" && opts.amountKobo > 0) {
      void triggerStepUp(opts.amountKobo);
      return;
    }
    setOpen(false);
    resolver.current?.(v);
    resolver.current = null;
  }

  // Verify the 6-digit OTP.
  async function verifyOtp(code: string) {
    setStage("verifying");
    try {
      const res = await fetch("/api/auth/step-up/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Verification failed");
        setStage("otp");
        setOtpValue("");
        return;
      }
      if (body.verified) {
        toast.success("Verified");
        setOpen(false);
        resolver.current?.(pinValue);
        resolver.current = null;
      } else {
        const remaining = body.remainingAttempts;
        const reason = body.reason ?? "mismatch";
        if (reason === "locked" || reason === "expired" || reason === "no-otp" || reason === "already-used") {
          toast.error(`OTP ${reason.replace("-", " ")}. Please request a new code.`);
          setStage("pin");
          setPinValue("");
          setOtpValue("");
          setStepUpRequired(false);
        } else {
          toast.error(
            typeof remaining === "number"
              ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`
              : "Incorrect code",
          );
          setStage("otp");
          setOtpValue("");
        }
      }
    } catch {
      toast.error("Network error");
      setStage("otp");
    }
  }

  // Resend: re-trigger the step-up endpoint (issues a new OTP, replacing
  // any outstanding one).
  async function resendOtp() {
    const opts = optsRef.current;
    if (typeof opts.amountKobo !== "number") return;
    setStage("requesting-otp");
    setOtpValue("");
    try {
      const res = await fetch("/api/auth/step-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountKobo: opts.amountKobo }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.required) {
        toast.error(body.error ?? "Could not resend OTP");
        setStage("otp");
        return;
      }
      setDevCode(body.devCode ?? null);
      setChannel(body.channel ?? "SMS");
      setStage("otp");
      toast.success("New code sent");
    } catch {
      toast.error("Network error");
      setStage("otp");
    }
  }

  const isOpen = open;
  const handleOpenChange = (o: boolean) => {
    if (!o) {
      // User dismissed — treat as cancellation.
      cancel();
      return;
    }
    setOpen(o);
  };

  // Render hint text under the OTP input.
  const otpHint =
    stage === "requesting-otp"
      ? "Sending code…"
      : stage === "verifying"
        ? "Verifying…"
        : devCode
          ? `Dev code: ${devCode}`
          : `Code sent via ${channel ?? "SMS"}`;

  return (
    <PinContext.Provider value={{ request }}>
      {children}
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-center flex items-center justify-center gap-1.5">
              {stepUpRequired && stage !== "pin" ? (
                <>
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Step-up verification
                </>
              ) : (
                title
              )}
            </DialogTitle>
            <DialogDescription className="text-center">
              {stepUpRequired && stage !== "pin"
                ? "Enter the 6-digit code sent to your phone"
                : description}
            </DialogDescription>
          </DialogHeader>

          {stage === "pin" && (
            <div className="flex flex-col items-center gap-4 py-2">
              <InputOTP
                maxLength={4}
                value={pinValue}
                onChange={(v) => {
                  setPinValue(v);
                  if (v.length === 4) setTimeout(() => submitPin(v), 150);
                }}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
              </InputOTP>
              <p className="text-xs text-muted-foreground">Enter your 4-digit transaction PIN</p>
            </div>
          )}

          {stage === "requesting-otp" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Sending verification code…</p>
            </div>
          )}

          {(stage === "otp" || stage === "verifying") && (
            <div className="flex flex-col items-center gap-4 py-2">
              <InputOTP
                maxLength={6}
                value={otpValue}
                disabled={stage === "verifying"}
                onChange={(v) => {
                  setOtpValue(v);
                  if (v.length === 6) setTimeout(() => verifyOtp(v), 150);
                }}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
              <p className="text-center text-xs text-muted-foreground">
                {otpHint}
              </p>
              {stage === "otp" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={resendOtp}
                >
                  <RefreshCw className="h-3 w-3" /> Resend code
                </Button>
              )}
              {stage === "verifying" && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Verifying…
                </p>
              )}
            </div>
          )}

          {stepUpRequired && stage !== "pin" && (
            <div className="mt-1 flex items-start gap-2 rounded-lg bg-amber-500/10 p-2.5 text-[11px] text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                This transaction exceeds 50% of your KYC tier&apos;s single-transaction limit,
                so we require an extra verification step.
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PinContext.Provider>
  );
}
