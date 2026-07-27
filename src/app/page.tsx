"use client";

import * as React from "react";
import { LoadingScreen } from "@/components/turbopay/loading-screen";
import { LandingPage } from "@/components/turbopay/landing-page";
import { AuthScreen } from "@/components/turbopay/auth-screen";
import { BusinessLoginScreen } from "@/components/turbopay/views/business-login";
import { AdminLoginScreen } from "@/components/turbopay/views/admin-login";
import { AppShell } from "@/components/turbopay/app-shell";
import { useApp } from "@/components/turbopay/store";

type AuthMode = "default" | "business" | "admin";

export default function Home() {
  const { user, loading, setLoading, setUser, setView } = useApp();
  const [showAuth, setShowAuth] = React.useState(false);
  const [authMode, setAuthMode] = React.useState<AuthMode>("default");
  const [booting, setBooting] = React.useState(true);

  // Bootstrap: check session
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (mounted && data.user) setUser(data.user);
        }
      } catch {}
      if (mounted) {
        setLoading(false);
        setBooting(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [setUser, setLoading]);

  // If the user is already signed in (e.g. after a Google OAuth callback that
  // set the cookie + redirected to /), show the app shell immediately.
  if (booting) return <LoadingScreen />;

  if (user) return <AppShell user={user} />;

  if (showAuth) {
    if (authMode === "business") {
      return <BusinessLoginScreen onBack={() => setAuthMode("default")} />;
    }
    if (authMode === "admin") {
      return <AdminLoginScreen onBack={() => setAuthMode("default")} />;
    }
    return (
      <AuthScreen
        onBack={() => setShowAuth(false)}
        onShowBusiness={() => setAuthMode("business")}
        onShowAdmin={() => setAuthMode("admin")}
      />
    );
  }

  return <LandingPage onGetStarted={() => setShowAuth(true)} />;
}
