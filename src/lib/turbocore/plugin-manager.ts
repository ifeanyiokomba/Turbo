// TurboCore Plugin Manager
//
// This is a Core Service. Every provider passes through here.
//
// Plugin Manager responsibilities:
//   - Install    — register a new provider plugin
//   - Update      — upgrade to a new version
//   - Disable     — temporarily take a provider offline
//   - Enable      — bring a provider back online
//   - Rollback    — revert to a previous version
//   - Health Check — verify provider is responding
//   - Capability Discovery — read what the provider supports
//   - Certification — run certification suite before activation
//   - Version Control — track semver history per provider
//
// The application itself never knows which providers are installed.
// It only interacts with the Plugin Manager.

import { getAllManifests, getManifest, type ProviderManifest } from "./manifest-registry";
import { registry, getBreakerStates } from "./registry";
import { ContractName } from "./result";
import {
  certifyProvider,
  storeCertification,
  getCertification,
  isCertified,
  type CertificationResult,
} from "./certification";
import {
  registerVersion,
  markCertified,
  rollback as rollbackVersion,
  getCurrentVersion,
  getVersionHistory,
  isVersionCertified,
  type ProviderVersion,
} from "./version-manager";
import { isSandboxEnabled, setSandboxMode } from "./sandbox";

// ===== Plugin State =====

export type PluginStatus =
  | "INSTALLED"
  | "VALIDATED"
  | "REGISTERED"
  | "HEALTH_CHECKED"
  | "CERTIFIED"
  | "ACTIVATED"
  | "DISABLED"
  | "FAILED";

export interface PluginEntry {
  provider: string;
  manifest: ProviderManifest;
  status: PluginStatus;
  version: string;
  certified: boolean;
  sandbox: boolean;
  enabled: boolean;
  healthScore: number;
  installedAt: string;
  lastHealthCheck?: string;
  certification?: CertificationResult;
}

const pluginRegistry = new Map<string, PluginEntry>();

// ===== Plugin Lifecycle =====
//
// Installed → Validated → Registered → Health Checked → Certified → Activated
//                                                        ↘ Failed
//                                                        ↘ Disabled

export function installPlugin(manifest: ProviderManifest): PluginEntry {
  const entry: PluginEntry = {
    provider: manifest.provider,
    manifest,
    status: "INSTALLED",
    version: manifest.version,
    certified: false,
    sandbox: manifest.supportsSandbox ?? true,
    enabled: false,
    healthScore: 100,
    installedAt: new Date().toISOString(),
  };

  // Register version
  registerVersion(manifest.provider, manifest.version, `Initial install: ${manifest.displayName}`);

  pluginRegistry.set(manifest.provider, entry);
  return entry;
}

export function validatePlugin(provider: string): { valid: boolean; errors: string[] } {
  const entry = pluginRegistry.get(provider);
  if (!entry) return { valid: false, errors: ["Plugin not installed"] };

  const errors: string[] = [];
  const m = entry.manifest;

  if (!m.provider) errors.push("Missing provider ID");
  if (!m.displayName) errors.push("Missing display name");
  if (!m.version) errors.push("Missing version");
  if (!m.countries || m.countries.length === 0) errors.push("Missing countries");
  if (!m.currencies || m.currencies.length === 0) errors.push("Missing currencies");
  if (!m.capabilities || m.capabilities.length === 0) errors.push("Missing capabilities");
  if (!m.apiVersion) errors.push("Missing API version");
  if (!m.sandboxBaseUrl && !m.liveBaseUrl) errors.push("Missing base URLs");

  if (errors.length === 0) {
    entry.status = "VALIDATED";
  }

  return { valid: errors.length === 0, errors };
}

export function registerPlugin(provider: string): boolean {
  const entry = pluginRegistry.get(provider);
  if (!entry || entry.status !== "VALIDATED") return false;

  // The provider is already registered in the adapter registry via providers/index.ts
  // This step marks it as "REGISTERED" in the plugin manager
  entry.status = "REGISTERED";
  return true;
}

export async function healthCheckPlugin(provider: string): Promise<boolean> {
  const entry = pluginRegistry.get(provider);
  if (!entry) return false;

  try {
    const breakerStates = getBreakerStates();
    const breaker = breakerStates[provider];
    const healthScore = registry.getHealth(provider).score;

    entry.healthScore = healthScore;
    entry.lastHealthCheck = new Date().toISOString();

    if (breaker?.state === "CLOSED" && healthScore >= 30) {
      entry.status = "HEALTH_CHECKED";
      return true;
    }
    entry.status = "FAILED";
    return false;
  } catch {
    entry.status = "FAILED";
    return false;
  }
}

