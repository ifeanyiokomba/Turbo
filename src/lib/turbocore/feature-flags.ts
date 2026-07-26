// TurboCore feature flags.
//
// A small, well-documented feature-flag layer built on the existing
// FeatureFlag Prisma model. Two parked providers (Stripe, Wise) and their
// dependent surfaces are gated behind these flags so they are never selected
// by the routing engine unless an admin explicitly flips the flag to true.
//
// Resolution order (per call):
//   1. Per-user FeatureFlagOverride (when `userId` is provided) — lets ops
//      enable a parked flag for a single beta user without unblocking everyone.
//   2. Global FeatureFlag row (key, enabled, valueJSON).
//   3. FLAG_DEFAULTS constant — the safe built-in default (false for parked
//      features, true for anything else declared here).
//
// A 5-minute in-memory cache fronts the DB lookup so routing decisions do not
// pay a round-trip per request. invalidateFlagCache() is exposed for the
// admin toggle endpoint to call after a mutation.

import { db } from "@/lib/db";

// Well-known flag keys. Keep this list curated — every key here MUST also
// appear in FLAG_DEFAULTS below so unknown lookups fall back deterministically.
export const FeatureFlags = {
  STRIPE_ENABLED: "stripe_enabled",
  WISE_ENABLED: "wise_enabled",
  INTERNATIONAL_TRANSFERS: "international_transfers_enabled",
  VIRTUAL_CARDS_STRIPE: "virtual_cards_stripe_enabled",
} as const;

export type FeatureFlagKey = (typeof FeatureFlags)[keyof typeof FeatureFlags];

// Built-in defaults — the single source of truth for "what should this flag
// evaluate to when nothing is configured in the DB yet". PARKED providers are
// false by default so the routing engine never picks them unless an admin
// explicitly enables them.
export const FLAG_DEFAULTS: Record<string, boolean> = {
  // PARKED — was affecting the build (Stripe adapter pulls in too much surface
  // for the current sandbox); admin can flip on once credentials are rotated.
  stripe_enabled: false,
  // PARKED — international transfers via Wise are paused until compliance
  // signs off on the new corridor matrix.
  wise_enabled: false,
  // Composite gate: international transfers as a user-facing surface. Tied to
  // wise_enabled at the engine level — both must be true to actually route.
  international_transfers_enabled: false,
  // Composite gate: Stripe-issued virtual cards. Tied to stripe_enabled.
  virtual_cards_stripe_enabled: false,
};

// Cache entry shape. We store the resolved boolean per (key, userId?) pair so
// the per-user override lookup is memoised separately from the global lookup.
interface CacheEntry {
  ts: number;
  value: boolean;
}

const CACHE_TTL_MS = 5 * 60_000; // 5 minutes
const flagCache = new Map<string, CacheEntry>();

function cacheKey(key: string, userId?: string): string {
  return userId ? `${key}::${userId}` : `${key}::global`;
}

// Invalidate the entire flag cache. Called by the admin toggle endpoint after
// any mutation so the next read picks up the new value immediately.
export function invalidateFlagCache(key?: string): void {
  if (!key) {
    flagCache.clear();
    return;
  }
  // Drop both the global and any per-user entries for this key.
  for (const k of Array.from(flagCache.keys())) {
    if (k.startsWith(`${key}::`)) flagCache.delete(k);
  }
}

function parseBool(valueJSON: string | undefined | null): boolean | null {
  if (!valueJSON) return null;
  try {
    const parsed = JSON.parse(valueJSON);
    return typeof parsed === "boolean" ? parsed : null;
  } catch {
    return null;
  }
}

// Read a flag's effective value, honouring per-user overrides, the global DB
// row, and finally the FLAG_DEFAULTS constant. Throws never — DB errors fall
// back to the default so a transient DB hiccup can't take routing down.
export async function isFeatureEnabled(key: string, userId?: string): Promise<boolean> {
  const ck = cacheKey(key, userId);
  const hit = flagCache.get(ck);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.value;

  let value: boolean | null = null;

  try {
    // 1. Per-user override wins if present.
    if (userId) {
      const override = await db.featureFlagOverride.findUnique({
        where: {
          flagKey_targetType_targetId: {
            flagKey: key,
            targetType: "USER",
            targetId: userId,
          },
        },
      });
      if (override) value = parseBool(override.valueJSON);
    }

    // 2. Global FeatureFlag row.
    if (value === null) {
      const flag = await db.featureFlag.findUnique({ where: { key } });
      if (flag) {
        if (!flag.enabled) {
          // `enabled = false` on the row itself is a hard kill-switch.
          value = false;
        } else {
          value = parseBool(flag.valueJSON);
        }
      }
    }
  } catch {
    // DB error — fall through to the default below.
    value = null;
  }

  // 3. Built-in default.
  if (value === null) value = FLAG_DEFAULTS[key] ?? false;

  flagCache.set(ck, { ts: Date.now(), value });
  return value;
}

// Convenience helpers for the two parked providers — the routing engine calls
// these on every capability filter so the cost is one cached map lookup.
export async function isStripeEnabled(userId?: string): Promise<boolean> {
  return isFeatureEnabled(FeatureFlags.STRIPE_ENABLED, userId);
}

export async function isWiseEnabled(userId?: string): Promise<boolean> {
  return isFeatureEnabled(FeatureFlags.WISE_ENABLED, userId);
}
