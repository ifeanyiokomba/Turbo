// TurboCore manifest — Airtel Money.
//
// Source of truth: src/lib/turbocore/providers/airtel-money.adapter.ts (1 contract).
// Coverage: UG, TZ, KE, RW, NG (P2P), IN. STK-push collections + disbursements.
// Live + UAT base URLs. Auth: OAuth2 client-credentials (client_id + client_secret
// posted to /auth/oauth2/token). Token cached 50 min (TTL 60 min).
// Webhook signature: NONE — Airtel posts the callback without HMAC signing.

import type { ProviderManifest } from "../../manifest-registry";

export const airtelMoneyManifest: ProviderManifest = {
  provider: "airtel_money",
  version: "1.0.0",
  displayName: "Airtel Money",
  logoUrl: "https://airtel.africa/favicon.ico",
  website: "https://airtel.africa",
  countries: ["UG", "TZ", "KE", "RW", "NG", "IN"],
  currencies: ["UGX", "TZS", "KES", "RWF", "NGN", "INR"],
  capabilities: [
    {
      name: "MOBILE_MONEY",
      direction: "INBOUND",
      countries: ["UG", "TZ", "KE", "RW", "NG", "IN"],
      currencies: ["UGX", "TZS", "KES", "RWF", "NGN", "INR"],
    },
    { name: "MOBILE_MONEY", direction: "OUTBOUND", countries: ["UG"], currencies: ["UGX"] },
  ],
  paymentMethods: ["MOBILE_MONEY"],
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
    minAmount: { UGX: 500, TZS: 500, KES: 1000, RWF: 100, NGN: 1000, INR: 100 },
    maxAmount: {
      UGX: 5000000,
      TZS: 5000000,
      KES: 500000,
      RWF: 5000000,
      NGN: 5000000,
      INR: 5000000,
    },
    dailyVolume: 50000000,
    monthlyVolume: 500000000,
  },
  fees: {
    percentageBps: 0,
    fixedFee: { UGX: 0, TZS: 0, KES: 0, RWF: 0, NGN: 0, INR: 0 },
    crossBorderBps: 0,
  },
  apiVersion: "v1",
  sandboxBaseUrl: "https://openapiuat.airtel.africa",
  liveBaseUrl: "https://open.airtel.africa",
  authType: "OAUTH2",
  webhookSupported: true,
  webhookSignatureScheme: "NONE",
  settlementCycle: "INSTANT",
  healthCheckUrl: "https://open.airtel.africa/auth/oauth2/token",
};
