// TurboCore manifest — Paystack.
//
// Source of truth: src/lib/turbocore/providers/paystack.adapter.ts (12 contracts).
// Coverage: NG, GH, KE, ZA. Single base URL for sandbox + live (mode keyed off
// whether the secret key starts with `sk_test_` or `sk_live_`).
// Webhook signature: HMAC-SHA512 over the raw body with the secret key.
// Settlement: T+1 (next business day after collection).

import type { ProviderManifest } from "../../manifest-registry";

export const paystackManifest: ProviderManifest = {
  provider: "paystack",
  version: "1.0.0",
  displayName: "Paystack",
  logoUrl: "https://paystack.com/favicon.ico",
  website: "https://paystack.com",
  countries: ["NG", "GH", "KE", "ZA"],
  currencies: ["NGN", "GHS", "KES", "ZAR", "USD"],
  capabilities: [
    {
      name: "CARD",
      direction: "INBOUND",
      countries: ["NG", "GH", "KE", "ZA"],
      currencies: ["NGN", "GHS", "KES", "ZAR"],
    },
    {
      name: "BANK_TRANSFER",
      direction: "OUTBOUND",
      countries: ["NG", "GH", "ZA"],
      currencies: ["NGN", "GHS", "ZAR"],
    },
    {
      name: "VIRTUAL_ACCOUNT",
      direction: "INBOUND",
      countries: ["NG", "GH"],
      currencies: ["NGN", "GHS"],
    },
    {
      name: "KYC",
      direction: "INBOUND",
      countries: ["NG", "GH", "KE", "ZA"],
      currencies: ["NGN", "GHS", "KES", "ZAR"],
    },
    {
      name: "SUBACCOUNT",
      direction: "BOTH",
      countries: ["NG", "GH", "KE", "ZA"],
      currencies: ["NGN", "GHS", "KES", "ZAR"],
    },
    {
      name: "SUBSCRIPTION",
      direction: "BOTH",
      countries: ["NG", "GH", "KE", "ZA"],
      currencies: ["NGN", "GHS", "KES", "ZAR"],
    },
    {
      name: "REFUND",
      direction: "OUTBOUND",
      countries: ["NG", "GH", "KE", "ZA"],
      currencies: ["NGN", "GHS", "KES", "ZAR"],
    },
    {
      name: "PAYMENT_PAGE",
      direction: "INBOUND",
      countries: ["NG", "GH", "KE", "ZA"],
      currencies: ["NGN", "GHS", "KES", "ZAR"],
    },
    {
      name: "SETTLEMENT",
      direction: "OUTBOUND",
      countries: ["NG", "GH", "KE", "ZA"],
      currencies: ["NGN", "GHS", "KES", "ZAR"],
    },
    { name: "USSD", direction: "INBOUND", countries: ["NG"], currencies: ["NGN"] },
    {
      name: "APPLE_PAY",
      direction: "INBOUND",
      countries: ["NG", "GH", "KE", "ZA"],
      currencies: ["NGN", "GHS", "KES", "ZAR"],
    },
  ],
  paymentMethods: ["CARD", "BANK_TRANSFER", "VIRTUAL_ACCOUNT", "USSD", "APPLE_PAY"],
  supportsRefunds: true,
  supportsChargebacks: true,
  supportsVirtualAccounts: true,
  supportsTransfers: true,
  supportsSplitPayments: true,
  supportsRecurringBilling: true,
  supportsUSSD: true,
  supportsQR: false,
  supportsApplePay: true,
  supportsGooglePay: false,
  limits: {
    minAmount: { NGN: 10000, GHS: 100, KES: 100, ZAR: 100 },
    maxAmount: { NGN: 5000000, GHS: 50000, KES: 500000, ZAR: 500000 },
    dailyVolume: 50000000,
    monthlyVolume: 500000000,
  },
  fees: {
    percentageBps: 180, // 1.8% local
    fixedFee: { NGN: 100, GHS: 1, KES: 10, ZAR: 10 },
    crossBorderBps: 390, // 3.9% cross-border
  },
  apiVersion: "2024-01",
  sandboxBaseUrl: "https://api.paystack.co",
  liveBaseUrl: "https://api.paystack.co",
  authType: "BEARER",
  webhookSupported: true,
  supportsSandbox: true,
  webhookSignatureScheme: "HMAC_SHA512",
  settlementCycle: "T_PLUS_1",
  healthCheckUrl: "https://api.paystack.co/transaction/export",
};
