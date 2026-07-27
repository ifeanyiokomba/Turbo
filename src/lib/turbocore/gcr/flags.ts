// TurboCore GCR — Capability Flags
//
// Capabilities can be enabled or disabled by:
//   - Country
//   - Merchant
//   - User tier
//   - Environment
//   - Regulatory approval
//
// No code deployment required — flags are runtime-configurable.
//
// Resolution order (most-specific to least-specific):
//   1. Per-merchant override (if merchantId provided)
//   2. Per-user-tier override (if kycTier provided)
//   3. Per-country override
//   4. Per-environment override
//   5. Regulatory override (always wins if present)
//   6. Global default (from the catalogue status)
//
// Examples from Chapter 7:
//   Stablecoin Payments
//     Production / Nigeria  → DISABLED
//     Production / Kenya    → ENABLED
//     Sandbox                → ENABLED

import type { CapabilityFlag, CapabilityFlagScope, KycTier } from "./types";

// ---------------------------------------------------------------------------
// In-memory flag store (mirrors the existing feature-flags.ts pattern)
//
// In production this would be backed by a Prisma `CapabilityFlag` table; for
// the GCR the in-memory store is the source of truth because the catalogue
// itself is static. Admin mutations (POST /api/admin/gcr/flags) update this
// store + persist to the existing FeatureFlag table for audit.
// ---------------------------------------------------------------------------

const flagStore = new Map<string, CapabilityFlag>();

function flagKey(capabilityId: string, scope: CapabilityFlagScope, target: string): string {
  return `${capabilityId}:${scope}:${target}`;
}

// Seed a few well-known regulatory flags so the admin UI shows interesting data
function seedFlags(): void {
  if (flagStore.size > 0) return;
  const now = new Date().toISOString();
  const seeds: CapabilityFlag[] = [
    {
      id: "seed-1",
      capabilityId: "collections.stablecoins",
      scope: "COUNTRY",
      target: "NG",
      enabled: false,
      reason: "Awaiting SEC Nigeria approval for stablecoin rails.",
      updatedAt: now,
      updatedBy: "system",
    },
    {
      id: "seed-2",
      capabilityId: "collections.stablecoins",
      scope: "COUNTRY",
      target: "KE",
      enabled: true,
      reason: "CBK sandbox approved for stablecoin pilots.",
      updatedAt: now,
      updatedBy: "system",
    },
    {
      id: "seed-3",
      capabilityId: "collections.stablecoins",
      scope: "ENVIRONMENT",
      target: "development",
      enabled: true,
      reason: "Always enabled in sandbox for testing.",
      updatedAt: now,
      updatedBy: "system",
    },
    {
      id: "seed-4",
      capabilityId: "collections.crypto",
      scope: "COUNTRY",
      target: "NG",
      enabled: false,
      reason: "CBN prohibits crypto transactions via regulated entities.",
      updatedAt: now,
      updatedBy: "system",
    },
    {
      id: "seed-5",
      capabilityId: "disbursements.international",
      scope: "COUNTRY",
      target: "NG",
      enabled: true,
      reason: "CBN approved for inbound/outbound cross-border (Form A/C).",
      updatedAt: now,
      updatedBy: "system",
    },
    {
      id: "seed-6",
      capabilityId: "cards.network_tokens",
      scope: "ENVIRONMENT",
      target: "production",
      enabled: false,
      reason: "Network tokenization in beta — gated in production.",
      updatedAt: now,
      updatedBy: "system",
    },
    {
      id: "seed-7",
      capabilityId: "merchant.marketplace",
      scope: "USER_TIER",
      target: "2",
      enabled: true,
      reason: "Marketplace capability unlocked at Tier 2.",
      updatedAt: now,
      updatedBy: "system",
    },
    {
      id: "seed-8",
      capabilityId: "wallets.joint_wallet",
      scope: "USER_TIER",
      target: "2",
      enabled: true,
      reason: "Joint wallet requires Tier 2 (both parties).",
      updatedAt: now,
      updatedBy: "system",
    },
    {
      id: "seed-9",
      capabilityId: "treasury.liquidity",
      scope: "REGULATORY",
      target: "ALL",
      enabled: true,
      reason: "Treasury operations approved by CBN.",
      updatedAt: now,
      updatedBy: "system",
    },
  ];
  for (const f of seeds) {
    flagStore.set(flagKey(f.capabilityId, f.scope, f.target), f);
  }
}
seedFlags();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function listFlags(filter?: {
  capabilityId?: string;
  scope?: CapabilityFlagScope;
  target?: string;
}): CapabilityFlag[] {
  let flags = Array.from(flagStore.values());
  if (filter?.capabilityId) flags = flags.filter((f) => f.capabilityId === filter.capabilityId);
  if (filter?.scope) flags = flags.filter((f) => f.scope === filter.scope);
  if (filter?.target) flags = flags.filter((f) => f.target === filter.target);
  return flags.sort(
    (a, b) => a.capabilityId.localeCompare(b.capabilityId) || a.scope.localeCompare(b.scope)
  );
}

