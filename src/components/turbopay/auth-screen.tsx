"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Logo, Wordmark } from "./logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Mail,
  Lock,
  User,
  Phone,
  AtSign,
  Eye,
  EyeOff,
  ArrowRight,
  Check,
  Zap,
  Fingerprint,
  KeyRound,
  ShieldCheck,
  RotateCcw,
  ArrowLeft,
  Store,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "./store";
import { startAuthentication } from "@simplewebauthn/browser";
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
import { Progress } from "@/components/ui/progress";

const COUNTRIES = [
  { code: "NG", name: "Nigeria", dial: "+234", flag: "🇳🇬" },
  { code: "GH", name: "Ghana", dial: "+233", flag: "🇬🇭" },
  { code: "KE", name: "Kenya", dial: "+254", flag: "🇰🇪" },
  { code: "ZA", name: "South Africa", dial: "+27", flag: "🇿🇦" },
  { code: "GB", name: "United Kingdom", dial: "+44", flag: "🇬🇧" },
  { code: "US", name: "United States", dial: "+1", flag: "🇺🇸" },
];

export function AuthScreen({
  onBack,
  onShowBusiness,
  onShowAdmin,
}: {
  onBack: () => void;
  onShowBusiness?: () => void;
  onShowAdmin?: () => void;
}) {
  const router = useRouter();
  const { setUser } = useApp();
  const [tab, setTab] = React.useState<"login" | "register">("login");
  const [loading, setLoading] = React.useState(false);
  const [passkeyLoading, setPasskeyLoading] = React.useState(false);
  const [webAuthnSupported, setWebAuthnSupported] = React.useState(false);

  // Detect WebAuthn support on the client (avoid SSR window access)
  React.useEffect(() => {
    setWebAuthnSupported(
      typeof window !== "undefined" &&
        typeof window.PublicKeyCredential !== "undefined" &&
        typeof navigator !== "undefined"
    );
  }, []);

  // login fields
  const [identifier, setIdentifier] = React.useState("");
  const [loginPassword, setLoginPassword] = React.useState("");
  const [showPwd, setShowPwd] = React.useState(false);

  // register fields
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [country, setCountry] = React.useState("NG");
  const [regPassword, setRegPassword] = React.useState("");
  const [referral, setReferral] = React.useState("");
  const [terms, setTerms] = React.useState(false);
  const [showRegPwd, setShowRegPwd] = React.useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !loginPassword) {
      toast.error("Enter your email/phone/username and password");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      setUser(data.user);
      toast.success(`Welcome back, ${data.user.fullName.split(" ")[0]}!`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return toast.error("Enter your full name");
    if (!username.trim()) return toast.error("Choose a username");
    if (!email.trim() && !phone.trim()) return toast.error("Provide an email or phone");
    if (!terms) return toast.error("Please accept the terms to continue");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          username,
          email,
          phone,
          country,
          password: regPassword,
          referral,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");
      setUser(data.user);
      toast.success("Account created! Welcome to Turbopay.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasskeyLogin() {
    setPasskeyLoading(true);
    try {
      // Optional: send identifier if present, to scope allowed credentials
      const username = identifier.trim() || undefined;

      const optsRes = await fetch("/api/auth/passkey/authenticate/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const optsBody = await optsRes.json().catch(() => null);
      if (!optsRes.ok || !optsBody?.options) {
        throw new Error(optsBody?.error ?? "Could not start passkey login");
      }

      // If the user gave us an identifier and that account has no passkey,
      // the server returns an empty allowed list — surface that as an error.
      if (username && optsRes.status === 404) {
        throw new Error(optsBody?.error ?? "No passkey registered for this account");
      }

      let credential;
      try {
        credential = await startAuthentication({ optionsJSON: optsBody.options });
      } catch (err: any) {
        if (err?.name === "NotAllowedError") {
          toast.info("Passkey prompt was cancelled");
          return;
        }
        throw err;
      }

      const verifyRes = await fetch("/api/auth/passkey/authenticate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential,
          challengeToken: optsBody.challengeToken,
          username,
        }),
      });
      const verifyBody = await verifyRes.json().catch(() => null);
      if (!verifyRes.ok) {
        throw new Error(verifyBody?.error ?? "Passkey verification failed");
      }
      setUser(verifyBody.user);
      toast.success(`Welcome back, ${verifyBody.user.fullName.split(" ")[0]}!`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Passkey sign-in failed");
    } finally {
      setPasskeyLoading(false);
    }
  }

  // forgot-password dialog state
  const [forgotOpen, setForgotOpen] = React.useState(false);
  const [forgotStep, setForgotStep] = React.useState<1 | 2>(1);
  const [forgotIdentifier, setForgotIdentifier] = React.useState("");
  const [forgotLoading, setForgotLoading] = React.useState(false);
  const [resetCode, setResetCode] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [showNewPwd, setShowNewPwd] = React.useState(false);
  const [resendCooldown, setResendCooldown] = React.useState(0);

  // Cooldown ticker for "Resend code"
  React.useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  function openForgot() {
    setForgotIdentifier(identifier.trim());
    setForgotStep(1);
    setResetCode("");
    setNewPassword("");
    setShowNewPwd(false);
    setForgotOpen(true);
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotIdentifier.trim()) {
      toast.error("Enter your email, phone or username");
      return;
    }
    setForgotLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: forgotIdentifier.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not send reset code");
      // Always returns success — even if account doesn't exist (security).
      setForgotStep(2);
      setResendCooldown(60);
      const channelLabel =
        data.channel === "sms" ? "SMS" : data.channel === "email" ? "email" : "console";
      if (data.to && data.to !== "console") {
        toast.success(`Reset code sent to ${data.to} via ${channelLabel}`);
      } else {
        toast.success("Reset code sent — check your email / phone");
      }
      if (data.channel === "console" && process.env.NODE_ENV !== "production") {
        toast.info("Dev mode — code printed to server console");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reset code");
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(resetCode)) {
      toast.error("Enter the 6-digit code from your email / SMS");
      return;
    }
    const pwdError = validateClientPassword(newPassword);
    if (pwdError) {
      toast.error(pwdError);
      return;
    }
    setForgotLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: forgotIdentifier.trim(),
          code: resetCode,
          newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Password reset failed");
      toast.success("Password reset! You can now sign in with your new password.");
      setForgotOpen(false);
      // Pre-fill the login form so the user can immediately sign in.
      setIdentifier(forgotIdentifier.trim());
      setLoginPassword("");
      setTab("login");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Password reset failed");
    } finally {
      setForgotLoading(false);
    }
  }

  function validateClientPassword(p: string): string | null {
    if (p.length < 8) return "Password must be at least 8 characters";
    if (!/[A-Z]/.test(p)) return "Password must contain an uppercase letter";
    if (!/[a-z]/.test(p)) return "Password must contain a lowercase letter";
    if (!/\d/.test(p)) return "Password must contain a digit";
    return null;
  }

  const newPwdChecks = [
    { ok: newPassword.length >= 8, label: "8+ characters" },
    { ok: /[A-Z]/.test(newPassword), label: "Uppercase" },
    { ok: /[a-z]/.test(newPassword), label: "Lowercase" },
    { ok: /\d/.test(newPassword), label: "Digit" },
  ];
  const newPwdScore = newPwdChecks.filter((c) => c.ok).length;
  const newPwdStrengthPct = (newPwdScore / newPwdChecks.length) * 100;
  const newPwdStrengthLabel =
    newPwdScore <= 1 ? "Weak" : newPwdScore === 2 ? "Fair" : newPwdScore === 3 ? "Good" : "Strong";
  const newPwdStrengthColor =
    newPwdScore <= 1
      ? "text-red-500"
      : newPwdScore === 2
        ? "text-amber-500"
        : newPwdScore === 3
          ? "text-emerald-500"
          : "text-emerald-600";

  const pwdChecks = [
    { ok: regPassword.length >= 8, label: "8+ characters" },
    { ok: /[A-Z]/.test(regPassword), label: "Uppercase" },
    { ok: /[a-z]/.test(regPassword), label: "Lowercase" },
    { ok: /\d/.test(regPassword), label: "Digit" },
  ];
  const selectedCountry = COUNTRIES.find((c) => c.code === country)!;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="tp-wallet-card relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <div className="tp-grain absolute inset-0 opacity-40" />
        <div className="relative flex items-center gap-2">
          <Logo size={36} />
          <Wordmark size={22} />
        </div>
        <div className="relative">
          <h2 className="text-4xl leading-tight font-bold">The fast lane to your money.</h2>
          <p className="mt-4 max-w-sm text-white/80">
            Send, save, spend and invest — all from one beautiful wallet built for Nigeria and
            beyond.
          </p>
          <ul className="mt-8 space-y-3">
            {[
              "Instant wallet funding via virtual account",
              "Free transfers to other Turbopay users",
              "Virtual Visa cards in seconds",
              "Save and earn up to 18% p.a.",
            ].map((t) => (
              <li key={t} className="flex items-center gap-3 text-sm">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                  <Check className="h-3.5 w-3.5" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/60">
          © {new Date().getFullYear()} Turbopay · Licensed partners · NDPR-aware
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <button
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground mb-6 flex items-center gap-2 text-sm transition-colors"
          >
            <ArrowRight className="h-4 w-4 rotate-180" /> Back to home
          </button>
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <Logo size={32} />
            <Wordmark size={20} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome to Turbopay</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Sign in or create your free account in seconds.
          </p>

          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as "login" | "register")}
            className="mt-6"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign in</TabsTrigger>
              <TabsTrigger value="register">Create account</TabsTrigger>
            </TabsList>

            {/* Login */}
            <TabsContent value="login" className="mt-5">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="identifier">Email, phone or username</Label>
                  <div className="relative">
                    <Mail className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                      id="identifier"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="you@example.com"
                      className="pl-9"
                      autoComplete="username"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="pwd">Password</Label>
                    <button
                      type="button"
                      className="text-primary text-xs hover:underline"
                      onClick={openForgot}
                    >
                      Forgot?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                      id="pwd"
                      type={showPwd ? "text" : "password"}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pr-9 pl-9"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full gap-1.5" disabled={loading}>
                  {loading ? (
                    "Signing in..."
                  ) : (
                    <>
                      Sign in <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>

                {webAuthnSupported && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-1.5"
                    onClick={handlePasskeyLogin}
                    disabled={passkeyLoading}
                  >
                    {passkeyLoading ? (
                      <>Verifying…</>
                    ) : (
                      <>
                        <Fingerprint className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        Sign in with Passkey
                      </>
                    )}
                  </Button>
                )}
              </form>
            </TabsContent>

            {/* Register */}
            <TabsContent value="register" className="mt-5">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="fn">First name</Label>
                    <div className="relative">
                      <User className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                      <Input
                        id="fn"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="pl-9"
                        placeholder="Adaeze"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ln">Last name</Label>
                    <Input
                      id="ln"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Okafor"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="un">Username</Label>
                  <div className="relative">
                    <AtSign className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                      id="un"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/\s/g, "").toLowerCase())}
                      className="pl-9"
                      placeholder="adaeze"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="em">
                      Email <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="em"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ph">
                      Phone <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <div className="flex gap-1.5">
                      <span className="bg-muted flex items-center rounded-md border px-2.5 text-sm tabular-nums">
                        {selectedCountry.dial}
                      </span>
                      <div className="relative flex-1">
                        <Phone className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                        <Input
                          id="ph"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="pl-9"
                          placeholder="801 234 5678"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <select
                    id="country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="border-input ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border bg-transparent px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.name} ({c.dial})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rp">Password</Label>
                  <div className="relative">
                    <Lock className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                      id="rp"
                      type={showRegPwd ? "text" : "password"}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="pr-9 pl-9"
                      placeholder="Create a strong password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPwd((v) => !v)}
                      className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
                    >
                      {showRegPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {regPassword && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {pwdChecks.map((c) => (
                        <span
                          key={c.label}
                          className={`flex items-center gap-1 text-[11px] ${c.ok ? "text-primary" : "text-muted-foreground"}`}
                        >
                          <span
                            className={`flex h-3.5 w-3.5 items-center justify-center rounded-full ${c.ok ? "bg-primary/20" : "bg-muted"}`}
                          >
                            {c.ok && <Check className="h-2.5 w-2.5" />}
                          </span>
                          {c.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ref">
                    Referral code <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="ref"
                    value={referral}
                    onChange={(e) => setReferral(e.target.value)}
                    placeholder="TURBOA1B2"
                  />
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={terms}
                    onCheckedChange={(v) => setTerms(v === true)}
                    className="mt-0.5"
                  />
                  <span className="text-muted-foreground">
                    I agree to the <span className="text-primary hover:underline">Terms</span> and{" "}
                    <span className="text-primary hover:underline">Privacy Policy</span>.
                  </span>
                </label>
                <Button type="submit" className="w-full gap-1.5" disabled={loading}>
                  {loading ? (
                    "Creating account..."
                  ) : (
                    <>
                      Create wallet <Zap className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="mt-6 flex items-center gap-3">
            <div className="bg-border h-px flex-1" />
            <span className="text-muted-foreground text-xs">or</span>
            <div className="bg-border h-px flex-1" />
          </div>
          <Button
            variant="outline"
            className="mt-4 w-full"
            onClick={() => {
              // Initiate the Google OAuth flow — server sets a state cookie
              // and redirects to Google's consent screen.
              window.location.href = "/api/auth/google";
            }}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"
              />
            </svg>
            Continue with Google
          </Button>

          <p className="text-muted-foreground mt-6 text-center text-xs">
            Demo admin: <span className="text-foreground font-mono">admin@turbopay.ng</span> /{" "}
            <span className="text-foreground font-mono">Admin@1234</span>
          </p>

          {(onShowBusiness || onShowAdmin) && (
            <div className="text-muted-foreground mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
              {onShowBusiness && (
                <button
                  type="button"
                  onClick={onShowBusiness}
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
                >
                  <Store className="h-3 w-3" /> Sign in as Business
                </button>
              )}
              {onShowAdmin && (
                <button
                  type="button"
                  onClick={onShowAdmin}
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
                >
                  <ShieldAlert className="h-3 w-3" /> Admin Console
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Forgot-password dialog */}
      <Dialog open={forgotOpen} onOpenChange={(v) => setForgotOpen(v)}>
        <DialogContent className="max-w-md overflow-hidden p-0">
          {/* Emerald+amber brand header */}
          <div className="tp-wallet-card relative overflow-hidden p-6 text-white">
            <div className="tp-grain absolute inset-0 opacity-40" />
            <div className="relative flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
                <KeyRound className="h-4 w-4" />
              </span>
              <div>
                <DialogTitle className="text-base leading-tight font-semibold">
                  {forgotStep === 1 ? "Reset your password" : "Verify it's you"}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/80">
                  {forgotStep === 1
                    ? "We'll send a 6-digit code to your email or phone."
                    : "Enter the code we sent + your new password."}
                </DialogDescription>
              </div>
            </div>
            {/* Step indicator */}
            <div className="relative mt-4 flex items-center gap-2">
              <div
                className={`h-1.5 flex-1 rounded-full ${forgotStep >= 1 ? "bg-amber-300" : "bg-white/30"}`}
              />
              <div
                className={`h-1.5 flex-1 rounded-full ${forgotStep >= 2 ? "bg-amber-300" : "bg-white/30"}`}
              />
            </div>
            <p className="relative mt-2 text-[11px] text-white/70">Step {forgotStep} of 2</p>
          </div>

          <div className="p-6">
            {forgotStep === 1 ? (
              <form onSubmit={handleSendCode} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgot-identifier">Email, phone or username</Label>
                  <div className="relative">
                    <Mail className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                      id="forgot-identifier"
                      value={forgotIdentifier}
                      onChange={(e) => setForgotIdentifier(e.target.value)}
                      placeholder="you@example.com"
                      className="pl-9"
                      autoFocus
                      autoComplete="username"
                    />
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    If an account exists, we'll send a one-time code that expires in 10 minutes.
                  </p>
                </div>
                <Button type="submit" className="w-full gap-1.5" disabled={forgotLoading}>
                  {forgotLoading ? (
                    "Sending code..."
                  ) : (
                    <>
                      Send reset code <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
                <button
                  type="button"
                  onClick={() => setForgotOpen(false)}
                  className="text-muted-foreground hover:text-foreground flex w-full items-center justify-center gap-1.5 text-xs transition-colors"
                >
                  <ArrowLeft className="h-3 w-3" /> Back to sign in
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-code">6-digit code</Label>
                  <div className="flex justify-center py-1">
                    <InputOTP
                      id="reset-code"
                      maxLength={6}
                      value={resetCode}
                      onChange={(v) => setResetCode(v)}
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
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-[11px]">Code expires in 10 minutes.</p>
                    {resendCooldown > 0 ? (
                      <span className="text-muted-foreground text-[11px]">
                        Resend in {resendCooldown}s
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSendCode}
                        disabled={forgotLoading}
                        className="text-primary text-[11px] hover:underline disabled:opacity-50"
                      >
                        Resend code
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-pwd">New password</Label>
                  <div className="relative">
                    <Lock className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                      id="new-pwd"
                      type={showNewPwd ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Create a strong password"
                      className="pr-9 pl-9"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPwd((v) => !v)}
                      className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
                    >
                      {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {newPassword && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center gap-2">
                        <Progress value={newPwdStrengthPct} className="h-1.5 flex-1" />
                        <span className={`text-[11px] font-medium ${newPwdStrengthColor}`}>
                          {newPwdStrengthLabel}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {newPwdChecks.map((c) => (
                          <span
                            key={c.label}
                            className={`flex items-center gap-1 text-[11px] ${
                              c.ok ? "text-primary" : "text-muted-foreground"
                            }`}
                          >
                            <span
                              className={`flex h-3.5 w-3.5 items-center justify-center rounded-full ${
                                c.ok ? "bg-primary/20" : "bg-muted"
                              }`}
                            >
                              {c.ok && <Check className="h-2.5 w-2.5" />}
                            </span>
                            {c.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <Button type="submit" className="w-full gap-1.5" disabled={forgotLoading}>
                  {forgotLoading ? (
                    "Resetting..."
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" /> Reset password
                    </>
                  )}
                </Button>
                <button
                  type="button"
                  onClick={() => setForgotStep(1)}
                  className="text-muted-foreground hover:text-foreground flex w-full items-center justify-center gap-1.5 text-xs transition-colors"
                >
                  <RotateCcw className="h-3 w-3" /> Use a different identifier
                </button>
              </form>
            )}
          </div>
          <DialogFooter className="px-6 pt-0 pb-4 sm:justify-center">
            <p className="text-muted-foreground text-center text-[11px]">
              For your security, all active sessions will be signed out after reset.
            </p>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
