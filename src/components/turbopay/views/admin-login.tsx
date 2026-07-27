"use client";

// Turbopay — Admin login screen.
//
// Two-step authentication for admin console access:
//   Step 1: identifier + password → server checks admin role + verifies password
//           If the user has MFA enabled, returns { requiresMFA: true }.
//           Else issues a step-up OTP and returns { requiresOTP: true, devCode? }.
//   Step 2: 6-digit OTP/TOTP code → server verifies + creates an admin session.
//
// Visual design: dark, security-focused palette (deep slate + amber accent for
// the "elevated access" warning). Distinct from the regular AuthScreen so
// users immediately recognize they're in a privileged auth flow.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Logo, Wordmark } from "../logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  ShieldAlert,
  ShieldCheck,
  Loader2,
  KeyRound,
  Fingerprint,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../store";

export function AdminLoginScreen({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const { setUser, setView } = useApp();

  // Step 1 state
  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPwd, setShowPwd] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  // Step 2 state (challenge dialog)
  const [step2Open, setStep2Open] = React.useState(false);
  const [otp, setOtp] = React.useState("");
  const [verifying, setVerifying] = React.useState(false);
  const [challengeType, setChallengeType] = React.useState<"mfa" | "otp" | null>(null);
  const [devCode, setDevCode] = React.useState<string | null>(null);
  const [channel, setChannel] = React.useState<string>("");

  async function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      toast.error("Enter your admin identifier and password");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Admin login failed");
      }
      if (data.requiresMFA) {
        setChallengeType("mfa");
        setDevCode(null);
        setChannel("Authenticator app");
        setOtp("");
        setStep2Open(true);
        toast.info("Enter the 6-digit code from your authenticator app");
      } else if (data.requiresOTP) {
        setChallengeType("otp");
        setChannel(data.channel ?? "SMS/email");
        setDevCode(typeof data.devCode === "string" ? data.devCode : null);
        setOtp("");
        setStep2Open(true);
        if (data.devCode) {
          toast.info(`Dev mode — OTP: ${data.devCode}`);
        } else {
          toast.info(`Verification code sent via ${data.channel ?? "your registered contact"}`);
        }
      } else {
        throw new Error("Unexpected response from server");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Admin login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleStep2(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), otp }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Verification failed");
      }
      setUser(data.user);
      setView("admin");
      setStep2Open(false);
      toast.success(`Admin console access granted. Welcome, ${data.user.fullName.split(" ")[0]}.`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel — darker, security-focused */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-slate-950 p-12 text-white lg:flex">
        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(circle at 20% 20%, #1e293b 0%, #0f172a 50%, #020617 100%)",
          }}
        />
        <div
          className="absolute inset-x-0 top-0 h-1"
          style={{
            background: "linear-gradient(90deg, transparent, #f59e0b, transparent)",
          }}
        />
        <div className="relative flex items-center gap-2">
          <Logo size={36} />
          <Wordmark size={22} />
        </div>
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300">
            <ShieldAlert className="h-3.5 w-3.5" /> Restricted Access
          </span>
          <h2 className="mt-4 text-4xl leading-tight font-bold">
            Admin Console.
            <br />
            <span className="text-amber-400">Elevated privileges.</span>
          </h2>
          <p className="mt-4 max-w-sm text-white/70">
            This portal is restricted to authorized Turbopay staff. All actions are logged and
            audited.
          </p>
          <ul className="mt-8 space-y-3">
            {[
              "Multi-factor authentication required",
              "IP allowlist enforced in production",
              "Every action is recorded in the audit log",
              "Per-role granular permissions (RBAC)",
            ].map((t) => (
              <li key={t} className="flex items-center gap-3 text-sm">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-amber-300">
                  <ShieldCheck className="h-3.5 w-3.5" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/50">
          © {new Date().getFullYear()} Turbopay · Unauthorized access is prohibited and prosecuted
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
        <div className="w-full max-w-md">
          <button
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground mb-6 flex items-center gap-2 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </button>
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <Logo size={32} />
            <Wordmark size={20} />
          </div>

          <div className="mb-6 flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Admin Console</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Authorized personnel only. Step-up verification required.
              </p>
            </div>
          </div>

          <form onSubmit={handleStep1} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-id">Email, phone or username</Label>
              <div className="relative">
                <Mail className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="admin-id"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="admin@turbopay.ng"
                  className="pl-9"
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-pwd">Password</Label>
              <div className="relative">
                <Lock className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="admin-pwd"
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pr-9 pl-9"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
                  aria-label={showPwd ? "Hide password" : "Show password"}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full gap-1.5" disabled={loading}>
              {loading ? (
                "Verifying credentials..."
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" /> Continue to step-up{" "}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs">
            <p className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong className="font-semibold">Security notice:</strong> All admin logins are
                recorded with IP, device, and timestamp. Suspicious activity triggers automatic
                account freeze + security alert.
              </span>
            </p>
          </div>

          <p className="text-muted-foreground mt-6 text-center text-xs">
            Not an admin?{" "}
            <button type="button" onClick={onBack} className="text-primary hover:underline">
              Use the regular sign-in
            </button>
          </p>
        </div>
      </div>

      {/* Step-up verification dialog */}
      <Dialog open={step2Open} onOpenChange={(v) => !v && setStep2Open(v)}>
        <DialogContent className="max-w-md overflow-hidden p-0">
          <div className="relative overflow-hidden bg-slate-900 p-6 text-white">
            <div
              className="absolute inset-x-0 top-0 h-1"
              style={{
                background: "linear-gradient(90deg, transparent, #f59e0b, transparent)",
              }}
            />
            <div className="relative flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/20 text-amber-300">
                {challengeType === "mfa" ? (
                  <Fingerprint className="h-4 w-4" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
              </span>
              <div>
                <DialogTitle className="text-base leading-tight font-semibold">
                  {challengeType === "mfa" ? "Authenticator code" : "Verification code"}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/70">
                  {challengeType === "mfa"
                    ? "Enter the 6-digit code from your authenticator app."
                    : `Enter the 6-digit code sent via ${channel}.`}
                </DialogDescription>
              </div>
            </div>
          </div>

          <form onSubmit={handleStep2} className="p-6">
            <div className="space-y-2">
              <Label htmlFor="admin-otp">6-digit code</Label>
              <div className="flex justify-center py-1">
                <InputOTP
                  id="admin-otp"
                  maxLength={6}
                  value={otp}
                  onChange={(v) => setOtp(v)}
                  autoFocus
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} className="h-11 w-11 text-base" />
                    <InputOTPSlot index={1} className="h-11 w-11 text-base" />
                    <InputOTPSlot index={2} className="h-11 w-11 text-base" />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} className="h-11 w-11 text-base" />
                    <InputOTPSlot index={4} className="h-11 w-11 text-base" />
                    <InputOTPSlot index={5} className="h-11 w-11 text-base" />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              {devCode && (
                <p className="rounded-md bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-700 dark:text-amber-300">
                  Dev mode — your code is <span className="font-mono font-bold">{devCode}</span>
                </p>
              )}
              <p className="text-muted-foreground text-center text-[11px]">
                Code expires in 10 minutes.
              </p>
            </div>

            <DialogFooter className="mt-6 flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setStep2Open(false)}
                disabled={verifying}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 gap-1.5"
                disabled={verifying || otp.length !== 6}
              >
                {verifying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Verifying...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" /> Verify & sign in
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
