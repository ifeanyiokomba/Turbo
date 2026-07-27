// TurboCore manifest — Flutterwave.
//
// Source of truth: src/lib/turbocore/providers/flutterwave.adapter.ts (10 contracts).
// Coverage: NG, KE, GH (+ international USD transfers from NG).
// Single base URL for sandbox + live (mode keyed off `FLWTEST-` prefix on key).
// Webhook signature: HMAC-SHA256 over the body with the secret key
// (Flutterwave recommends verifying `verif-hash` against your secret hash).

import type { ProviderManifest } from "../../manifest-registry";

export const flutterwaveManifest: ProviderManifest = {
  provider: "flutterwave",
  version: "1.0.0",
  displayName: "Flutterwave",
  logoUrl: "https://flutterwave.com/favicon.ico",
  website: "https://flutterwave.com",
  countries: ["NG", "KE", "GH"],
  currencies: ["NGN", "KES", "GHS", "USD"],
  capabilities: [
    {
      name: "CARD",
      direction: "INBOUND",
      countries: ["NG", "KE", "GH"],
      currencies: ["NGN", "KES", "GHS", "USD"],
    },
    {
      name: "BANK_TRANSFER",
      direction: "OUTBOUND",
      countries: ["NG", "KE", "GH"],
      currencies: ["NGN", "KES", "GHS"],
    },
    {
      name: "INTERNATIONAL_TRANSFER",
      direction: "OUTBOUND",
      countries: ["NG"],
      currencies: ["USD"],
    },
    {
      name: "MOBILE_MONEY",
      direction: "INBOUND",
      countries: ["KE", "GH"],
      currencies: ["KES", "GHS"],
    },
    {
      name: "SUBACCOUNT",
      direction: "BOTH",
      countries: ["NG", "KE", "GH"],
      currencies: ["NGN", "KES", "GHS"],
    },
    {
      name: "SUBSCRIPTION",
      direction: "BOTH",
      countries: ["NG", "KE", "GH"],
      currencies: ["NGN", "KES", "GHS"],
    },
    {
      name: "VIRTUAL_CARD",
      direction: "BOTH",
      countries: ["NG", "KE", "GH"],
      currencies: ["NGN", "KES", "GHS", "USD"],
    },
    {
      name: "BULK_TRANSFER",
      direction: "OUTBOUND",
      countries: ["NG", "KE", "GH"],
      currencies: ["NGN", "KES", "GHS"],
    },
    {
      name: "BILL_PAYMENT",
      direction: "OUTBOUND",
      countries: ["NG", "KE", "GH"],
      currencies: ["NGN", "KES", "GHS"],
    },
    {
      name: "CHARGEBACK",
      direction: "OUTBOUND",
      countries: ["NG", "KE", "GH"],
      currencies: ["NGN", "KES", "GHS"],
    },
  ],
  paymentMethods: ["CARD", "BANK_TRANSFER", "MOBILE_MONEY", "VIRTUAL_ACCOUNT"],
  supportsRefunds: true,
  supportsChargebacks: true,
  supportsVirtualAccounts: true,
  supportsTransfers: true,
  supportsSplitPayments: true,
  supportsRecurringBilling: true,
  supportsUSSD: false,
  supportsQR: false,
  supportsApplePay: false,
  supportsGooglePay: false,
  limits: {
    minAmount: { NGN: 10000, KES: 1000, GHS: 100, USD: 100 },
    maxAmount: { NGN: 5000000, KES: 500000, GHS: 50000, USD: 100000 },
    dailyVolume: 50000000,
    monthlyVolume: 500000000,
  },
  fees: {
    percentageBps: 140, // 1.4% local card
    fixedFee: { NGN: 0, KES: 0, GHS: 0, USD: 0 },
    crossBorderBps: 380, // 3.8% cross-border
  },
  apiVersion: "v3",
  sandboxBaseUrl: "https://api.flutterwave.com/v3",
  liveBaseUrl: "https://api.flutterwave.com/v3",
  authType: "BEARER",
  webhookSupported: true,
  webhookSignatureScheme: "HMAC_SHA256",
  settlementCycle: "T_PLUS_1",
  healthCheckUrl: "https://api.flutterwave.com/v3/transfers/fee",
};
