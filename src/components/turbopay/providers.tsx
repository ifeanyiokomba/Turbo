"use client";

// Wagmi provider wrapper — conditionally wraps app with WagmiProvider.
//
// Also installs the CSRF fetch interceptor on mount so that every same-origin
// mutating request from anywhere in the app automatically carries the
// X-CSRF-Token header. The interceptor is idempotent and SSR-safe.

import * as React from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { config } from "@/lib/wagmi";
import { installCsrfInterceptor } from "@/lib/security/client";

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  // Install the global fetch monkey-patch exactly once on the client.
  // `installCsrfInterceptor` is itself idempotent (checks a flag on window),
  // so calling it from StrictMode's double-invoke of effects is safe.
  React.useEffect(() => {
    installCsrfInterceptor();
  }, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
