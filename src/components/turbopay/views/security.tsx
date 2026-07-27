"use client";

import * as React from "react";
import { useApp, type ViewKey } from "../store";
import { PageHeader, EmptyState } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ShieldCheck,
  Shield,
  ShieldAlert,
  Lock,
  Mail,
  KeyRound,
  Smartphone,
  Monitor,
  MapPin,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  LogIn,
  LogOut,
  RefreshCw,
  Clock,
  AlertTriangle,
  Fingerprint,
  Plus,
  Copy,
  ScanFace,
  Eye,
  EyeOff,
  Download,
  Key,
  ArrowRight,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { startRegistration } from "@simplewebauthn/browser";
import { timeAgo, formatDate } from "@/lib/money";
import { toast } from "sonner";

interface SessionInfo {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  isCurrent: boolean;
}

interface AuditEvent {
  id: string;
  action: string;
  category: string;
  severity: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  metadata: string | null;
}

interface Checklist {
  hasPin: boolean;
  emailVerified: boolean;
  kycVerified: boolean;
}

interface SecurityData {
  sessions: SessionInfo[];
  events: AuditEvent[];
  checklist: Checklist;
}

interface PasskeyInfo {
  id: string;
  deviceName: string | null;
  deviceType: string;
  createdAt: string;
  lastUsedAt: string | null;
}

interface MfaStatus {
  enabled: boolean;
  enabledAt: string | null;
  hasBackupCodes: boolean;
}

function parseUA(ua: string | null | undefined): { device: string; browser: string } {
  if (!ua) return { device: "Unknown device", browser: "" };
  const device = /iPhone|iPad/.test(ua)
    ? "iPhone"
    : /Android/.test(ua)
      ? "Android"
      : /Mac/.test(ua)
        ? "Mac"
        : /Windows/.test(ua)
          ? "Windows PC"
          : /Linux/.test(ua)
            ? "Linux"
            : "Device";
  const browser = /Edg/.test(ua)
    ? "Edge"
    : /Chrome/.test(ua)
      ? "Chrome"
      : /Firefox/.test(ua)
        ? "Firefox"
        : /Safari/.test(ua)
          ? "Safari"
          : "Browser";
  return { device, browser };
}

function severityTone(s: string): { icon: React.ReactNode; color: string } {
  switch (s.toUpperCase()) {
    case "CRITICAL":
      return {
        icon: <ShieldAlert className="h-4 w-4" />,
        color: "text-red-600 dark:text-red-400 bg-red-500/10",
      };
    case "ERROR":
      return {
        icon: <AlertTriangle className="h-4 w-4" />,
        color: "text-red-600 dark:text-red-400 bg-red-500/10",
      };
    case "WARN":
      return {
        icon: <AlertTriangle className="h-4 w-4" />,
        color: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
      };
    default:
      return {
        icon: <Shield className="h-4 w-4" />,
        color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
      };
  }
}

function actionIcon(action: string): React.ReactNode {
  const a = action.toUpperCase();
  if (a.includes("LOGIN") || a.includes("SESSION")) return <LogIn className="h-4 w-4" />;
  if (a.includes("LOGOUT") || a.includes("REVOK")) return <LogOut className="h-4 w-4" />;
  if (a.includes("PIN")) return <KeyRound className="h-4 w-4" />;
  if (a.includes("PASSWORD")) return <Lock className="h-4 w-4" />;
  if (a.includes("PASSKEY")) return <Fingerprint className="h-4 w-4" />;
  if (a.includes("MFA")) return <ShieldCheck className="h-4 w-4" />;
  if (a.includes("KYC")) return <ShieldCheck className="h-4 w-4" />;
  if (a.includes("AML")) return <ShieldAlert className="h-4 w-4" />;
  return <Clock className="h-4 w-4" />;
}

// === Passkeys subsection ===

