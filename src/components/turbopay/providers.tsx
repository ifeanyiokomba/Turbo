"use client";

// Wagmi provider wrapper — conditionally wraps app with WagmiProvider.
// Also installs the global CSRF fetch interceptor so all same-origin
// POST/PUT/DELETE requests automatically include the X-CSRF-Token header.

import * as React from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { config } from "@/lib/wagmi";
import { installCsrfInterceptor } from "@/lib/security/client";

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  // Install the CSRF interceptor once on mount. This monkey-patches
  // window.fetch so every same-origin POST/PUT/DELETE automatically
  // includes the X-CSRF-Token header from the tp_csrf cookie.
  // Idempotent — safe to call multiple times.
  React.useEffect(() => {
    installCsrfInterceptor();
  }, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
