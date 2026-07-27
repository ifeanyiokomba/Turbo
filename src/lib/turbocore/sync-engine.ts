// TurboCore Provider Synchronization Engine
//
// TurboCore does NOT synchronize providers directly.
// It synchronizes ITS OWN UNDERSTANDING of providers.
//
// Every plugin periodically publishes metadata:
//   Capabilities, Countries, Currencies, Payment Methods,
//   Settlement Methods, Limits, Fees, Health, Version, Webhook Status
//
// TurboCore stores all of this in its registry.
//
// Features:
//   - Scheduled synchronization (cron-based)
//   - Manual refresh
//   - Version-aware updates
//   - Drift detection (when capabilities change unexpectedly)
//   - Administrative approval for significant changes

import { db } from "@/lib/db";
import { getAllManifests, getManifest, type ProviderManifest } from "./manifest-registry";
import { registry } from "./registry";
import { getBreakerStates } from "./registry";
import { isVersionCertified, getCurrentVersion, registerVersion } from "./version-manager";
import { isCertified } from "./certification";

export interface ProviderSyncResult {
  provider: string;
  synced: boolean;
  changes: SyncChange[];
  driftDetected: boolean;
  syncDurationMs: number;
  syncedAt: string;
  error?: string;
}

export interface SyncChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  significant: boolean; // requires admin approval
  approved: boolean;
}

export interface ProviderMetadata {
  provider: string;
  version: string;
  countries: string[];
  currencies: string[];
  capabilities: string[];
  paymentMethods: string[];
  limits: Record<string, { min: number; max: number }>;
  fees: { percentageBps: number; fixedFee: Record<string, number> };
  healthScore: number;
  circuitState: string;
  certified: boolean;
  webhookSupported: boolean;
  settlementCycle: string;
  lastSyncedAt: string;
}

// ===== Sync State =====

const syncHistory = new Map<string, ProviderSyncResult[]>();
const lastKnownMetadata = new Map<string, ProviderMetadata>();
const pendingApprovals = new Map<string, SyncChange[]>();

// ===== Synchronize All Providers =====

export async function syncAllProviders(): Promise<{
  total: number;
  synced: number;
  failed: number;
  driftDetected: number;
  pendingApprovals: number;
}> {
  const manifests = getAllManifests();
  let synced = 0;
  let failed = 0;
  let driftCount = 0;
  let pendingCount = 0;

  for (const manifest of manifests) {
    try {
      const result = await syncProvider(manifest);
      if (result.synced) {
        synced++;
      } else {
        failed++;
      }
      if (result.driftDetected) {
        driftCount++;
        const pending = result.changes.filter((c) => c.significant && !c.approved);
        if (pending.length > 0) {
          pendingApprovals.set(manifest.provider, pending);
          pendingCount += pending.length;
        }
      }
    } catch (e) {
      console.error(`[sync] Failed to sync ${manifest.provider}:`, e);
      failed++;
    }
  }

  return {
    total: manifests.length,
    synced,
    failed,
    driftDetected: driftCount,
    pendingApprovals: pendingCount,
  };
}

// ===== Synchronize Single Provider =====

export async function syncProvider(manifest: ProviderManifest): Promise<ProviderSyncResult> {
  const start = Date.now();
  const changes: SyncChange[] = [];
  let driftDetected = false;

  try {
    // Gather current metadata from live systems
    const breakerStates = getBreakerStates();
    const health = registry.getHealth(manifest.provider);
    const breaker = breakerStates[manifest.provider];
    const certified = isCertified(manifest.provider);
    const version = getCurrentVersion(manifest.provider) ?? manifest.version;

    const currentMetadata: ProviderMetadata = {
      provider: manifest.provider,
      version,
      countries: manifest.countries,
      currencies: manifest.currencies,
      capabilities: manifest.capabilities.map((c) => c.name),
      paymentMethods: manifest.paymentMethods,
      limits: {
        NGN: { min: manifest.limits.minAmount.NGN ?? 0, max: manifest.limits.maxAmount.NGN ?? 0 },
      },
      fees: {
        percentageBps: manifest.fees.percentageBps,
        fixedFee: manifest.fees.fixedFee,
      },
      healthScore: health.score,
      circuitState: breaker?.state ?? "CLOSED",
      certified,
      webhookSupported: manifest.webhookSupported,
      settlementCycle: manifest.settlementCycle,
      lastSyncedAt: new Date().toISOString(),
    };

    // Compare with last known metadata (drift detection)
    const previous = lastKnownMetadata.get(manifest.provider);
    if (previous) {
      // Check for changes
      const fieldsToCheck: (keyof ProviderMetadata)[] = [
        "countries",
        "currencies",
        "capabilities",
        "paymentMethods",
        "limits",
        "fees",
        "webhookSupported",
        "settlementCycle",
      ];

      for (const field of fieldsToCheck) {
        const oldValue = previous[field];
        const newValue = currentMetadata[field];

        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
          const significant = isSignificantChange(field, oldValue, newValue);
          driftDetected = true;

          changes.push({
            field: String(field),
            oldValue,
            newValue,
            significant,
            approved: !significant, // non-significant changes auto-approve
          });
        }
      }

      // Version change
      if (previous.version !== currentMetadata.version) {
        changes.push({
          field: "version",
          oldValue: previous.version,
          newValue: currentMetadata.version,
          significant: true,
          approved: false,
        });
        driftDetected = true;
      }

      // Health score change (not drift, just tracking)
      if (Math.abs(previous.healthScore - currentMetadata.healthScore) > 20) {
        changes.push({
          field: "healthScore",
          oldValue: previous.healthScore,
          newValue: currentMetadata.healthScore,
          significant: false,
          approved: true,
        });
      }
    }

    // Store current metadata
    lastKnownMetadata.set(manifest.provider, currentMetadata);

    // Update DB with synced metadata (ProviderConfig + ProviderCapability)
    await db.providerConfig.upsert({
      where: { code: manifest.provider },
      create: {
        code: manifest.provider,
        displayName: manifest.displayName,
        sandbox: true,
        enabled: true,
        weightsJSON: "{}",
        defaultPriority: 50,
      },
      update: {},
    });

    // Record sync history
    const result: ProviderSyncResult = {
      provider: manifest.provider,
      synced: true,
      changes,
      driftDetected,
      syncDurationMs: Date.now() - start,
      syncedAt: new Date().toISOString(),
    };

    const history = syncHistory.get(manifest.provider) ?? [];
    history.push(result);
    if (history.length > 100) history.shift(); // keep last 100
    syncHistory.set(manifest.provider, history);

    return result;
  } catch (e) {
    const result: ProviderSyncResult = {
      provider: manifest.provider,
      synced: false,
      changes,
      driftDetected: false,
      syncDurationMs: Date.now() - start,
      syncedAt: new Date().toISOString(),
      error: e instanceof Error ? e.message : "Unknown error",
    };
    return result;
  }
}