function PasskeysSection({ onChange }: { onChange?: () => void }) {
  const [list, setList] = React.useState<PasskeyInfo[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [adding, setAdding] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<PasskeyInfo | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [webAuthnSupported, setWebAuthnSupported] = React.useState(false);

  React.useEffect(() => {
    setWebAuthnSupported(
      typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined"
    );
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/passkey/list", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load passkeys");
        return;
      }
      const data = await res.json();
      setList(data.passkeys ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function addPasskey() {
    if (!webAuthnSupported) {
      toast.error("Your browser doesn't support passkeys");
      return;
    }
    setAdding(true);
    try {
      const optsRes = await fetch("/api/auth/passkey/register/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const optsBody = await optsRes.json().catch(() => null);
      if (!optsRes.ok || !optsBody?.options) {
        throw new Error(optsBody?.error ?? "Could not start passkey registration");
      }
      let credential;
      try {
        credential = await startRegistration({ optionsJSON: optsBody.options });
      } catch (err: any) {
        if (err?.name === "NotAllowedError") {
          toast.info("Passkey prompt was cancelled");
          return;
        }
        throw err;
      }
      const deviceName = /iPhone|iPad/.test(navigator.userAgent)
        ? "iPhone / iPad"
        : /Android/.test(navigator.userAgent)
          ? "Android device"
          : /Mac/.test(navigator.userAgent)
            ? "Mac"
            : /Windows/.test(navigator.userAgent)
              ? "Windows PC"
              : "This device";

      const verifyRes = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential, deviceName, challengeToken: optsBody.challengeToken }),
      });
      const verifyBody = await verifyRes.json().catch(() => null);
      if (!verifyRes.ok) {
        throw new Error(verifyBody?.error ?? "Passkey verification failed");
      }
      toast.success("Passkey added");
      await load();
      onChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add passkey");
    } finally {
      setAdding(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/auth/passkey/${deleteTarget.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Failed to delete passkey");
        return;
      }
      toast.success("Passkey removed");
      setDeleteTarget(null);
      await load();
      onChange?.();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Fingerprint className="text-primary h-5 w-5" />
          <div>
            <h2 className="text-base font-semibold">Passkeys</h2>
            <p className="text-muted-foreground text-xs">
              Sign in with Face ID, Touch ID, or a security key.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={addPasskey}
          disabled={adding || !webAuthnSupported}
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </Button>
      </div>

      {!webAuthnSupported ? (
        <EmptyState
          icon={ScanFace}
          title="Passkeys aren't supported"
          description="Use a recent version of Chrome, Safari, or Edge to register a passkey."
        />
      ) : loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : list && list.length > 0 ? (
        <ul className="space-y-2">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Fingerprint className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.deviceName ?? "Passkey"}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {p.deviceType === "singleDevice" ? "This device only" : "Synced across devices"} ·{" "}
                  {p.lastUsedAt ? `used ${timeAgo(p.lastUsedAt)}` : `added ${timeAgo(p.createdAt)}`}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground h-8 w-8 p-0 hover:bg-red-500/10 hover:text-red-600"
                onClick={() => setDeleteTarget(p)}
                aria-label="Delete passkey"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={ScanFace}
          title="No passkeys yet"
          description="Add a passkey to sign in instantly with biometrics — no password needed."
          action={
            <Button
              size="sm"
              variant="outline"
              className="mt-2 gap-1.5"
              onClick={addPasskey}
              disabled={adding}
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add your first passkey
            </Button>
          }
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this passkey?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <>
                  The passkey{" "}
                  <span className="font-medium">{deleteTarget.deviceName ?? "Passkey"}</span> will
                  no longer work for sign-in. You can always add it again later.
                </>
              ) : (
                "This passkey will be removed."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="gap-1.5 bg-red-600 hover:bg-red-700"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// === MFA subsection ===

type MfaStep = "qr" | "verify" | "backup";

function MfaSection({ mfa, onChanged }: { mfa: MfaStatus | null; onChanged: () => void }) {
  const [setupOpen, setSetupOpen] = React.useState(false);
  const [step, setStep] = React.useState<MfaStep>("qr");
  const [uri, setUri] = React.useState("");
  const [secret, setSecret] = React.useState("");
  const [token, setToken] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [backupCodes, setBackupCodes] = React.useState<string[] | null>(null);
  const [savedCodes, setSavedCodes] = React.useState(false);

  // Disable flow
  const [disableOpen, setDisableOpen] = React.useState(false);
  const [disablePwd, setDisablePwd] = React.useState("");
  const [disableShow, setDisableShow] = React.useState(false);
  const [disabling, setDisabling] = React.useState(false);

  // View backup codes flow
  const [viewOpen, setViewOpen] = React.useState(false);
  const [viewPwd, setViewPwd] = React.useState("");
  const [viewShow, setViewShow] = React.useState(false);
  const [viewing, setViewing] = React.useState(false);
  const [viewedCodes, setViewedCodes] = React.useState<string[] | null>(null);

  async function startSetup() {
    setSetupOpen(true);
    setStep("qr");
    setToken("");
    setBackupCodes(null);
    setSavedCodes(false);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/mfa/setup", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Could not start MFA setup");
      setUri(body.uri);
      setSecret(body.secret);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "MFA setup failed");
      setSetupOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function verifyToken() {
    if (!/^\d{6}$/.test(token)) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Verification failed");
      setBackupCodes(body.backupCodes ?? []);
      setStep("backup");
      toast.success("Two-factor authentication enabled");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDisable() {
    if (!disablePwd) {
      toast.error("Enter your password");
      return;
    }
    setDisabling(true);
    try {
      const res = await fetch("/api/auth/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: disablePwd }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Could not disable 2FA");
      toast.success("Two-factor authentication disabled");
      setDisableOpen(false);
      setDisablePwd("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disable 2FA");
    } finally {
      setDisabling(false);
    }
  }

  async function fetchBackupCodes() {
    if (!viewPwd) {
      toast.error("Enter your password");
      return;
    }
    setViewing(true);
    try {
      const res = await fetch("/api/auth/mfa/regenerate-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: viewPwd }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Could not view backup codes");
      setViewedCodes(body.backupCodes ?? []);
      toast.success("New backup codes generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not view backup codes");
    } finally {
      setViewing(false);
    }
  }

  function downloadBackupCodes(codes: string[]) {
    const text =
      "Turbopay — Two-Factor Authentication Backup Codes\n" +
      "Keep these safe. Each code can be used once if you lose access to your authenticator.\n\n" +
      codes.map((c, i) => `${i + 1}. ${c}`).join("\n") +
      "\n\nGenerated: " +
      new Date().toLocaleString();
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "turbopay-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyAll(codes: string[]) {
    navigator.clipboard.writeText(codes.join("\n")).then(
      () => toast.success("Codes copied"),
      () => toast.error("Copy failed")
    );
  }

  const enabled = !!mfa?.enabled;

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-primary h-5 w-5" />
          <div>
            <h2 className="text-base font-semibold">Two-Factor Authentication</h2>
            <p className="text-muted-foreground text-xs">
              Add a one-time code from your authenticator app.
            </p>
          </div>
        </div>
        {enabled ? (
          <Badge
            variant="secondary"
            className="gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          >
            <CheckCircle2 className="h-3 w-3" /> Enabled
          </Badge>
        ) : (
          <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
            Off
          </Badge>
        )}
      </div>

      {enabled ? (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Your account is protected with an authenticator app
            {mfa?.enabledAt ? ` since ${formatDate(mfa.enabledAt)}` : ""}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setViewOpen(true);
                setViewPwd("");
                setViewedCodes(null);
              }}
            >
              <Key className="h-4 w-4" /> View backup codes
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-red-600 hover:bg-red-500/10 hover:text-red-700"
              onClick={() => {
                setDisableOpen(true);
                setDisablePwd("");
              }}
            >
              <Lock className="h-4 w-4" /> Disable 2FA
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Add an extra layer of security. After enabling, you&apos;ll enter a code from an
            authenticator app (like Google Authenticator or Authy) each time you sign in.
          </p>
          <Button size="sm" className="gap-1.5" onClick={startSetup} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Enable 2FA
          </Button>
        </div>
      )}

      {/* === Setup wizard dialog === */}
      <Dialog open={setupOpen} onOpenChange={(o) => !o && setSetupOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="text-primary h-5 w-5" />
              {step === "qr"
                ? "Scan QR code"
                : step === "verify"
                  ? "Enter verification code"
                  : "Save your backup codes"}
            </DialogTitle>
            <DialogDescription>
              {step === "qr"
                ? "Scan with Google Authenticator, Authy, or any TOTP app."
                : step === "verify"
                  ? "Enter the 6-digit code shown in your authenticator app."
                  : "Save these one-time codes somewhere safe. You can use them if you lose your device."}
            </DialogDescription>
          </DialogHeader>

          {step === "qr" && (
            <div className="space-y-4">
              {uri ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-2xl border bg-white p-4">
                    <QRCodeSVG value={uri} size={200} level="M" />
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Can&apos;t scan? Enter this code manually:
                  </p>
                  <code className="bg-muted rounded-md px-3 py-1.5 text-center text-xs tracking-wider break-all">
                    {secret}
                  </code>
                </div>
              ) : (
                <div className="flex justify-center py-8">
                  <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
                </div>
              )}
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setSetupOpen(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  onClick={() => setStep("verify")}
                  className="gap-1.5"
                  disabled={!uri || busy}
                >
                  Next <ArrowRight className="h-4 w-4" />
                </Button>
              </DialogFooter>
            </div>
          )}

          {step === "verify" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3">
                <InputOTP maxLength={6} value={token} onChange={setToken} disabled={busy}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
                <p className="text-muted-foreground text-xs">Code refreshes every 30 seconds.</p>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setStep("qr")} disabled={busy}>
                  Back
                </Button>
                <Button
                  onClick={verifyToken}
                  className="gap-1.5"
                  disabled={busy || token.length !== 6}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Verify & enable
                </Button>
              </DialogFooter>
            </div>
          )}

          {step === "backup" && backupCodes && (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mb-1 inline h-4 w-4" /> These codes are shown only once.
                Save them somewhere safe — you&apos;ll need them if you lose your authenticator
                device.
              </div>
              <div className="grid grid-cols-2 gap-2">
                {backupCodes.map((c) => (
                  <code
                    key={c}
                    className="bg-muted rounded-md px-2 py-2 text-center font-mono text-sm tracking-wider"
                  >
                    {c}
                  </code>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => copyAll(backupCodes)}
                >
                  <Copy className="h-3.5 w-3.5" /> Copy all
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => downloadBackupCodes(backupCodes)}
                >
                  <Download className="h-3.5 w-3.5" /> Download .txt
                </Button>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={savedCodes}
                  onCheckedChange={(v) => setSavedCodes(v === true)}
                  className="mt-0.5"
                />
                <span className="text-muted-foreground">
                  I&apos;ve saved these codes somewhere safe.
                </span>
              </label>
              <DialogFooter>
                <Button
                  onClick={() => setSetupOpen(false)}
                  disabled={!savedCodes}
                  className="gap-1.5"
                >
                  <CheckCircle2 className="h-4 w-4" /> Done
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* === Disable dialog === */}
      <Dialog open={disableOpen} onOpenChange={(o) => !o && setDisableOpen(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" /> Disable 2FA?
            </DialogTitle>
            <DialogDescription>
              For your security, please enter your password to confirm. Backup codes will be
              cleared.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="disable-pwd">Password</Label>
            <div className="relative">
              <Input
                id="disable-pwd"
                type={disableShow ? "text" : "password"}
                value={disablePwd}
                onChange={(e) => setDisablePwd(e.target.value)}
                placeholder="••••••••"
                onKeyDown={(e) => e.key === "Enter" && confirmDisable()}
              />
              <button
                type="button"
                onClick={() => setDisableShow((v) => !v)}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
                aria-label="Toggle password visibility"
              >
                {disableShow ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDisableOpen(false)} disabled={disabling}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDisable}
              disabled={disabling}
              className="gap-1.5"
            >
              {disabling && <Loader2 className="h-4 w-4 animate-spin" />}
              Disable 2FA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === View backup codes dialog === */}
      <Dialog open={viewOpen} onOpenChange={(o) => !o && setViewOpen(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" /> View backup codes
            </DialogTitle>
            <DialogDescription>
              Enter your password to generate a fresh set of backup codes. The previous codes will
              be invalidated.
            </DialogDescription>
          </DialogHeader>
          {!viewedCodes ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="view-pwd">Password</Label>
                <div className="relative">
                  <Input
                    id="view-pwd"
                    type={viewShow ? "text" : "password"}
                    value={viewPwd}
                    onChange={(e) => setViewPwd(e.target.value)}
                    placeholder="••••••••"
                    onKeyDown={(e) => e.key === "Enter" && fetchBackupCodes()}
                  />
                  <button
                    type="button"
                    onClick={() => setViewShow((v) => !v)}
                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
                    aria-label="Toggle password visibility"
                  >
                    {viewShow ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setViewOpen(false)} disabled={viewing}>
                  Cancel
                </Button>
                <Button onClick={fetchBackupCodes} disabled={viewing} className="gap-1.5">
                  {viewing && <Loader2 className="h-4 w-4 animate-spin" />}
                  Show codes
                </Button>
              </DialogFooter>
            </>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {viewedCodes.map((c) => (
                  <code
                    key={c}
                    className="bg-muted rounded-md px-2 py-2 text-center font-mono text-sm tracking-wider"
                  >
                    {c}
                  </code>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => copyAll(viewedCodes)}
                >
                  <Copy className="h-3.5 w-3.5" /> Copy all
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => downloadBackupCodes(viewedCodes)}
                >
                  <Download className="h-3.5 w-3.5" /> Download .txt
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => setViewOpen(false)}>Done</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// === Devices subsection ===

interface DeviceInfo {
  id: string;
  deviceName: string | null;
  deviceType: string;
  os: string | null;
  browser: string | null;
  ip: string | null;
  trusted: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  isCurrent?: boolean;
  fingerprint?: string;
}

function deviceTypeIcon(type: string): React.ReactNode {
  const t = (type || "").toLowerCase();
  if (t === "mobile" || t === "tablet") return <Smartphone className="h-4 w-4" />;
  if (t === "desktop") return <Monitor className="h-4 w-4" />;
  return <Monitor className="h-4 w-4" />;
}

function DevicesSection() {
  const [list, setList] = React.useState<DeviceInfo[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null); // device id being mutated
  const [confirmRevoke, setConfirmRevoke] = React.useState<DeviceInfo | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/devices", { cache: "no-store" });
      if (!res.ok) {
        toast.error("Failed to load devices");
        return;
      }
      const data = await res.json();
      setList(data.devices ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function trustCurrent() {
    setBusy("current");
    try {
      const res = await fetch("/api/auth/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to trust device");
        return;
      }
      toast.success("This device is now trusted");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function revokeDevice(device: DeviceInfo) {
    setBusy(device.id);
    try {
      const res = await fetch(`/api/auth/devices/${device.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to revoke device");
        return;
      }
      toast.success("Device revoked");
      setConfirmRevoke(null);
      await load();
    } finally {
      setBusy(null);
    }
  }

  const current = list?.find((d) => d.isCurrent);
  const showTrustCurrent = !!current && !current.trusted;

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Monitor className="text-primary h-5 w-5" />
          <div>
            <h2 className="text-base font-semibold">Devices</h2>
            <p className="text-muted-foreground text-xs">
              Devices that have signed in to your account.
            </p>
          </div>
        </div>
        {showTrustCurrent && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={trustCurrent}
            disabled={busy === "current"}
          >
            {busy === "current" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Trust this device
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : list && list.length > 0 ? (
        <ul className="scrollbar-thin max-h-96 space-y-2 overflow-y-auto pr-1">
          {list.map((d) => (
            <li
              key={d.id}
              className={`flex items-center gap-3 rounded-xl border p-3 ${
                d.isCurrent ? "border-emerald-500/40 bg-emerald-500/5" : ""
              }`}
            >
              <div className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                {deviceTypeIcon(d.deviceType)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {d.deviceName ?? "Unknown device"}
                  {d.isCurrent && (
                    <Badge
                      variant="secondary"
                      className="ml-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    >
                      This device
                    </Badge>
                  )}
                  {d.trusted && (
                    <Badge
                      variant="secondary"
                      className="ml-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    >
                      <ShieldCheck className="mr-1 h-3 w-3" /> Trusted
                    </Badge>
                  )}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {[d.os, d.browser, d.ip].filter(Boolean).join(" · ")} · {timeAgo(d.lastSeenAt)}
                </p>
              </div>
              {!d.isCurrent && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground h-8 w-8 p-0 hover:bg-red-500/10 hover:text-red-600"
                  onClick={() => setConfirmRevoke(d)}
                  aria-label="Revoke device"
                  disabled={busy === d.id}
                >
                  {busy === d.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Monitor}
          title="No devices tracked yet"
          description="Sign in to start tracking your devices."
        />
      )}

      <AlertDialog open={!!confirmRevoke} onOpenChange={(o) => !o && setConfirmRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this device?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRevoke ? (
                <>
                  The device{" "}
                  <span className="font-medium">
                    {confirmRevoke.deviceName ?? "Unknown device"}
                  </span>{" "}
                  {confirmRevoke.ip ? `at ${confirmRevoke.ip}` : ""} will be removed from your
                  device list and un-trusted.
                </>
              ) : (
                "This device will be removed from your device list."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmRevoke && revokeDevice(confirmRevoke)}
              disabled={!!busy}
              className="gap-1.5 bg-red-600 hover:bg-red-700"
            >
              {!!busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Revoke device
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default function SecurityView() {
  const { setView } = useApp();
  const [data, setData] = React.useState<SecurityData | null>(null);
  const [mfa, setMfa] = React.useState<MfaStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [revokeTarget, setRevokeTarget] = React.useState<SessionInfo | null>(null);
  const [revoking, setRevoking] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [secRes, mfaRes] = await Promise.all([
        fetch("/api/security", { cache: "no-store" }),
        fetch("/api/auth/mfa/status", { cache: "no-store" }),
      ]);
      if (secRes.status === 401) {
        toast.error("Session expired. Please log in again.");
        return;
      }
      if (secRes.ok) setData(await secRes.json());
      if (mfaRes.ok) setMfa(await mfaRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function confirmRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const res = await fetch(`/api/security/sessions/${revokeTarget.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Failed to revoke session");
        return;
      }
      toast.success("Session revoked");
      setRevokeTarget(null);
      await load();
    } catch {
      toast.error("Network error");
    } finally {
      setRevoking(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Security Center" subtitle="Protect your account and devices" />
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
          <div className="space-y-5">
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  // Risk score (simple)
  const cl = data?.checklist ?? { hasPin: false, emailVerified: false, kycVerified: false };
  let score = 0;
  if (cl.hasPin) score += 30;
  if (cl.emailVerified) score += 20;
  if (cl.kycVerified) score += 30;
  if (mfa?.enabled) score += 20;
  const riskLabel = score >= 80 ? "Low risk" : score >= 50 ? "Medium risk" : "High risk";
  const riskTone =
    score >= 80
      ? {
          color: "text-emerald-600 dark:text-emerald-400",
          bar: "bg-emerald-500",
          badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        }
      : score >= 50
        ? {
            color: "text-amber-600 dark:text-amber-400",
            bar: "bg-amber-500",
            badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
          }
        : {
            color: "text-red-600 dark:text-red-400",
            bar: "bg-red-500",
            badge: "bg-red-500/10 text-red-600 dark:text-red-400",
          };

  const checklistItems: {
    label: string;
    done: boolean;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
    cta?: { view: ViewKey; label: string };
    mfaEnable?: boolean;
  }[] = [
    {
      label: "Transaction PIN",
      done: cl.hasPin,
      desc: cl.hasPin ? "PIN is set" : "Set a 4-digit PIN to authorize transactions",
      icon: KeyRound,
      cta: cl.hasPin ? undefined : { view: "settings", label: "Set PIN" },
    },
    {
      label: "Email verified",
      done: cl.emailVerified,
      desc: cl.emailVerified ? "Email confirmed" : "Verify your email to secure your account",
      icon: Mail,
      cta: cl.emailVerified ? undefined : { view: "settings", label: "Update email" },
    },
    {
      label: "KYC verified",
      done: cl.kycVerified,
      desc: cl.kycVerified ? "Identity verified" : "Verify NIN or BVN to unlock higher limits",
      icon: ShieldCheck,
      cta: cl.kycVerified ? undefined : { view: "kyc", label: "Verify KYC" },
    },
    {
      label: "Two-factor authentication",
      done: !!mfa?.enabled,
      desc: mfa?.enabled ? "Authenticator app enabled" : "Add a one-time code as a second factor",
      icon: Fingerprint,
      mfaEnable: !mfa?.enabled,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Security Center"
        subtitle="Protect your account and devices"
        actions={
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left col */}
        <div className="space-y-5 lg:col-span-2">
          {/* Risk score */}
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <Shield className="text-primary h-5 w-5" />
              <h2 className="text-base font-semibold">Account risk score</h2>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className={`text-3xl font-bold tabular-nums ${riskTone.color}`}>{score}/100</p>
                <Badge variant="secondary" className={`mt-1 ${riskTone.badge}`}>
                  {riskLabel}
                </Badge>
              </div>
              <p className="text-muted-foreground max-w-xs text-xs">
                Based on PIN, email verification, KYC status, and 2FA. Complete more items to lower
                your risk.
              </p>
            </div>
            <div className="bg-muted mt-4 h-2.5 w-full overflow-hidden rounded-full">
              <div
                className={`h-full rounded-full ${riskTone.bar} transition-all`}
                style={{ width: `${score}%` }}
              />
            </div>
          </Card>

          {/* Checklist */}
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck className="text-primary h-5 w-5" />
              <h2 className="text-base font-semibold">Security checklist</h2>
            </div>
            <div className="space-y-2">
              {checklistItems.map((it) => (
                <div key={it.label} className="flex items-center gap-3 rounded-xl border p-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${it.done ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}
                  >
                    {it.done ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <it.icon className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{it.label}</p>
                    <p className="text-muted-foreground truncate text-xs">{it.desc}</p>
                  </div>
                  {it.cta ? (
                    <Button size="sm" variant="outline" onClick={() => setView(it.cta!.view)}>
                      {it.cta.label}
                    </Button>
                  ) : it.done ? (
                    <Badge
                      variant="secondary"
                      className="gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Done
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
                      Action needed
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Passkeys */}
          <PasskeysSection onChange={load} />

          {/* MFA */}
          <MfaSection mfa={mfa} onChanged={load} />

          {/* Devices */}
          <DevicesSection />

          {/* Recent security events */}
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <Clock className="text-primary h-5 w-5" />
              <h2 className="text-base font-semibold">Recent security events</h2>
            </div>
            {data?.events && data.events.length > 0 ? (
              <ul className="scrollbar-thin max-h-96 overflow-y-auto pr-1">
                {data.events.map((ev) => {
                  const tone = severityTone(ev.severity);
                  return (
                    <li
                      key={ev.id}
                      className="flex items-start gap-3 border-b py-3 last:border-b-0 last:pb-0"
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone.color}`}
                      >
                        {actionIcon(ev.action)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {ev.action
                            .replace(/_/g, " ")
                            .toLowerCase()
                            .replace(/\b\w/g, (c) => c.toUpperCase())}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {ev.ip ?? "unknown IP"} · {formatDate(ev.createdAt, true)}
                        </p>
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${tone.color}`}>
                        {ev.severity}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                icon={Clock}
                title="No recent events"
                description="Security events will appear here."
              />
            )}
          </Card>
        </div>

        {/* Right col */}
        <div className="space-y-5">
          {/* Active sessions */}
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <Monitor className="text-primary h-5 w-5" />
              <h2 className="text-base font-semibold">Active sessions</h2>
            </div>
            {data?.sessions && data.sessions.length > 0 ? (
              <ul className="space-y-2">
                {data.sessions.map((s) => {
                  const { device, browser } = parseUA(s.userAgent);
                  return (
                    <li
                      key={s.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 ${
                        s.isCurrent ? "border-emerald-500/40 bg-emerald-500/5" : ""
                      }`}
                    >
                      <div className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                        {device === "iPhone" || device === "Android" ? (
                          <Smartphone className="h-4 w-4" />
                        ) : (
                          <Monitor className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {device} · {browser}
                          {s.isCurrent && (
                            <Badge
                              variant="secondary"
                              className="ml-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            >
                              This device
                            </Badge>
                          )}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {s.ip ?? "unknown IP"} · {timeAgo(s.createdAt)}
                        </p>
                      </div>
                      {!s.isCurrent && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground h-8 w-8 p-0 hover:bg-red-500/10 hover:text-red-600"
                          onClick={() => setRevokeTarget(s)}
                          aria-label="Revoke session"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                icon={Monitor}
                title="No active sessions"
                description="Your session list is empty."
              />
            )}
          </Card>

          {/* Quick links */}
          <Card className="p-5 sm:p-6">
            <div className="mb-3 flex items-center gap-2">
              <MapPin className="text-primary h-5 w-5" />
              <h2 className="text-base font-semibold">Quick security tips</h2>
            </div>
            <ul className="text-muted-foreground space-y-2 text-xs">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                Use a unique password you don&apos;t reuse elsewhere.
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                Never share your PIN with anyone — including Turbopay staff.
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                Review active sessions and revoke unfamiliar devices.
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                Add a passkey for passwordless sign-in.
              </li>
              <li className="flex items-start gap-2">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                Turbopay will never ask for your password or PIN by phone or email.
              </li>
            </ul>
          </Card>
        </div>
      </div>

      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this session?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget ? (
                <>
                  The device{" "}
                  <span className="font-medium">{parseUA(revokeTarget.userAgent).device}</span> at{" "}
                  <span className="font-medium">{revokeTarget.ip ?? "unknown IP"}</span> will be
                  signed out immediately.
                </>
              ) : (
                "This device will be signed out."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRevoke}
              disabled={revoking}
              className="gap-1.5 bg-red-600 hover:bg-red-700"
            >
              {revoking && <Loader2 className="h-4 w-4 animate-spin" />}
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
