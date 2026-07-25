"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useApp, type AppUser } from "../store";
import { PageHeader } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Switch } from "@/components/ui/switch";
import {
  User as UserIcon,
  Mail,
  Phone,
  Lock,
  KeyRound,
  Sun,
  Moon,
  Monitor,
  LogOut,
  Loader2,
  Save,
  Check,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
  AtSign,
  Bell,
  MessageCircle,
  Smartphone,
  Send,
  Megaphone,
  ShieldAlert,
  CalendarClock,
  Download,
  Trash2,
  FileJson,
  AlertTriangle,
  Database,
} from "lucide-react";
import { toast } from "sonner";

interface ProfileData {
  user: {
    id: string;
    fullName: string;
    username: string;
    email: string | null;
    phone: string | null;
    bio: string | null;
    avatarUrl: string | null;
    hasPin: boolean;
  };
}

interface CommPrefs {
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  whatsappEnabled: boolean;
  transactionAlerts: boolean;
  securityAlerts: boolean;
  marketingAlerts: boolean;
  weeklySummary: boolean;
  updatedAt: string;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "U";
}

export default function SettingsView() {
  const router = useRouter();
  const { user, setUser, logoutClient } = useApp();
  const { theme, setTheme } = useTheme();

  const [profile, setProfile] = React.useState<ProfileData["user"] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [savingProfile, setSavingProfile] = React.useState(false);

  // form state
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [bio, setBio] = React.useState("");

  // pin dialog
  const [pinOpen, setPinOpen] = React.useState<"set" | "change" | null>(null);
  const [pinNew, setPinNew] = React.useState("");
  const [pinOld, setPinOld] = React.useState("");
  const [pinConfirm, setPinConfirm] = React.useState("");
  const [savingPin, setSavingPin] = React.useState(false);

  // password dialog
  const [pwdOpen, setPwdOpen] = React.useState(false);
  const [pwdOld, setPwdOld] = React.useState("");
  const [pwdNew, setPwdNew] = React.useState("");
  const [pwdConfirm, setPwdConfirm] = React.useState("");
  const [showPwdOld, setShowPwdOld] = React.useState(false);
  const [showPwdNew, setShowPwdNew] = React.useState(false);
  const [savingPwd, setSavingPwd] = React.useState(false);

  const [signingOut, setSigningOut] = React.useState(false);

  // Data & Privacy: NDPR export + account deletion
  const [exporting, setExporting] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteStep, setDeleteStep] = React.useState<1 | 2 | 3>(1);
  const [deletePwd, setDeletePwd] = React.useState("");
  const [deleteConfirm, setDeleteConfirm] = React.useState("");
  const [showDeletePwd, setShowDeletePwd] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  // Communication preferences
  const [commPrefs, setCommPrefs] = React.useState<CommPrefs | null>(null);
  const [loadingPrefs, setLoadingPrefs] = React.useState(false);
  const [savingPrefs, setSavingPrefs] = React.useState(false);
  const [prefsDirty, setPrefsDirty] = React.useState(false);

  const loadPrefs = React.useCallback(async () => {
    setLoadingPrefs(true);
    try {
      const res = await fetch("/api/settings/preferences", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setCommPrefs(data.preferences);
      setPrefsDirty(false);
    } catch {
    } finally {
      setLoadingPrefs(false);
    }
  }, []);

  React.useEffect(() => {
    loadPrefs();
  }, [loadPrefs]);

  function togglePref<K extends keyof CommPrefs>(key: K, value: boolean) {
    setCommPrefs((prev) => (prev ? { ...prev, [key]: value } : prev));
    setPrefsDirty(true);
  }

  async function savePrefs() {
    if (!commPrefs) return;
    setSavingPrefs(true);
    try {
      const res = await fetch("/api/settings/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailEnabled: commPrefs.emailEnabled,
          smsEnabled: commPrefs.smsEnabled,
          pushEnabled: commPrefs.pushEnabled,
          whatsappEnabled: commPrefs.whatsappEnabled,
          transactionAlerts: commPrefs.transactionAlerts,
          securityAlerts: commPrefs.securityAlerts,
          marketingAlerts: commPrefs.marketingAlerts,
          weeklySummary: commPrefs.weeklySummary,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save preferences");
        return;
      }
      setCommPrefs(data.preferences);
      setPrefsDirty(false);
      toast.success("Communication preferences saved");
    } catch {
      toast.error("Network error");
    } finally {
      setSavingPrefs(false);
    }
  }

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (res.status === 401) {
        toast.error("Session expired. Please log in again.");
        return;
      }
      if (!res.ok) {
        toast.error("Failed to load settings.");
        return;
      }
      const data: ProfileData = await res.json();
      setProfile(data.user);
      setFullName(data.user.fullName ?? "");
      setEmail(data.user.email ?? "");
      setPhone(data.user.phone ?? "");
      setBio(data.user.bio ?? "");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  function syncStore(u: Partial<AppUser>) {
    if (!user) return;
    setUser({ ...user, ...u });
  }

  async function saveProfile() {
    if (!fullName.trim() || fullName.trim().length < 2) {
      toast.error("Full name must be at least 2 characters");
      return;
    }
    setSavingProfile(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          bio: bio.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to update profile");
        return;
      }
      setProfile(data.user);
      syncStore({
        fullName: data.user.fullName,
        email: data.user.email,
        phone: data.user.phone,
        avatarUrl: data.user.avatarUrl,
      });
      toast.success("Profile updated");
    } catch {
      toast.error("Network error");
    } finally {
      setSavingProfile(false);
    }
  }

  async function submitPin() {
    if (pinNew.length !== 4 || !/^\d{4}$/.test(pinNew)) {
      toast.error("PIN must be 4 digits");
      return;
    }
    if (pinOpen === "set") {
      if (pinNew !== pinConfirm) {
        toast.error("PINs do not match");
        return;
      }
    } else {
      if (pinOld.length !== 4 || !/^\d{4}$/.test(pinOld)) {
        toast.error("Enter your current 4-digit PIN");
        return;
      }
      if (pinNew !== pinConfirm) {
        toast.error("New PINs do not match");
        return;
      }
      if (pinOld === pinNew) {
        toast.error("New PIN must be different from old PIN");
        return;
      }
    }
    setSavingPin(true);
    try {
      const url = "/api/settings/pin";
      const method = pinOpen === "set" ? "POST" : "PUT";
      const body =
        pinOpen === "set"
          ? { pin: pinNew }
          : { oldPin: pinOld, newPin: pinNew };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save PIN");
        return;
      }
      toast.success(pinOpen === "set" ? "PIN set successfully" : "PIN changed");
      setPinOpen(null);
      setPinNew("");
      setPinOld("");
      setPinConfirm("");
      if (data.user) {
        setProfile(data.user);
        syncStore({ hasPin: data.user.hasPin });
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSavingPin(false);
    }
  }

  async function submitPassword() {
    if (!pwdOld || !pwdNew) {
      toast.error("Fill in all fields");
      return;
    }
    if (pwdNew !== pwdConfirm) {
      toast.error("New passwords do not match");
      return;
    }
    if (pwdOld === pwdNew) {
      toast.error("New password must be different");
      return;
    }
    if (pwdNew.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (!/[A-Z]/.test(pwdNew) || !/[a-z]/.test(pwdNew) || !/\d/.test(pwdNew)) {
      toast.error("Password needs uppercase, lowercase, and a digit");
      return;
    }
    setSavingPwd(true);
    try {
      const res = await fetch("/api/settings/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ old: pwdOld, new: pwdNew }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to change password");
        return;
      }
      toast.success("Password changed");
      setPwdOpen(false);
      setPwdOld("");
      setPwdNew("");
      setPwdConfirm("");
    } catch {
      toast.error("Network error");
    } finally {
      setSavingPwd(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
    }
    logoutClient();
    toast.success("Signed out");
    router.refresh();
  }

  // ===== NDPR data export =====
  async function handleExportData() {
    setExporting(true);
    try {
      const res = await fetch("/api/settings/export-data", { cache: "no-store" });
      if (res.status === 401) {
        toast.error("Session expired. Please log in again.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Failed to export data");
        return;
      }
      const blob = await res.blob();
      // Filename from Content-Disposition if present.
      const cd = res.headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] ?? `turbopay-data-export-${Date.now()}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Your data export is downloading");
    } catch {
      toast.error("Network error");
    } finally {
      setExporting(false);
    }
  }

  // ===== Account deletion (right-to-erasure) =====
  function openDeleteDialog() {
    setDeleteStep(1);
    setDeletePwd("");
    setDeleteConfirm("");
    setShowDeletePwd(false);
    setDeleteOpen(true);
  }

  async function handleDeleteAccount() {
    if (deletePwd.length < 1) {
      toast.error("Enter your password");
      return;
    }
    if (deleteConfirm.trim() !== "DELETE MY ACCOUNT") {
      toast.error('Type "DELETE MY ACCOUNT" exactly');
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/settings/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: deletePwd,
          confirmText: deleteConfirm.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Failed to delete account");
        return;
      }
      toast.success("Account deleted", {
        description: "Your personal data has been anonymized.",
      });
      setDeleteOpen(false);
      // Server already destroyed the session; clear local state.
      logoutClient();
      // Hard navigate to landing (forces auth gate to re-render).
      window.location.href = "/";
    } catch {
      toast.error("Network error");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Settings" subtitle="Manage your profile, security, and preferences" />
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-5">
            <Skeleton className="h-72 rounded-2xl" />
            <Skeleton className="h-56 rounded-2xl" />
          </div>
          <div className="space-y-5">
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-44 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  const themeOptions = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ] as const;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        subtitle="Manage your profile, security, and preferences"
        actions={
          <Button onClick={saveProfile} disabled={savingProfile} className="gap-1.5">
            {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save profile
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left col: profile form */}
        <div className="space-y-5 lg:col-span-2">
          {/* Profile */}
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <UserIcon className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Profile</h2>
            </div>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="flex flex-col items-center gap-2">
                <Avatar className="h-20 w-20 ring-2 ring-primary/20">
                  {profile?.avatarUrl && <AvatarImage src={profile.avatarUrl} alt={profile.fullName} />}
                  <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
                    {initials(profile?.fullName ?? user?.fullName ?? "")}
                  </AvatarFallback>
                </Avatar>
                {profile?.emailVerified ? (
                  <Badge variant="secondary" className="gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3 w-3" /> Verified
                  </Badge>
                ) : (
                  <Badge variant="outline">Unverified email</Badge>
                )}
              </div>
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="username">Username</Label>
                  <div className="relative">
                    <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="username"
                      value={profile?.username ?? ""}
                      readOnly
                      disabled
                      className="bg-muted/40 pl-9 text-muted-foreground"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" className="pl-9" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234 800 000 0000" className="pl-9" />
                  </div>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea
                    id="bio"
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell us a little about yourself (max 280 characters)"
                    maxLength={280}
                  />
                  <p className="text-right text-xs text-muted-foreground">{bio.length}/280</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Appearance */}
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Appearance</h2>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">Choose how Turbopay looks to you.</p>
            <div className="grid grid-cols-3 gap-2">
              {themeOptions.map((opt) => {
                const active = (theme ?? "system") === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors ${
                      active ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted/60"
                    }`}
                  >
                    <opt.icon className="h-5 w-5" />
                    <span className="text-xs font-medium">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Communication preferences */}
          <Card className="p-5 sm:p-6">
            <div className="mb-1 flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Communication preferences</h2>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Choose how and when you want to hear from us.
            </p>

            {loadingPrefs ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 rounded-lg" />
                ))}
              </div>
            ) : commPrefs ? (
              <>
                {/* Channels */}
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Channels
                </p>
                <div className="mb-4 space-y-1">
                  <PrefRow
                    icon={Mail}
                    label="Email"
                    description="Receipts, statements and important account emails."
                    checked={commPrefs.emailEnabled}
                    onChange={(v) => togglePref("emailEnabled", v)}
                  />
                  <PrefRow
                    icon={Smartphone}
                    label="SMS"
                    description="One-time passwords and critical security alerts."
                    checked={commPrefs.smsEnabled}
                    onChange={(v) => togglePref("smsEnabled", v)}
                  />
                  <PrefRow
                    icon={Bell}
                    label="Push notifications"
                    description="Real-time alerts in the Turbopay app."
                    checked={commPrefs.pushEnabled}
                    onChange={(v) => togglePref("pushEnabled", v)}
                  />
                  <PrefRow
                    icon={MessageCircle}
                    label="WhatsApp"
                    description="Notifications via WhatsApp (where supported)."
                    checked={commPrefs.whatsappEnabled}
                    onChange={(v) => togglePref("whatsappEnabled", v)}
                  />
                </div>

                {/* Categories */}
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Categories
                </p>
                <div className="space-y-1">
                  <PrefRow
                    icon={Send}
                    label="Transaction alerts"
                    description="Money in, money out, and large transactions."
                    checked={commPrefs.transactionAlerts}
                    onChange={(v) => togglePref("transactionAlerts", v)}
                  />
                  <PrefRow
                    icon={ShieldAlert}
                    label="Security alerts"
                    description="New device logins, PIN changes, and suspicious activity."
                    checked={commPrefs.securityAlerts}
                    onChange={(v) => togglePref("securityAlerts", v)}
                  />
                  <PrefRow
                    icon={CalendarClock}
                    label="Weekly summary"
                    description="A digest of your spending and balances every Monday."
                    checked={commPrefs.weeklySummary}
                    onChange={(v) => togglePref("weeklySummary", v)}
                  />
                  <PrefRow
                    icon={Megaphone}
                    label="Marketing & offers"
                    description="Product updates, rewards, and promotions."
                    checked={commPrefs.marketingAlerts}
                    onChange={(v) => togglePref("marketingAlerts", v)}
                  />
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {prefsDirty ? "You have unsaved changes." : `Last updated ${new Date(commPrefs.updatedAt).toLocaleDateString("en-NG")}`}
                  </p>
                  <Button
                    size="sm"
                    onClick={savePrefs}
                    disabled={savingPrefs || !prefsDirty}
                    className="gap-1.5"
                  >
                    {savingPrefs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save preferences
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Could not load preferences.</p>
            )}
          </Card>
        </div>

        {/* Right col: security actions */}
        <div className="space-y-5">
          {/* Transaction PIN */}
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Transaction PIN</h2>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              {profile?.hasPin
                ? "Change your 4-digit PIN used to authorize transactions."
                : "Set a 4-digit PIN to authorize transactions."}
            </p>
            <Button
              variant={profile?.hasPin ? "outline" : "default"}
              className="w-full gap-1.5"
              onClick={() => {
                setPinNew("");
                setPinOld("");
                setPinConfirm("");
                setPinOpen(profile?.hasPin ? "change" : "set");
              }}
            >
              <KeyRound className="h-4 w-4" />
              {profile?.hasPin ? "Change PIN" : "Set PIN"}
            </Button>
            {profile?.hasPin && (
              <p className="mt-2 text-xs text-muted-foreground">
                <ShieldCheck className="mr-1 inline h-3 w-3" />
                PIN is active
              </p>
            )}
          </Card>

          {/* Password */}
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Password</h2>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              Use a strong password (8+ chars, mixed case, digit).
            </p>
            <Button
              variant="outline"
              className="w-full gap-1.5"
              onClick={() => {
                setPwdOld("");
                setPwdNew("");
                setPwdConfirm("");
                setPwdOpen(true);
              }}
            >
              <Lock className="h-4 w-4" /> Change password
            </Button>
          </Card>

          {/* Sign out */}
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <LogOut className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Session</h2>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              Sign out of Turbopay on this device.
            </p>
            <Button
              variant="outline"
              className="w-full gap-1.5 border-red-500/30 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Sign out
            </Button>
          </Card>
        </div>
      </div>

      {/* Data & Privacy (NDPR / GDPR) */}
      <Card className="p-5 sm:p-6 border-red-500/20">
        <div className="mb-4 flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Data &amp; Privacy</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Under the Nigeria Data Protection Regulation (NDPR) and GDPR, you have the right
          to access your data and to request erasure of your personal information.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Download my data */}
          <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <FileJson className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">Download my data</p>
                <p className="text-xs text-muted-foreground">
                  Export everything we hold about you as a JSON file. Credentials and full
                  card numbers are excluded; BVN/NIN are masked.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full gap-1.5 border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
              onClick={handleExportData}
              disabled={exporting}
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {exporting ? "Generating…" : "Download my data"}
            </Button>
          </div>

          {/* Delete account */}
          <div className="flex flex-col gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-red-700 dark:text-red-400">Delete account</p>
                <p className="text-xs text-muted-foreground">
                  Permanently anonymize your personal data. Transaction records are retained
                  for regulatory compliance.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full gap-1.5 border-red-500/40 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
              onClick={openDeleteDialog}
            >
              <Trash2 className="h-4 w-4" />
              Delete account
            </Button>
          </div>
        </div>
      </Card>

      {/* Delete account confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={(o) => !o && setDeleteOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Delete account
            </DialogTitle>
            <DialogDescription>
              This action is irreversible. Your personal data will be anonymized. Transaction
              records are retained for regulatory compliance.
            </DialogDescription>
          </DialogHeader>

          {/* Stepper */}
          <div className="mb-2 flex items-center justify-center gap-1.5">
            {[1, 2, 3].map((s) => (
              <span
                key={s}
                className={`h-1.5 w-8 rounded-full transition-colors ${
                  deleteStep >= s ? "bg-red-500" : "bg-muted"
                }`}
              />
            ))}
          </div>

          {deleteStep === 1 && (
            <div className="space-y-3 py-1">
              <div className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                Step 1 of 3 — confirm your password.
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deletePwd">Your password</Label>
                <div className="relative">
                  <Input
                    id="deletePwd"
                    type={showDeletePwd ? "text" : "password"}
                    value={deletePwd}
                    onChange={(e) => setDeletePwd(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeletePwd((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                  >
                    {showDeletePwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                  Cancel
                </Button>
                <Button
                  onClick={() => setDeleteStep(2)}
                  disabled={deletePwd.length < 1}
                  className="gap-1.5 bg-red-600 hover:bg-red-700"
                >
                  Continue
                </Button>
              </DialogFooter>
            </div>
          )}

          {deleteStep === 2 && (
            <div className="space-y-3 py-1">
              <div className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                Step 2 of 3 — type the confirmation phrase exactly.
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deleteConfirm">
                  Type <span className="font-mono font-semibold text-red-700 dark:text-red-400">DELETE MY ACCOUNT</span>
                </Label>
                <Input
                  id="deleteConfirm"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE MY ACCOUNT"
                  autoComplete="off"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteStep(1)} disabled={deleting}>
                  Back
                </Button>
                <Button
                  onClick={() => setDeleteStep(3)}
                  disabled={deleteConfirm.trim() !== "DELETE MY ACCOUNT"}
                  className="gap-1.5 bg-red-600 hover:bg-red-700"
                >
                  Continue
                </Button>
              </DialogFooter>
            </div>
          )}

          {deleteStep === 3 && (
            <div className="space-y-3 py-1">
              <div className="rounded-lg bg-red-500/10 p-3 text-xs text-red-800 dark:text-red-300">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                Step 3 of 3 — final confirmation. Once you click below, your account will be
                closed immediately and your personal data anonymized.
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                  Your name, email, phone, BVN, NIN, avatar and bio will be wiped.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                  All sessions will be revoked and your wallet frozen.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                  Transaction, ledger, and audit records are retained for AML/CBN compliance.
                </li>
              </ul>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteStep(2)} disabled={deleting}>
                  Back
                </Button>
                <Button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="gap-1.5 bg-red-600 hover:bg-red-700"
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete my account permanently
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* PIN dialog */}
      <Dialog open={pinOpen !== null} onOpenChange={(o) => !o && setPinOpen(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-center">
              {pinOpen === "set" ? "Set transaction PIN" : "Change transaction PIN"}
            </DialogTitle>
            <DialogDescription className="text-center">
              {pinOpen === "set"
                ? "Choose a 4-digit PIN to authorize transactions."
                : "Enter your current PIN, then choose a new one."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {pinOpen === "change" && (
              <div className="space-y-1.5">
                <Label className="text-center text-xs text-muted-foreground">Current PIN</Label>
                <InputOTP
                  maxLength={4}
                  value={pinOld}
                  onChange={(v) => setPinOld(v)}
                  containerClassName="justify-center"
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-center text-xs text-muted-foreground">
                {pinOpen === "set" ? "New PIN" : "New PIN"}
              </Label>
              <InputOTP
                maxLength={4}
                value={pinNew}
                onChange={(v) => setPinNew(v)}
                containerClassName="justify-center"
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <div className="space-y-1.5">
              <Label className="text-center text-xs text-muted-foreground">Confirm new PIN</Label>
              <InputOTP
                maxLength={4}
                value={pinConfirm}
                onChange={(v) => setPinConfirm(v)}
                containerClassName="justify-center"
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinOpen(null)} disabled={savingPin}>
              Cancel
            </Button>
            <Button onClick={submitPin} disabled={savingPin} className="gap-1.5">
              {savingPin && <Loader2 className="h-4 w-4 animate-spin" />}
              {pinOpen === "set" ? "Set PIN" : "Update PIN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password dialog */}
      <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>Use at least 8 characters with mixed case and a digit.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="pwdOld">Current password</Label>
              <div className="relative">
                <Input
                  id="pwdOld"
                  type={showPwdOld ? "text" : "password"}
                  value={pwdOld}
                  onChange={(e) => setPwdOld(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwdOld((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                >
                  {showPwdOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pwdNew">New password</Label>
              <div className="relative">
                <Input
                  id="pwdNew"
                  type={showPwdNew ? "text" : "password"}
                  value={pwdNew}
                  onChange={(e) => setPwdNew(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwdNew((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                >
                  {showPwdNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pwdConfirm">Confirm new password</Label>
              <Input
                id="pwdConfirm"
                type="password"
                value={pwdConfirm}
                onChange={(e) => setPwdConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwdOpen(false)} disabled={savingPwd}>
              Cancel
            </Button>
            <Button onClick={submitPassword} disabled={savingPwd} className="gap-1.5">
              {savingPwd && <Loader2 className="h-4 w-4 animate-spin" />}
              Change password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============== Communication preference row ==============

function PrefRow({
  icon: Icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      htmlFor={`pref-${label}`}
      className="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/40"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={`pref-${label}`}
        checked={checked}
        onCheckedChange={onChange}
      />
    </label>
  );
}
