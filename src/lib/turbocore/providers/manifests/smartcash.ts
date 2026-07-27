// TurboCore manifest — Smartcash PSB (Airtel Nigeria).
//
// Source of truth: src/lib/turbocore/providers/smartcash.adapter.ts (4 contracts).
// Coverage: NG only. Wallet collections + disbursements + bank transfers + airtime
// + bill payments. Separate sandbox + live base URLs.
// Auth: Bearer apiKey + `X-Merchant-Id` header.
// Webhook signature: NONE — Smartcash posts callbacks without HMAC signing.

import type { ProviderManifest } from "../../manifest-registry";

export const smartcashManifest: ProviderManifest = {
  provider: "smartcash",
  version: "1.0.0",
  displayName: "Smartcash PSB",
  logoUrl: "https://smartcashpsb.ng/favicon.ico",
  website: "https://smartcashpsb.ng",
  countries: ["NG"],
  currencies: ["NGN"],
  capabilities: [
    { name: "MOBILE_MONEY", direction: "INBOUND", countries: ["NG"], currencies: ["NGN"] },
    { name: "MOBILE_MONEY", direction: "OUTBOUND", countries: ["NG"], currencies: ["NGN"] },
    { name: "BANK_TRANSFER", direction: "OUTBOUND", countries: ["NG"], currencies: ["NGN"] },
    { name: "AIRTIME", direction: "OUTBOUND", countries: ["NG"], currencies: ["NGN"] },
    { name: "BILL_PAYMENT", direction: "OUTBOUND", countries: ["NG"], currencies: ["NGN"] },
  ],
  paymentMethods: ["MOBILE_MONEY", "BANK_TRANSFER"],
  supportsRefunds: false,
  supportsChargebacks: false,
  supportsVirtualAccounts: false,
  supportsTransfers: true,
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
    fixedFee: { NGN: 0 },
    crossBorderBps: 0,
  },
  apiVersion: "v1",
  sandboxBaseUrl: "https://sandbox.api.smartcashpsb.ng",
  liveBaseUrl: "https://api.smartcashpsb.ng",
  authType: "API_KEY",
  webhookSupported: true,
  webhookSignatureScheme: "NONE",
  settlementCycle: "INSTANT",
  healthCheckUrl: "https://api.smartcashpsb.ng/v1/transactions",
};
