// TurboCore manifest — Wise (TransferWise).
//
// Source of truth: src/lib/turbocore/providers/wise.adapter.ts (4 contracts + 1 ext).
// Coverage: ALL — Wise is a cross-border FX + payouts network.
// PARKED — feature flag `wise_enabled` defaults to false; the routing engine
// will not select Wise unless an admin flips the flag to true. All feature
// flags are false to reflect this.
// Separate sandbox + live base URLs. Auth: Bearer apiToken.
// Webhook signature: HMAC-SHA256 (Wise signs subscription notifications; the
// manifest expresses it through the closest available scheme in our union).

import type { ProviderManifest } from "../../manifest-registry";

export const wiseManifest: ProviderManifest = {
  provider: "wise",
  version: "1.0.0",
  displayName: "Wise",
  logoUrl: "https://wise.com/favicon.ico",
  website: "https://wise.com",
  countries: ["ALL"],
  currencies: ["USD", "GBP", "EUR", "NGN", "KES", "GHS"],
  capabilities: [
    {
      name: "INTERNATIONAL_TRANSFER",
      direction: "OUTBOUND",
      countries: ["ALL"],
      currencies: ["USD", "GBP", "EUR", "NGN", "KES", "GHS"],
    },
    {
      name: "EXCHANGE_RATE",
      direction: "INBOUND",
      countries: ["ALL"],
      currencies: ["USD", "GBP", "EUR", "NGN", "KES", "GHS"],
    },
    {
      name: "RECIPIENT",
      direction: "BOTH",
      countries: ["ALL"],
      currencies: ["USD", "GBP", "EUR", "NGN", "KES", "GHS"],
    },
    {
      name: "MULTI_CURRENCY_BALANCE",
      direction: "BOTH",
      countries: ["ALL"],
      currencies: ["USD", "GBP", "EUR", "NGN", "KES", "GHS"],
    },
  ],
  paymentMethods: [],
  supportsRefunds: false,
  supportsChargebacks: false,
  supportsVirtualAccounts: false,
  supportsTransfers: false,
  supportsSplitPayments: false,
  supportsRecurringBilling: false,
  supportsUSSD: false,
  supportsQR: false,
  supportsApplePay: false,
  supportsGooglePay: false,
  limits: {
    minAmount: { USD: 100, GBP: 100, EUR: 100, NGN: 100, KES: 100, GHS: 100 },
    maxAmount: { USD: 500000, GBP: 500000, EUR: 500000, NGN: 50000000, KES: 5000000, GHS: 500000 },
    dailyVolume: 100000000,
    monthlyVolume: 1000000000,
  },
  fees: {
    percentageBps: 80, // 0.8% on average corridor
    fixedFee: { USD: 0, GBP: 0, EUR: 0, NGN: 0, KES: 0, GHS: 0 },
    crossBorderBps: 80,
  },
  apiVersion: "v2",
  sandboxBaseUrl: "https://api.sandbox.transferwise.tech",
  liveBaseUrl: "https://api.wise.com",
  authType: "BEARER",
  webhookSupported: true,
  supportsSandbox: true,
  webhookSignatureScheme: "HMAC_SHA256",
  settlementCycle: "T_PLUS_2",
  healthCheckUrl: "https://api.wise.com/v1/profiles",
};
