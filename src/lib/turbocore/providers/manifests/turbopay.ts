// TurboCore manifest — Turbopay mock provider.
//
// Source of truth: src/lib/turbocore/providers/turbopay.adapter.ts (11 contracts).
// This is the in-process sandbox/fallback provider used when no real provider
// is configured, and for development. Coverage + currencies are "ALL" and the
// capabilities list spans every contract the platform understands so the
// capability matrix always returns at least one candidate per request.
// Webhook: not supported — the mock provider resolves inline.

import type { ProviderManifest } from "../../manifest-registry";

export const turbopayManifest: ProviderManifest = {
  provider: "turbopay",
  version: "1.0.0",
  displayName: "Turbopay (Demo)",
  logoUrl: "https://turbopay.ng/favicon.ico",
  website: "https://turbopay.ng",
  countries: ["ALL"],
  currencies: ["ALL"],
  capabilities: [
    { name: "CARD", direction: "INBOUND", countries: ["ALL"], currencies: ["ALL"] },
    { name: "BANK_TRANSFER", direction: "OUTBOUND", countries: ["ALL"], currencies: ["ALL"] },
    { name: "VIRTUAL_ACCOUNT", direction: "INBOUND", countries: ["ALL"], currencies: ["ALL"] },
    { name: "MOBILE_MONEY", direction: "INBOUND", countries: ["ALL"], currencies: ["ALL"] },
    { name: "MOBILE_MONEY", direction: "OUTBOUND", countries: ["ALL"], currencies: ["ALL"] },
    { name: "BILL_PAYMENT", direction: "OUTBOUND", countries: ["ALL"], currencies: ["ALL"] },
    { name: "AIRTIME", direction: "OUTBOUND", countries: ["ALL"], currencies: ["ALL"] },
    { name: "KYC", direction: "INBOUND", countries: ["ALL"], currencies: ["ALL"] },
    {
      name: "INTERNATIONAL_TRANSFER",
      direction: "OUTBOUND",
      countries: ["ALL"],
      currencies: ["ALL"],
    },
    { name: "EXCHANGE_RATE", direction: "INBOUND", countries: ["ALL"], currencies: ["ALL"] },
    { name: "VIRTUAL_CARD_ISSUER", direction: "INBOUND", countries: ["ALL"], currencies: ["ALL"] },
    { name: "NOTIFICATION", direction: "INBOUND", countries: ["ALL"], currencies: ["ALL"] },
  ],
  paymentMethods: ["CARD", "BANK_TRANSFER", "VIRTUAL_ACCOUNT", "MOBILE_MONEY"],
  supportsRefunds: true,
  supportsChargebacks: true,
  supportsVirtualAccounts: true,
  supportsTransfers: true,
  supportsSplitPayments: true,
  supportsRecurringBilling: true,
  supportsUSSD: true,
  supportsQR: true,
  supportsApplePay: true,
  supportsGooglePay: true,
  limits: {
    minAmount: {},
    maxAmount: {},
    dailyVolume: 0,
    monthlyVolume: 0,
  },
  fees: {
    percentageBps: 0,
    fixedFee: {},
    crossBorderBps: 0,
  },
  apiVersion: "v1",
  sandboxBaseUrl: "https://turbopay.ng/api",
  liveBaseUrl: "https://turbopay.ng/api",
  authType: "BEARER",
  webhookSupported: false,
  supportsSandbox: true,
  webhookSignatureScheme: "NONE",
  settlementCycle: "INSTANT",
  healthCheckUrl: "https://turbopay.ng/api/health",
};
