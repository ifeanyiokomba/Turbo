// TurboCore manifest — Paga.
//
// Source of truth: src/lib/turbocore/providers/paga.adapter.ts (7 contracts).
// Coverage: NG only. Mobile money + bills + bank transfers + airtime + merchant
// payments. Separate staging + live base URLs.
// Auth: HMAC-SHA512 signature over the request body with the secret key, sent as
// the `X-Paga-Auth` header + `apiKey` header.
// Webhook signature: HMAC-SHA512 (same scheme as request signing).

import type { ProviderManifest } from "../../manifest-registry";

export const pagaManifest: ProviderManifest = {
  provider: "paga",
  version: "1.0.0",
  displayName: "Paga",
  logoUrl: "https://www.mypaga.com/favicon.ico",
  website: "https://www.mypaga.com",
  countries: ["NG"],
  currencies: ["NGN"],
  capabilities: [
    { name: "MOBILE_MONEY", direction: "INBOUND", countries: ["NG"], currencies: ["NGN"] },
    { name: "MOBILE_MONEY", direction: "OUTBOUND", countries: ["NG"], currencies: ["NGN"] },
    { name: "BILL_PAYMENT", direction: "OUTBOUND", countries: ["NG"], currencies: ["NGN"] },
    { name: "BANK_TRANSFER", direction: "OUTBOUND", countries: ["NG"], currencies: ["NGN"] },
    { name: "AIRTIME", direction: "OUTBOUND", countries: ["NG"], currencies: ["NGN"] },
    { name: "MERCHANT_PAYMENT", direction: "INBOUND", countries: ["NG"], currencies: ["NGN"] },
  ],
  paymentMethods: ["MOBILE_MONEY", "BANK_TRANSFER", "WALLET"],
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
    fixedFee: { NGN: 1000 },
    crossBorderBps: 0,
  },
  apiVersion: "v1",
  sandboxBaseUrl: "https://qa1.mypaga.com/pagawebservices/rest/paga/servlets/transaction",
  liveBaseUrl: "https://www.mypaga.com/pagawebservices/rest/paga/servlets/transaction",
  authType: "HMAC",
  webhookSupported: true,
  supportsSandbox: true,
  webhookSignatureScheme: "HMAC_SHA512",
  settlementCycle: "INSTANT",
  healthCheckUrl: "https://www.mypaga.com/pagawebservices/rest/paga/servlets/transaction",
};
