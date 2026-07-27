"use client";

// Auto-connect hook for MiniPay — connects the injected wallet on mount.
// MiniPay requires NO connect button; apps must auto-connect.

import * as React from "react";
import { useConnect, useConnectors, useAccount } from "wagmi";
import { isMiniPay } from "@/lib/minipay";

function subscribeMiniPay(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("ethereum#initialized", callback);
  return () => window.removeEventListener("ethereum#initialized", callback);
}

function getMiniPaySnapshot(): boolean {
  return isMiniPay();
}

function getMiniPayServerSnapshot(): boolean {
  return false;
}

export function useAutoConnect() {
  const connectors = useConnectors();
  const { connect, isPending } = useConnect();
  const { isConnected } = useAccount();
  const [hasAttempted, setHasAttempted] = React.useState(false);

  const inMiniPay = React.useSyncExternalStore(
    subscribeMiniPay,
    getMiniPaySnapshot,
    getMiniPayServerSnapshot
  );

  React.useEffect(() => {
    if (!inMiniPay || hasAttempted || isConnected) return;
    if (connectors.length === 0) return;
    const attempt = async () => {
      try {
        await connect({ connector: connectors[0] });
      } catch (err) {
        console.error("[MiniPay] auto-connect failed:", err);
      }
      setHasAttempted(true);
    };
    attempt();
  }, [inMiniPay, connectors, connect, hasAttempted, isConnected]);

  return { inMiniPay, isPending, isConnected };
}
