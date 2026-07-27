// TurboCore Plugin Loading Framework
//
// Every provider becomes a plugin. The loader:
// 1. Discovers all provider manifest files
// 2. Registers them in the manifest registry
// 3. Registers their adapter implementations in the provider registry
// 4. Runs health checks
// 5. Builds the capability matrix
//
// Adding a new provider = drop a manifest file + adapter file.
// No code changes to TurboCore.

import { getAllManifests, getManifest, type ProviderManifest } from "./manifest-registry";
import { registry } from "./registry";
import { ContractName } from "./result";

// ===== Plugin Loading State =====

interface LoadedPlugin {
  manifest: ProviderManifest;
  contracts: ContractName[];
  loaded: boolean;
  healthy: boolean | null;
  loadedAt: Date;
}

const pluginState = new Map<string, LoadedPlugin>();

// ===== Plugin Loader =====

export function loadAllPlugins(): { total: number; loaded: number; failed: number } {
  const manifests = getAllManifests();
  let loaded = 0;
  let failed = 0;

  for (const manifest of manifests) {
    try {
      // Map manifest capabilities to ContractNames
      const contracts = mapCapabilitiesToContracts(manifest);

      pluginState.set(manifest.provider, {
        manifest,
        contracts,
        loaded: true,
        healthy: null, // will be set on first health check
        loadedAt: new Date(),
      });

      loaded++;
    } catch (e) {
      console.error(`[plugin-loader] Failed to load ${manifest.provider}:`, e);
      failed++;
    }
  }

  return { total: manifests.length, loaded, failed };
}

// ===== Capability → Contract Mapping =====
// Maps the manifest's capability names to TurboCore ContractNames.

function mapCapabilitiesToContracts(manifest: ProviderManifest): ContractName[] {
  const contracts = new Set<ContractName>();

  for (const cap of manifest.capabilities) {
    switch (cap.name) {
      case "CARD":
        contracts.add("CARD_PAYMENT" as ContractName);
        break;
      case "BANK_TRANSFER":
      case "TRANSFER":
        contracts.add("BANK_TRANSFER" as ContractName);
        break;
      case "VIRTUAL_ACCOUNT":
        contracts.add("VIRTUAL_ACCOUNT" as ContractName);
        break;
      case "BILL":
      case "BILL_PAYMENT":
        contracts.add("BILL_PAYMENT" as ContractName);
        break;
      case "AIRTIME":
        contracts.add("AIRTIME" as ContractName);
        break;
      case "KYC":
      case "IDENTITY":
        contracts.add("KYC" as ContractName);
        break;
      case "NOTIFICATION":
        contracts.add("NOTIFICATION" as ContractName);
        break;
      case "INTERNATIONAL_TRANSFER":
      case "INTERNATIONAL":
        contracts.add("INTERNATIONAL_TRANSFER" as ContractName);
        break;
      case "MOBILE_MONEY":
        contracts.add("MOBILE_MONEY" as ContractName);
        break;
      case "EXCHANGE_RATE":
      case "FX":
        contracts.add("EXCHANGE_RATE" as ContractName);
        break;
      case "VIRTUAL_CARD":
      case "CARD_ISSUING":
        contracts.add("VIRTUAL_CARD_ISSUER" as ContractName);
        break;
      case "AML":
        contracts.add("AML" as ContractName);
        break;
      case "FRAUD_SCREENING":
        contracts.add("FRAUD_SCREENING" as ContractName);
        break;
      case "OTP":
        contracts.add("OTP" as ContractName);
        break;
      case "SPLIT_PAYMENT":
      case "SUBACCOUNT":
        contracts.add("SPLIT_PAYMENT" as ContractName);
        break;
      case "SUBSCRIPTION":
      case "RECURRING":
        contracts.add("RECURRING_BILLING" as ContractName);
        break;
      case "INVOICE":
        contracts.add("INVOICE" as ContractName);
        break;
      case "DIRECT_DEBIT":
      case "MANDATE":
        contracts.add("DIRECT_DEBIT" as ContractName);
        break;
      case "USSD":
        contracts.add("USSD" as ContractName);
        break;
      case "CHECKOUT":
      case "PAYMENT_PAGE":
        contracts.add("CHECKOUT" as ContractName);
        break;
      case "CUSTOMER":
        contracts.add("CUSTOMER" as ContractName);
        break;
      case "PAYOUT":
        contracts.add("PAYOUT" as ContractName);
        break;
      case "REFUND":
        contracts.add("REFUND" as ContractName);
        break;
    }
  }

  return Array.from(contracts);
}

// ===== Dynamic Capability Discovery =====
// Instead of "if provider == Paystack", TurboCore asks:
// "What capabilities do you support?"

export function discoverCapabilities(providerCode: string): string[] {
  const manifest = getManifest(providerCode);
  if (!manifest) return [];
  return manifest.capabilities.map((c) => c.name);
}

export function supportsCapability(providerCode: string, capability: string): boolean {
  const manifest = getManifest(providerCode);
  if (!manifest) return false;
  return manifest.capabilities.some((c) => c.name === capability);
}

export function supportsCountry(providerCode: string, country: string): boolean {
  const manifest = getManifest(providerCode);
  if (!manifest) return false;
  return manifest.countries.includes(country) || manifest.countries.includes("ALL");
}

export function supportsCurrency(providerCode: string, currency: string): boolean {
  const manifest = getManifest(providerCode);
  if (!manifest) return false;
  return manifest.currencies.includes(currency) || manifest.currencies.includes("ALL");
}

export function supportsPaymentMethod(providerCode: string, method: string): boolean {
  const manifest = getManifest(providerCode);
  if (!manifest) return false;
  return manifest.paymentMethods.includes(method);
}

// ===== Plugin Status =====

export function getPluginStatus(): {
  provider: string;
  loaded: boolean;
  contracts: number;
  healthy: boolean | null;
}[] {
  return Array.from(pluginState.values()).map((p) => ({
    provider: p.manifest.provider,
    loaded: p.loaded,
    contracts: p.contracts.length,
    healthy: p.healthy,
  }));
}

export function isPluginLoaded(providerCode: string): boolean {
  return pluginState.get(providerCode)?.loaded ?? false;
}

// ===== Auto-load on import =====
loadAllPlugins();
