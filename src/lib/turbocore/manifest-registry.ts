// TurboCore Provider Manifest System
//
// Every provider ships with a machine-readable manifest.
// TurboCore reads this automatically. No code changes needed.
//
// When a provider launches a new feature (e.g., Apple Pay),
// the plugin updates its manifest. TurboCore automatically enables it.

export interface ProviderManifest {
  // Identity
  provider: string;
  version: string;
  displayName: string;
  logoUrl?: string;
  website?: string;

  // Coverage
  countries: string[];
  currencies: string[];

  // Capabilities (what this provider can do)
  capabilities: ManifestCapability[];

  // Payment methods supported
  paymentMethods: string[];

  // Feature flags
  supportsRefunds: boolean;
  supportsChargebacks: boolean;
  supportsVirtualAccounts: boolean;
  supportsTransfers: boolean;
  supportsSplitPayments: boolean;
  supportsRecurringBilling: boolean;
  supportsUSSD: boolean;
  supportsQR: boolean;
  supportsApplePay: boolean;
  supportsGooglePay: boolean;

  // Limits
  limits: {
    minAmount: Record<string, number>;
    maxAmount: Record<string, number>;
    dailyVolume: number;
    monthlyVolume: number;
  };

  // Fees
  fees: {
    percentageBps: number;
    fixedFee: Record<string, number>;
    crossBorderBps: number;
  };

  // Integration
  apiVersion: string;
  sandboxBaseUrl: string;
  liveBaseUrl: string;
  authType: "BEARER" | "BASIC" | "HMAC" | "OAUTH2" | "API_KEY";

  // Webhook
  webhookSupported: boolean;
  webhookSignatureScheme: "HMAC_SHA256" | "HMAC_SHA512" | "PLAIN_EQUAL" | "NONE";

  // Settlement
  settlementCycle: "INSTANT" | "T_PLUS_1" | "T_PLUS_2" | "WEEKLY" | "MONTHLY";
  supportsSandbox: boolean;

  // Health
  healthCheckUrl?: string;
}

export interface ManifestCapability {
  name: string;
  direction: "INBOUND" | "OUTBOUND" | "BOTH";
  countries: string[];
  currencies: string[];
}

// ===== Manifest Registry =====
// All manifests are loaded at startup. TurboCore reads these
// to build the capability matrix — no manual capability seeding needed.

const manifestCache = new Map<string, ProviderManifest>();

export function registerManifest(manifest: ProviderManifest): void {
  manifestCache.set(manifest.provider, manifest);
}

export function getManifest(providerCode: string): ProviderManifest | null {
  return manifestCache.get(providerCode) ?? null;
}

export function getAllManifests(): ProviderManifest[] {
  return Array.from(manifestCache.values());
}

export function getProvidersForCountry(country: string): ProviderManifest[] {
  return getAllManifests().filter(
    (m) => m.countries.includes(country) || m.countries.includes("ALL")
  );
}

export function getProvidersForCapability(
  country: string,
  capability: string,
  direction?: string
): ProviderManifest[] {
  return getAllManifests().filter((m) => {
    const hasCountry = m.countries.includes(country) || m.countries.includes("ALL");
    const hasCapability = m.capabilities.some(
      (c) =>
        c.name === capability && (!direction || c.direction === direction || c.direction === "BOTH")
    );
    return hasCountry && hasCapability;
  });
}

// ===== Manifest Loaders =====
// Each provider defines its manifest as a constant.
// The plugin loader registers them at startup.

import { paystackManifest } from "./providers/manifests/paystack";
import { flutterwaveManifest } from "./providers/manifests/flutterwave";
import { monnifyManifest } from "./providers/manifests/monnify";
import { mpesaManifest } from "./providers/manifests/mpesa";
import { mtnMomoManifest } from "./providers/manifests/mtn-momo";
import { airtelMoneyManifest } from "./providers/manifests/airtel-money";
import { smartcashManifest } from "./providers/manifests/smartcash";
import { pagaManifest } from "./providers/manifests/paga";
import { baxiManifest } from "./providers/manifests/baxi";
import { remitaManifest } from "./providers/manifests/remita";
import { quicktellerManifest } from "./providers/manifests/quickteller";
import { dojahManifest } from "./providers/manifests/dojah";
import { termiiManifest } from "./providers/manifests/termii";
import { resendManifest } from "./providers/manifests/resend";
import { wiseManifest } from "./providers/manifests/wise";
import { stripeManifest } from "./providers/manifests/stripe";
import { turbopayManifest } from "./providers/manifests/turbopay";

export function loadAllManifests(): void {
  const manifests = [
    paystackManifest,
    flutterwaveManifest,
    monnifyManifest,
    mpesaManifest,
    mtnMomoManifest,
    airtelMoneyManifest,
    smartcashManifest,
    pagaManifest,
    baxiManifest,
    remitaManifest,
    quicktellerManifest,
    dojahManifest,
    termiiManifest,
    resendManifest,
    wiseManifest,
    stripeManifest,
    turbopayManifest,
  ];
  for (const m of manifests) registerManifest(m);
}

// Auto-load on import
loadAllManifests();
