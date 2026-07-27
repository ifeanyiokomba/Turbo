// TurboCore manifest — Monnify (a Flutterwave-backed Nigerian PSP).
//
// Source of truth: src/lib/turbocore/providers/monnify.adapter.ts (6 contracts).
// Coverage: NG only. Specialises in reserved virtual accounts + invoice flows.
// Separate sandbox + live base URLs. Auth: HTTP Basic (apiKey:clientSecret)
// exchanged for a 30-minute JWT access_token, used as `Bearer ${token}`.
// Webhook signature: HMAC-SHA512 over the body with the client secret.

import type { ProviderManifest } from "../../manifest-registry";

export const monnifyManifest: ProviderManifest = {
  provider: "monnify",
  version: "1.0.0",
  displayName: "Monnify",
  logoUrl: "https://monnify.com/favicon.ico",
  website: "https://monnify.com",
  countries: ["NG"],
  currencies: ["NGN"],
  capabilities: [
    { name: "VIRTUAL_ACCOUNT", direction: "INBOUND", countries: ["NG"], currencies: ["NGN"] },
    { name: "CARD", direction: "INBOUND", countries: ["NG"], currencies: ["NGN"] },
    { name: "SUBACCOUNT", direction: "BOTH", countries: ["NG"], currencies: ["NGN"] },
    { name: "INVOICE", direction: "BOTH", countries: ["NG"], currencies: ["NGN"] },
    { name: "DIRECT_DEBIT", direction: "OUTBOUND", countries: ["NG"], currencies: ["NGN"] },
  ],
  paymentMethods: ["CARD", "VIRTUAL_ACCOUNT", "BANK_TRANSFER"],
  supportsRefunds: true,
  supportsChargebacks: false,
  supportsVirtualAccounts: true,
  supportsTransfers: true,
  supportsSplitPayments: true,
  supportsRecurringBilling: true,
  supportsUSSD: false,
  supportsQR: false,
  supportsApplePay: false,
  supportsGooglePay: false,
  limits: {
    minAmount: { NGN: 100 },
    maxAmount: { NGN: 5000000 },
    dailyVolume: 50000000,
    monthlyVolume: 500000000,
  },
  fees: {
    percentageBps: 150, // 1.5%
    fixedFee: { NGN: 0 },
    crossBorderBps: 0,
  },
  apiVersion: "v1",
  sandboxBaseUrl: "https://sandbox.monnify.com/api/v1",
  liveBaseUrl: "https://api.monnify.com/v1",
  authType: "BASIC",
  webhookSupported: true,
  webhookSignatureScheme: "HMAC_SHA512",
  settlementCycle: "T_PLUS_1",
  healthCheckUrl: "https://api.monnify.com/v1/auth/login",
};
