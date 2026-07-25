"use client";

import * as React from "react";
import { useApp } from "../store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, ShieldCheck, ArrowRight } from "lucide-react";

interface FeatureGateProps {
  requiredTier: 1 | 2 | 3;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Optional short feature name shown in the locked card */
  feature?: string;
  /** Optional short description shown under the title */
  description?: string;
  /** Compact variant — useful when wrapping a single button */
  compact?: boolean;
}

const TIER_DESCRIPTIONS: Record<number, string> = {
  1: "Verify your identity (NIN) to unlock this feature and lift transaction limits.",
  2: "Verify your NIN to unlock this feature and lift transaction limits.",
  3: "Verify your BVN to unlock premium features and the highest limits.",
};

/**
 * Conditionally renders `children` if the current user's KYC tier is greater
 * than or equal to `requiredTier`. Otherwise renders a branded "locked" card
 * with an Upgrade CTA that jumps to the KYC view.
 */
export function FeatureGate({
  requiredTier,
  children,
  fallback,
  feature,
  description,
  compact = false,
}: FeatureGateProps) {
  const { user, setView } = useApp();
  const currentTier = user?.kycTier ?? 0;

  if (currentTier >= requiredTier) {
    return <>{children}</>;
  }

  if (fallback !== undefined) {
    return <>{fallback}</>;
  }

  const title = feature
    ? `${feature} needs KYC Tier ${requiredTier}`
    : `Requires KYC Tier ${requiredTier}`;

  if (compact) {
    return (
      <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <Lock className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {description ?? TIER_DESCRIPTIONS[requiredTier]}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-1.5"
            onClick={() => setView("kyc")}
          >
            Upgrade <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className="border-amber-500/30 bg-amber-500/5 p-6 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
        <Lock className="h-6 w-6" />
      </div>
      <p className="mt-4 font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        {description ?? TIER_DESCRIPTIONS[requiredTier]}
      </p>
      <Button
        className="mt-5 gap-1.5"
        onClick={() => setView("kyc")}
      >
        <ShieldCheck className="h-4 w-4" />
        Upgrade now
      </Button>
    </Card>
  );
}

export default FeatureGate;