export function getFlag(
  capabilityId: string,
  scope: CapabilityFlagScope,
  target: string
): CapabilityFlag | null {
  return flagStore.get(flagKey(capabilityId, scope, target)) ?? null;
}

export function setFlag(input: {
  capabilityId: string;
  scope: CapabilityFlagScope;
  target: string;
  enabled: boolean;
  reason?: string;
  updatedBy?: string;
}): CapabilityFlag {
  const key = flagKey(input.capabilityId, input.scope, input.target);
  const existing = flagStore.get(key);
  const flag: CapabilityFlag = {
    id: existing?.id ?? `flag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    capabilityId: input.capabilityId,
    scope: input.scope,
    target: input.target,
    enabled: input.enabled,
    reason: input.reason,
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy,
  };
  flagStore.set(key, flag);
  return flag;
}

export function deleteFlag(
  capabilityId: string,
  scope: CapabilityFlagScope,
  target: string
): boolean {
  return flagStore.delete(flagKey(capabilityId, scope, target));
}

// ---------------------------------------------------------------------------
// Evaluation — used by the resolution engine
// ---------------------------------------------------------------------------

export interface FlagEvaluationRequest {
  capabilityId: string;
  country?: string;
  merchantId?: string;
  userTier?: KycTier;
  environment?: "development" | "production";
}

export interface FlagEvaluationResult {
  enabled: boolean;
  reason: string;
  matchedFlag?: CapabilityFlag;
}

export async function evaluateCapabilityFlags(
  request: FlagEvaluationRequest
): Promise<FlagEvaluationResult> {
  const env =
    request.environment ?? (process.env.NODE_ENV === "production" ? "production" : "development");

  // Regulatory override always wins
  const regulatory = getFlag(request.capabilityId, "REGULATORY", "ALL");
  if (regulatory) {
    return {
      enabled: regulatory.enabled,
      reason: `REGULATORY override: ${regulatory.reason ?? "no reason"}`,
      matchedFlag: regulatory,
    };
  }

  // Per-merchant override
  if (request.merchantId) {
    const merchant = getFlag(request.capabilityId, "MERCHANT", request.merchantId);
    if (merchant) {
      return {
        enabled: merchant.enabled,
        reason: `MERCHANT override for ${request.merchantId}: ${merchant.reason ?? "no reason"}`,
        matchedFlag: merchant,
      };
    }
  }

  // Per-user-tier override
  if (request.userTier !== undefined) {
    const tier = getFlag(request.capabilityId, "USER_TIER", String(request.userTier));
    if (tier) {
      return {
        enabled: tier.enabled,
        reason: `USER_TIER override for tier ${request.userTier}: ${tier.reason ?? "no reason"}`,
        matchedFlag: tier,
      };
    }
  }

  // Per-country override
  if (request.country) {
    const country = getFlag(request.capabilityId, "COUNTRY", request.country);
    if (country) {
      return {
        enabled: country.enabled,
        reason: `COUNTRY override for ${request.country}: ${country.reason ?? "no reason"}`,
        matchedFlag: country,
      };
    }
  }

  // Per-environment override
  const envFlag = getFlag(request.capabilityId, "ENVIRONMENT", env);
  if (envFlag) {
    return {
      enabled: envFlag.enabled,
      reason: `ENVIRONMENT override for ${env}: ${envFlag.reason ?? "no reason"}`,
      matchedFlag: envFlag,
    };
  }

  // No override — default to enabled
  return {
    enabled: true,
    reason: "No flag override — default enabled.",
  };
}

export function invalidateFlagStore(): void {
  flagStore.clear();
  seedFlags();
}

export function getFlagStats(): {
  total: number;
  enabled: number;
  disabled: number;
  byScope: Record<CapabilityFlagScope, number>;
} {
  const flags = Array.from(flagStore.values());
  const byScope: Record<CapabilityFlagScope, number> = {
    GLOBAL: 0,
    COUNTRY: 0,
    MERCHANT: 0,
    USER_TIER: 0,
    ENVIRONMENT: 0,
    REGULATORY: 0,
  };
  for (const f of flags) {
    byScope[f.scope]++;
  }
  return {
    total: flags.length,
    enabled: flags.filter((f) => f.enabled).length,
    disabled: flags.filter((f) => !f.enabled).length,
    byScope,
  };
}
