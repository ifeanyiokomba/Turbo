"use client";

// Wagmi provider wrapper — conditionally wraps app with WagmiProvider.
<<<<<<< HEAD
//
// Also installs the CSRF fetch interceptor on mount so that every same-origin
// mutating request from anywhere in the app automatically carries the
// X-CSRF-Token header. The interceptor is idempotent and SSR-safe.
=======
// Also installs the global CSRF fetch interceptor so all same-origin
// POST/PUT/DELETE requests automatically include the X-CSRF-Token header.
>>>>>>> ecead5e1765c9674c5c6ba0b7f23bbf8d0791ddf

import * as React from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { config } from "@/lib/wagmi";
import { installCsrfInterceptor } from "@/lib/security/client";

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
<<<<<<< HEAD
  // Install the global fetch monkey-patch exactly once on the client.
  // `installCsrfInterceptor` is itself idempotent (checks a flag on window),
  // so calling it from StrictMode's double-invoke of effects is safe.
=======
  // Install the CSRF interceptor once on mount. This monkey-patches
  // window.fetch so every same-origin POST/PUT/DELETE automatically
  // includes the X-CSRF-Token header from the tp_csrf cookie.
  // Idempotent — safe to call multiple times.
>>>>>>> ecead5e1765c9674c5c6ba0b7f23bbf8d0791ddf
  React.useEffect(() => {
    installCsrfInterceptor();
  }, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
