"use client";

// Turbopay — Business login screen.
//
// Separate login flow for merchant / business accounts. Same email + password
// auth, but the server enforces that the user has a Merchant record (or is an
// admin). On success, the app shows the merchant-dashboard view by default.
//
// Visually: emerald + amber brand palette matching the regular AuthScreen, but
// with a "Business" headline + store icon to make the context crystal-clear.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Logo, Wordmark } from "../logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Store,
  Check,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../store";

export function BusinessLoginScreen({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const { setUser, setView } = useApp();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPwd, setShowPwd] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Enter your business email and password");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Business login failed");
      }
      setUser(data.user);
      setView("merchant-dashboard");
      toast.success(`Welcome, ${data.user.fullName.split(" ")[0]}! Business mode active.`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Business login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-slate-900 p-12 text-white lg:flex">
        <div className="tp-grain absolute inset-0 opacity-30" />
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background: "linear-gradient(135deg, #064e3b 0%, #047857 45%, #b45309 100%)",
          }}
        />
        <div className="relative flex items-center gap-2">
          <Logo size={36} />
          <Wordmark size={22} />
        </div>
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
            <Store className="h-3.5 w-3.5" /> For Businesses
          </span>
          <h2 className="mt-4 text-4xl leading-tight font-bold">
            Accept payments.
            <br />
            Scale your business.
          </h2>
          <p className="mt-4 max-w-sm text-white/80">
            One dashboard for payment links, API keys, settlements, and customer insights — built
            for African merchants.
          </p>
          <ul className="mt-8 space-y-3">
            {[
              "Generate payment links in seconds",
              "Programmatic API access with sandbox + live keys",
              "Real-time settlement + reconciliation reports",
              "Multi-currency + international collections",
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
          © {new Date().getFullYear()} Turbopay Business · Licensed partners · NDPR-aware
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6">
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
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Store className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Sign in as Business</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Access your merchant dashboard, API keys, and payment links.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="biz-email">Business email</Label>
              <div className="relative">
                <Mail className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="biz-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="merchant@business.com"
                  className="pl-9"
                  autoComplete="email"
                  autoFocus
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="biz-pwd">Password</Label>
              <div className="relative">
                <Lock className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="biz-pwd"
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
                "Signing in..."
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" /> Sign in to Business Dashboard{" "}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <div className="bg-muted/40 text-muted-foreground mt-6 rounded-xl border border-dashed p-4 text-xs">
            <p className="text-foreground font-medium">Don&apos;t have a business account yet?</p>
            <p className="mt-1">
              Business accounts are provisioned by the Turbopay team. Contact sales to enable
              merchant mode for your existing account.
            </p>
          </div>

          <p className="text-muted-foreground mt-6 text-center text-xs">
            Not a business?{" "}
            <button type="button" onClick={onBack} className="text-primary hover:underline">
              Use the regular sign-in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
