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
