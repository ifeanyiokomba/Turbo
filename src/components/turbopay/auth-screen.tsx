"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Logo, Wordmark } from "./logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Mail, Lock, User, Phone, AtSign, Eye, EyeOff, ArrowRight, Check, Zap } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "./store";

const COUNTRIES = [
  { code: "NG", name: "Nigeria", dial: "+234", flag: "🇳🇬" },
  { code: "GH", name: "Ghana", dial: "+233", flag: "🇬🇭" },
  { code: "KE", name: "Kenya", dial: "+254", flag: "🇰🇪" },
  { code: "ZA", name: "South Africa", dial: "+27", flag: "🇿🇦" },
  { code: "GB", name: "United Kingdom", dial: "+44", flag: "🇬🇧" },
  { code: "US", name: "United States", dial: "+1", flag: "🇺🇸" },
];

export function AuthScreen({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const { setUser } = useApp();
  const [tab, setTab] = React.useState<"login" | "register">("login");
  const [loading, setLoading] = React.useState(false);

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
          firstName, lastName, username, email, phone, country, password: regPassword, referral,
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
      <div className="relative hidden flex-col justify-between overflow-hidden tp-wallet-card p-12 text-white lg:flex">
        <div className="tp-grain absolute inset-0 opacity-40" />
        <div className="relative flex items-center gap-2">
          <Logo size={36} />
          <Wordmark size={22} />
        </div>
        <div className="relative">
          <h2 className="text-4xl font-bold leading-tight">The fast lane to your money.</h2>
          <p className="mt-4 max-w-sm text-white/80">
            Send, save, spend and invest — all from one beautiful wallet built for Nigeria and beyond.
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
        <p className="relative text-xs text-white/60">© {new Date().getFullYear()} Turbopay · Licensed partners · NDPR-aware</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <button onClick={onBack} className="mb-6 flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowRight className="h-4 w-4 rotate-180" /> Back to home
          </button>
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <Logo size={32} />
            <Wordmark size={20} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome to Turbopay</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in or create your free account in seconds.</p>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "register")} className="mt-6">
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
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
                    <button type="button" className="text-xs text-primary hover:underline" onClick={() => toast.info("Password reset coming soon")}>
                      Forgot?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="pwd"
                      type={showPwd ? "text" : "password"}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-9 pr-9"
                      autoComplete="current-password"
                    />
                    <button type="button" onClick={() => setShowPwd((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full gap-1.5" disabled={loading}>
                  {loading ? "Signing in..." : <>Sign in <ArrowRight className="h-4 w-4" /></>}
                </Button>
              </form>
            </TabsContent>

            {/* Register */}
            <TabsContent value="register" className="mt-5">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="fn">First name</Label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="pl-9" placeholder="Adaeze" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ln">Last name</Label>
                    <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Okafor" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="un">Username</Label>
                  <div className="relative">
                    <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="un" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, "").toLowerCase())} className="pl-9" placeholder="adaeze" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="em">Email <span className="text-muted-foreground">(optional)</span></Label>
                    <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ph">Phone <span className="text-muted-foreground">(optional)</span></Label>
                    <div className="flex gap-1.5">
                      <span className="flex items-center rounded-md border bg-muted px-2.5 text-sm tabular-nums">{selectedCountry.dial}</span>
                      <div className="relative flex-1">
                        <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input id="ph" value={phone} onChange={(e) => setPhone(e.target.value)} className="pl-9" placeholder="801 234 5678" />
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
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.flag} {c.name} ({c.dial})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rp">Password</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="rp"
                      type={showRegPwd ? "text" : "password"}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="pl-9 pr-9"
                      placeholder="Create a strong password"
                    />
                    <button type="button" onClick={() => setShowRegPwd((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showRegPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {regPassword && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {pwdChecks.map((c) => (
                        <span key={c.label} className={`flex items-center gap-1 text-[11px] ${c.ok ? "text-primary" : "text-muted-foreground"}`}>
                          <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full ${c.ok ? "bg-primary/20" : "bg-muted"}`}>
                            {c.ok && <Check className="h-2.5 w-2.5" />}
                          </span>
                          {c.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ref">Referral code <span className="text-muted-foreground">(optional)</span></Label>
                  <Input id="ref" value={referral} onChange={(e) => setReferral(e.target.value)} placeholder="TURBOA1B2" />
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={terms} onCheckedChange={(v) => setTerms(v === true)} className="mt-0.5" />
                  <span className="text-muted-foreground">
                    I agree to the <span className="text-primary hover:underline">Terms</span> and <span className="text-primary hover:underline">Privacy Policy</span>.
                  </span>
                </label>
                <Button type="submit" className="w-full gap-1.5" disabled={loading}>
                  {loading ? "Creating account..." : <>Create wallet <Zap className="h-4 w-4" /></>}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="mt-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <Button
            variant="outline"
            className="mt-4 w-full"
            onClick={() => toast.info("Google sign-in coming soon")}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"/></svg>
            Continue with Google
          </Button>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Demo admin: <span className="font-mono text-foreground">admin@turbopay.ng</span> / <span className="font-mono text-foreground">Admin@1234</span>
          </p>
        </div>
      </div>
    </div>
  );
}
