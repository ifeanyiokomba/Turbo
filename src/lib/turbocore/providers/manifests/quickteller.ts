// TurboCore manifest — Interswitch Quickteller.
//
// Source of truth: src/lib/turbocore/providers/quickteller.adapter.ts (5 contracts).
// Coverage: NG only. Bill payments + airtime + card tokenization (recurring
// billing on saved cards). Separate sandbox + live base URLs.
// Auth: clientId + secret + request-reference + HMAC-SHA-512 signature passed as
// the `Signature` header (hex). Signature base string:
//   `HTTP_METHOD&url_path&timestamp&nonce&clientId&secret`
// Webhook: not supported — Quickteller is request/response; the caller polls
// transaction status.

import type { ProviderManifest } from "../../manifest-registry";

export const quicktellerManifest: ProviderManifest = {
  provider: "quickteller",
  version: "1.0.0",
  displayName: "Quickteller",
  logoUrl: "https://quickteller.com/favicon.ico",
  website: "https://quickteller.com",
  countries: ["NG"],
  currencies: ["NGN"],
  capabilities: [
    { name: "BILL_PAYMENT", direction: "OUTBOUND", countries: ["NG"], currencies: ["NGN"] },
    { name: "AIRTIME", direction: "OUTBOUND", countries: ["NG"], currencies: ["NGN"] },
    { name: "CARD_TOKENIZATION", direction: "BOTH", countries: ["NG"], currencies: ["NGN"] },
  ],
  paymentMethods: ["CARD"],
  supportsRefunds: false,
  supportsChargebacks: false,
  supportsVirtualAccounts: false,
  supportsTransfers: false,
  supportsSplitPayments: false,
  supportsRecurringBilling: true, // via card tokenization
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
    fixedFee: { NGN: 1500 },
    crossBorderBps: 0,
  },
  apiVersion: "v2",
  sandboxBaseUrl: "https://sandbox.interswitchng.com/api/v2/quickteller",
  liveBaseUrl: "https://saturn.interswitchng.com/api/v2/quickteller",
  authType: "HMAC",
  webhookSupported: false,
  webhookSignatureScheme: "NONE",
  settlementCycle: "INSTANT",
  healthCheckUrl: "https://saturn.interswitchng.com/api/v2/quickteller",
};
