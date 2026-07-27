// TurboCore manifest — Dojah KYC.
//
// Source of truth: src/lib/turbocore/providers/dojah.adapter.ts (4 contracts).
// Coverage: NG, KE, GH, ZA — Dojah's KYC surface spans the BVN/NIN (NG),
// KRA PIN (KE), Ghana Card (GH) and SA ID (ZA) registries.
// Currency-agnostic — capabilities are listed under the local fiat currency
// purely so the matrix filters behave.
// Single base URL for sandbox + live (sandbox keyed off the AppId).
// Auth: custom `AppId` + `PrivateKey` headers.
// Webhook: not supported — Dojah is a synchronous verification API.

import type { ProviderManifest } from "../../manifest-registry";

export const dojahManifest: ProviderManifest = {
  provider: "dojah",
  version: "1.0.0",
  displayName: "Dojah KYC",
  logoUrl: "https://dojah.co/favicon.ico",
  website: "https://dojah.co",
  countries: ["NG", "KE", "GH", "ZA"],
  currencies: ["NGN", "KES", "GHS", "ZAR"],
  capabilities: [
    {
      name: "KYC",
      direction: "INBOUND",
      countries: ["NG", "KE", "GH", "ZA"],
      currencies: ["NGN", "KES", "GHS", "ZAR"],
    },
    {
      name: "AML",
      direction: "INBOUND",
      countries: ["NG", "KE", "GH", "ZA"],
      currencies: ["NGN", "KES", "GHS", "ZAR"],
    },
    {
      name: "FRAUD_SCREENING",
      direction: "INBOUND",
      countries: ["NG", "KE", "GH", "ZA"],
      currencies: ["NGN", "KES", "GHS", "ZAR"],
    },
    {
      name: "BUSINESS_KYC",
      direction: "INBOUND",
      countries: ["NG", "KE", "GH", "ZA"],
      currencies: ["NGN", "KES", "GHS", "ZAR"],
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
    minAmount: { NGN: 0, KES: 0, GHS: 0, ZAR: 0 },
    maxAmount: { NGN: 0, KES: 0, GHS: 0, ZAR: 0 },
    dailyVolume: 0,
    monthlyVolume: 0,
  },
  fees: {
    percentageBps: 0,
    fixedFee: { NGN: 0, KES: 0, GHS: 0, ZAR: 0 },
    crossBorderBps: 0,
  },
  apiVersion: "v1",
  sandboxBaseUrl: "https://api.dojah.co/api/v1",
  liveBaseUrl: "https://api.dojah.co/api/v1",
  authType: "API_KEY",
  webhookSupported: false,
  supportsSandbox: true,
  webhookSignatureScheme: "NONE",
  settlementCycle: "INSTANT",
  healthCheckUrl: "https://api.dojah.co/api/v1",
};
