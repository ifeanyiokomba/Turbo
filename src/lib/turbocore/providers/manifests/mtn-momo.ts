// TurboCore manifest — MTN MoMo (MTN Mobile Money).
//
// Source of truth: src/lib/turbocore/providers/mtn-momo.adapter.ts (1 contract).
// Coverage: UG, GH, RW, CI, ZM, CM. STK-push collections + disbursements.
// Separate sandbox + live base URLs. Auth: OAuth2 client-credentials with HTTP
// Basic (userId:apiKey) + `Ocp-Apim-Subscription-Key` header. Collect + disburse
// use separate token endpoints (cached 50 min).
// Webhook signature: NONE — MTN posts to the caller's callbackUrl without an
// HMAC; the caller polls `requesttopay/{referenceId}` to confirm final state.

import type { ProviderManifest } from "../../manifest-registry";

export const mtnMomoManifest: ProviderManifest = {
  provider: "mtn_momo",
  version: "1.0.0",
  displayName: "MTN MoMo",
  logoUrl: "https://momodeveloper.mtn.com/favicon.ico",
  website: "https://momodeveloper.mtn.com",
  countries: ["UG", "GH", "RW", "CI", "ZM", "CM"],
  currencies: ["UGX", "GHS", "RWF", "XOF", "ZMW", "XAF"],
  capabilities: [
    {
      name: "MOBILE_MONEY",
      direction: "INBOUND",
      countries: ["UG", "GH", "RW", "CI", "ZM", "CM"],
      currencies: ["UGX", "GHS", "RWF", "XOF", "ZMW", "XAF"],
    },
    {
      name: "MOBILE_MONEY",
      direction: "OUTBOUND",
      countries: ["UG", "GH"],
      currencies: ["UGX", "GHS"],
    },
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
    minAmount: { UGX: 500, GHS: 100, RWF: 100, XOF: 100, ZMW: 100, XAF: 100 },
    maxAmount: {
      UGX: 5000000,
      GHS: 2000000,
      RWF: 5000000,
      XOF: 5000000,
      ZMW: 5000000,
      XAF: 5000000,
    },
    dailyVolume: 50000000,
    monthlyVolume: 500000000,
  },
  fees: {
    percentageBps: 0,
    fixedFee: { UGX: 0, GHS: 0, RWF: 0, XOF: 0, ZMW: 0, XAF: 0 },
    crossBorderBps: 0,
  },
  apiVersion: "v1_0",
  sandboxBaseUrl: "https://sandbox.momodeveloper.mtn.com",
  liveBaseUrl: "https://momodeveloper.mtn.com",
  authType: "OAUTH2",
  webhookSupported: true,
  webhookSignatureScheme: "NONE",
  settlementCycle: "INSTANT",
  healthCheckUrl: "https://momodeveloper.mtn.com/collection/v1_0/requesttopay",
};
