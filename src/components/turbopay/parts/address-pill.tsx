"use client";

import * as React from "react";
import { Copy, Check, ExternalLink } from "lucide-react";
import { truncateAddress, getExplorerUrl, CELO_MAINNET_CHAIN_ID } from "@/lib/minipay";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * AddressPill — displays a truncated 0x... address with optional copy
 * button and explorer link. Used throughout the MiniPay UI to keep
 * address presentation consistent (monospace, subtle bg, rounded).
 */
export function AddressPill({
  address,
  chainId = CELO_MAINNET_CHAIN_ID,
  copyable = true,
  explorer = true,
  className,
  showFull = false,
}: {
  address: string;
  chainId?: number;
  copyable?: boolean;
  explorer?: boolean;
  className?: string;
  /** When true, show the full address instead of the truncated version. */
  showFull?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast.success("Address copied", {
        description: truncateAddress(address),
      });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy address");
    }
  }, [address]);

  if (!address) return null;

  return (
    <div
      className={cn(
        "bg-muted/50 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
        className
      )}
    >
      <span className="font-mono font-medium tabular-nums">
        {showFull ? address : truncateAddress(address)}
      </span>

      {copyable && (
        <button
          type="button"
          onClick={copy}
          aria-label="Copy address"
          title="Copy address"
          className="text-muted-foreground hover:text-foreground flex h-4 w-4 items-center justify-center rounded-full transition-colors"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
      )}

      {explorer && (
        <a
          href={getExplorerUrl(address, chainId)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View on explorer"
          title="View on explorer"
          className="text-muted-foreground hover:text-foreground flex h-4 w-4 items-center justify-center rounded-full transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