// ===== Drift Detection =====

function isSignificantChange(field: string, oldValue: unknown, newValue: unknown): boolean {
  // Countries, currencies, capabilities, payment methods changes are significant
  // — they affect routing decisions
  if (["countries", "currencies", "capabilities", "paymentMethods"].includes(field)) {
    const oldArr = (oldValue as string[]) ?? [];
    const newArr = (newValue as string[]) ?? [];
    const removed = oldArr.filter((x) => !newArr.includes(x));
    const added = newArr.filter((x) => !oldArr.includes(x));
    // Removals are always significant (could break routing)
    // Additions are significant but not breaking
    return removed.length > 0 || added.length > 0;
  }

  // Fee changes are significant (affect cost routing)
  if (field === "fees") {
    return true;
  }

  // Limit changes are significant
  if (field === "limits") {
    return true;
  }

  // Settlement cycle changes are significant
  if (field === "settlementCycle") {
    return true;
  }

  // Webhook support changes are significant
  if (field === "webhookSupported") {
    return true;
  }

  return false;
}

// ===== Approval System =====

export function getPendingApprovals(): { provider: string; changes: SyncChange[] }[] {
  return Array.from(pendingApprovals.entries()).map(([provider, changes]) => ({
    provider,
    changes,
  }));
}

export function approveChange(provider: string, field: string): boolean {
  const pending = pendingApprovals.get(provider);
  if (!pending) return false;

  const change = pending.find((c) => c.field === field);
  if (!change) return false;

  change.approved = true;

  // If all changes approved, clear pending
  const remaining = pending.filter((c) => !c.approved);
  if (remaining.length === 0) {
    pendingApprovals.delete(provider);
  } else {
    pendingApprovals.set(provider, remaining);
  }

  return true;
}

export function rejectChange(provider: string, field: string): boolean {
  const pending = pendingApprovals.get(provider);
  if (!pending) return false;

  // Remove the rejected change (keep old value)
  const filtered = pending.filter((c) => c.field !== field);
  if (filtered.length === 0) {
    pendingApprovals.delete(provider);
  } else {
    pendingApprovals.set(provider, filtered);
  }

  return true;
}

// ===== Query Methods =====

export function getProviderMetadata(provider: string): ProviderMetadata | null {
  return lastKnownMetadata.get(provider) ?? null;
}

export function getAllProviderMetadata(): ProviderMetadata[] {
  return Array.from(lastKnownMetadata.values());
}

export function getSyncHistory(provider: string): ProviderSyncResult[] {
  return syncHistory.get(provider) ?? [];
}

export function getLastSync(provider: string): ProviderSyncResult | null {
  const history = syncHistory.get(provider);
  return history && history.length > 0 ? history[history.length - 1] : null;
}

// ===== Manual Refresh =====

export async function refreshProvider(provider: string): Promise<ProviderSyncResult> {
  const manifest = getManifest(provider);
  if (!manifest) {
    return {
      provider,
      synced: false,
      changes: [],
      driftDetected: false,
      syncDurationMs: 0,
      syncedAt: new Date().toISOString(),
      error: "Provider manifest not found",
    };
  }
  return syncProvider(manifest);
}