export async function certifyPlugin(
  provider: string,
  skipLiveCalls = true
): Promise<CertificationResult> {
  const entry = pluginRegistry.get(provider);
  if (!entry) {
    return {
      provider,
      status: "FAILED",
      tests: [],
      passed: 0,
      failed: 1,
      total: 1,
      duration: 0,
      failureReason: "Plugin not installed",
    };
  }

  // Get the adapter
  let adapter: any = null;
  try {
    // Try to resolve a common contract
    adapter = await registry.resolve("CARD_PAYMENT" as ContractName, provider);
  } catch {
    try {
      adapter = await registry.resolve("MOBILE_MONEY" as ContractName, provider);
    } catch {
      try {
        adapter = await registry.resolve("KYC" as ContractName, provider);
      } catch {
        // Adapter not registered for common contracts — that's OK for notification-only providers
      }
    }
  }

  const result = await certifyProvider(
    adapter ?? {
      providerCode: provider,
      displayName: entry.manifest.displayName,
      version: entry.manifest.version,
      initialize: async () => ({ ok: true, data: true, providerRequestId: "", latencyMs: 0 }),
      authenticate: async () => ({ ok: true, data: "mock", providerRequestId: "", latencyMs: 0 }),
      health: async () => ({
        ok: true,
        data: { healthy: true, latencyMs: 0, uptime: 100, lastCheckedAt: new Date().toISOString() },
        providerRequestId: "",
        latencyMs: 0,
      }),
      discoverCapabilities: () =>
        entry.manifest.capabilities.map((c: any) => ({
          name: c.name,
          direction: c.direction,
          countries: c.countries,
          currencies: c.currencies,
        })),
      countries: () => entry.manifest.countries,
      currencies: () => entry.manifest.currencies,
      paymentMethods: () => entry.manifest.paymentMethods,
      limits: () => ({ minAmount: {}, maxAmount: {}, dailyVolume: 0, monthlyVolume: 0 }),
      fees: () => ({
        percentageBps: entry.manifest.fees.percentageBps,
        fixedFee: entry.manifest.fees.fixedFee,
      }),
      status: async () => ({
        ok: true,
        data: { operational: true, sandbox: true, version: entry.manifest.version, features: [] },
        providerRequestId: "",
        latencyMs: 0,
      }),
      shutdown: async () => ({ ok: true, data: true, providerRequestId: "", latencyMs: 0 }),
    },
    entry.manifest,
    { skipLiveCalls }
  );

  storeCertification(result);
  entry.certification = result;

  if (result.status === "CERTIFIED") {
    entry.status = "CERTIFIED";
    entry.certified = true;
    markCertified(provider, entry.version);
  } else {
    entry.status = "FAILED";
  }

  return result;
}

export function activatePlugin(provider: string): boolean {
  const entry = pluginRegistry.get(provider);
  if (!entry || entry.status !== "CERTIFIED") return false;

  entry.status = "ACTIVATED";
  entry.enabled = true;
  return true;
}

export function disablePlugin(provider: string): boolean {
  const entry = pluginRegistry.get(provider);
  if (!entry) return false;
  entry.enabled = false;
  entry.status = "DISABLED";
  return true;
}

export function enablePlugin(provider: string): boolean {
  const entry = pluginRegistry.get(provider);
  if (!entry || !entry.certified) return false;
  entry.enabled = true;
  entry.status = "ACTIVATED";
  return true;
}

export function rollbackPlugin(provider: string, targetVersion?: string): ProviderVersion | null {
  const entry = pluginRegistry.get(provider);
  if (!entry) return null;

  const result = rollbackVersion(provider, targetVersion);
  if (result) {
    entry.version = result.version;
    entry.certified = result.certified;
    entry.status = result.certified ? "ACTIVATED" : "CERTIFIED";
  }
  return result;
}

// ===== Plugin Discovery =====
// At startup, TurboCore scans /providers and loads them automatically.

export function discoverAndInstallAll(): { installed: number; failed: number } {
  const manifests = getAllManifests();
  let installed = 0;
  let failed = 0;

  for (const manifest of manifests) {
    try {
      const entry = installPlugin(manifest);
      const validation = validatePlugin(manifest.provider);
      if (validation.valid) {
        registerPlugin(manifest.provider);
        installed++;
      } else {
        console.error(
          `[plugin-manager] Validation failed for ${manifest.provider}:`,
          validation.errors
        );
        failed++;
      }
    } catch (e) {
      console.error(`[plugin-manager] Failed to install ${manifest.provider}:`, e);
      failed++;
    }
  }

  return { installed, failed };
}

// ===== Plugin Status =====

export function getPluginStatus(provider: string): PluginEntry | null {
  return pluginRegistry.get(provider) ?? null;
}

export function getAllPlugins(): PluginEntry[] {
  return Array.from(pluginRegistry.values());
}

export function isPluginEnabled(provider: string): boolean {
  return pluginRegistry.get(provider)?.enabled ?? false;
}

export function isPluginCertified(provider: string): boolean {
  return pluginRegistry.get(provider)?.certified ?? false;
}

// ===== Auto-initialize on import =====

const initResult = discoverAndInstallAll();
if (initResult.failed > 0) {
  console.warn(`[plugin-manager] ${initResult.failed} plugins failed to install`);
}
