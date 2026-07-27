// TurboCore manifest — Remita (RRR bill-payment flow).
//
// Source of truth: src/lib/turbocore/providers/remita.adapter.ts (4 contracts).
// Coverage: NG only. RRR (Remita Retrieval Reference) flow for government +
// biller payments, plus direct-debit mandates. Separate sandbox + live base URLs.
// Auth: merchantId + apiKey + apiToken headers.
// Webhook signature: HMAC-SHA512 (Remita signs notification payloads).

import type { ProviderManifest } from "../../manifest-registry";

export const remitaManifest: ProviderManifest = {
  provider: "remita",
  version: "1.0.0",
  displayName: "Remita",
  logoUrl: "https://www.remita.net/favicon.ico",
  website: "https://www.remita.net",
  countries: ["NG"],
  currencies: ["NGN"],
  capabilities: [
    { name: "BILL_PAYMENT", direction: "OUTBOUND", countries: ["NG"], currencies: ["NGN"] },
    { name: "DIRECT_DEBIT", direction: "OUTBOUND", countries: ["NG"], currencies: ["NGN"] },
    { name: "MANDATE", direction: "BOTH", countries: ["NG"], currencies: ["NGN"] },
  ],
  paymentMethods: [],
  supportsRefunds: false,
  supportsChargebacks: false,
  supportsVirtualAccounts: false,
  supportsTransfers: false,
  supportsSplitPayments: false,
  supportsRecurringBilling: true, // direct-debit mandates
  supportsUSSD: false,
  supportsQR: false,
  supportsApplePay: false,
  supportsGooglePay: false,
  limits: {
    minAmount: { NGN: 1000 },
    maxAmount: { NGN: 10000000 },
    dailyVolume: 100000000,
    monthlyVolume: 1000000000,
  },
  fees: {
    percentageBps: 0,
    fixedFee: { NGN: 2500 },
    crossBorderBps: 0,
  },
  apiVersion: "v1",
  sandboxBaseUrl: "https://remita-demo.net/api/v1",
  liveBaseUrl: "https://remita.net/api/v1",
  authType: "API_KEY",
  webhookSupported: true,
  supportsSandbox: true,
  webhookSignatureScheme: "HMAC_SHA512",
  settlementCycle: "INSTANT",
  healthCheckUrl: "https://remita.net/api/v1",
};
