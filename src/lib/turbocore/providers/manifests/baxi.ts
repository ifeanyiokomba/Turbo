// TurboCore manifest — Baxi (Interswitch).
//
// Source of truth: src/lib/turbocore/providers/baxi.adapter.ts (6 contracts).
// Coverage: NG only. Bill payments (electricity, cable TV, water, betting,
// insurance, internet) + airtime + data bundles. Single base URL for sandbox +
// live (mode keyed off the secret key being a test or live Bearer token).
// Auth: Bearer secretKey.
// Webhook: not supported — Baxi is a synchronous bill-payment API; delivery
// status is read via GET /transactions/{ref}.

import type { ProviderManifest } from "../../manifest-registry";

export const baxiManifest: ProviderManifest = {
  provider: "baxi",
  version: "1.0.0",
  displayName: "Baxi (Interswitch)",
  logoUrl: "https://baxibox.com/favicon.ico",
  website: "https://baxibox.com",
  countries: ["NG"],
  currencies: ["NGN"],
  capabilities: [
    { name: "BILL_PAYMENT", direction: "OUTBOUND", countries: ["NG"], currencies: ["NGN"] },
    { name: "AIRTIME", direction: "OUTBOUND", countries: ["NG"], currencies: ["NGN"] },
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
    minAmount: { NGN: 1000 },
    maxAmount: { NGN: 5000000 },
    dailyVolume: 50000000,
    monthlyVolume: 500000000,
  },
  fees: {
    percentageBps: 0,
    fixedFee: { NGN: 1000 },
    crossBorderBps: 0,
  },
  apiVersion: "v1",
  sandboxBaseUrl: "https://api.baxibox.com/v1",
  liveBaseUrl: "https://api.baxibox.com/v1",
  authType: "BEARER",
  webhookSupported: false,
  webhookSignatureScheme: "NONE",
  settlementCycle: "INSTANT",
  healthCheckUrl: "https://api.baxibox.com/v1",
};
