// TurboCore manifest — Stripe.
//
// Source of truth: src/lib/turbocore/providers/stripe.adapter.ts (9 contracts).
// Coverage: US, GB (+ all Stripe-supported countries for card payments).
// PARKED — feature flag `stripe_enabled` defaults to false; the routing engine
// will not select Stripe unless an admin flips the flag to true. All feature
// flags are false to reflect this.
// Single base URL for sandbox + live (mode keyed off `sk_test_` vs `sk_live_`).
// Auth: Bearer secretKey. Body is form-encoded.
// Webhook signature: HMAC-SHA256 (Stripe signs webhook payloads with the
// `Stripe-Signature` header, `t=…,v1=…` format).

import type { ProviderManifest } from "../../manifest-registry";

export const stripeManifest: ProviderManifest = {
  provider: "stripe",
  version: "1.0.0",
  displayName: "Stripe",
  logoUrl: "https://stripe.com/favicon.ico",
  website: "https://stripe.com",
  countries: ["US", "GB"],
  currencies: ["USD", "GBP"],
  capabilities: [
    { name: "CARD", direction: "INBOUND", countries: ["US", "GB"], currencies: ["USD", "GBP"] },
    {
      name: "VIRTUAL_CARD_ISSUER",
      direction: "BOTH",
      countries: ["US", "GB"],
      currencies: ["USD", "GBP"],
    },
    { name: "CUSTOMER", direction: "BOTH", countries: ["US", "GB"], currencies: ["USD", "GBP"] },
    {
      name: "SUBSCRIPTION",
      direction: "BOTH",
      countries: ["US", "GB"],
      currencies: ["USD", "GBP"],
    },
    { name: "PRODUCT", direction: "BOTH", countries: ["US", "GB"], currencies: ["USD", "GBP"] },
    { name: "PRICE", direction: "BOTH", countries: ["US", "GB"], currencies: ["USD", "GBP"] },
    { name: "PAYOUT", direction: "OUTBOUND", countries: ["US", "GB"], currencies: ["USD", "GBP"] },
    { name: "REFUND", direction: "OUTBOUND", countries: ["US", "GB"], currencies: ["USD", "GBP"] },
    {
      name: "WEBHOOK_ENDPOINT",
      direction: "BOTH",
      countries: ["US", "GB"],
      currencies: ["USD", "GBP"],
    },
  ],
  paymentMethods: ["CARD"],
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
    minAmount: { USD: 50, GBP: 50 },
    maxAmount: { USD: 1000000, GBP: 1000000 },
    dailyVolume: 100000000,
    monthlyVolume: 1000000000,
  },
  fees: {
    percentageBps: 290, // 2.9%
    fixedFee: { USD: 30, GBP: 20 }, // $0.30 / £0.20
    crossBorderBps: 390, // 3.9% cross-border
  },
  apiVersion: "2024-06-20",
  sandboxBaseUrl: "https://api.stripe.com/v1",
  liveBaseUrl: "https://api.stripe.com/v1",
  authType: "BEARER",
  webhookSupported: true,
  webhookSignatureScheme: "HMAC_SHA256",
  settlementCycle: "T_PLUS_2",
  healthCheckUrl: "https://api.stripe.com/v1/balance",
};
