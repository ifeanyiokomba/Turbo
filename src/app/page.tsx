"use client";

import * as React from "react";
import { LoadingScreen } from "@/components/turbopay/loading-screen";
import { LandingPage } from "@/components/turbopay/landing-page";
import { AuthScreen } from "@/components/turbopay/auth-screen";
import { AppShell } from "@/components/turbopay/app-shell";
import { useApp } from "@/components/turbopay/store";

export default function Home() {
  const { user, loading, setLoading, setUser } = useApp();
  const [showAuth, setShowAuth] = React.useState(false);
  const [booting, setBooting] = React.useState(true);

  // Bootstrap: check session
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (mounted) setUser(data.user);
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
  }, []);

  if (booting) return <LoadingScreen />;

  if (user) return <AppShell user={user} />;

  if (showAuth) return <AuthScreen onBack={() => setShowAuth(false)} />;

  return <LandingPage onGetStarted={() => setShowAuth(true)} />;
}
