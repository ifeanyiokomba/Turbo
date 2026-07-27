// TurboCore manifest — M-Pesa (Safaricom, Kenya).
//
// Source of truth: src/lib/turbocore/providers/mpesa.adapter.ts (1 contract).
// Coverage: KE only. Mobile money STK-push collections + B2C disbursements.
// Separate sandbox + live base URLs. Auth: OAuth2 client-credentials with
// HTTP Basic (consumerKey:consumerSecret), token cached 50 min (TTL 60 min).
// Webhook signature: NONE — Safaricom does not HMAC-sign STK callbacks; the
// caller must validate via the CheckoutRequestID + short code instead.

import type { ProviderManifest } from "../../manifest-registry";

export const mpesaManifest: ProviderManifest = {
  provider: "mpesa",
  version: "1.0.0",
  displayName: "M-Pesa",
  logoUrl: "https://www.safaricom.co.ke/favicon.ico",
  website: "https://www.safaricom.co.ke/m-pesa",
  countries: ["KE"],
  currencies: ["KES"],
  capabilities: [
    { name: "MOBILE_MONEY", direction: "INBOUND", countries: ["KE"], currencies: ["KES"] },
    { name: "MOBILE_MONEY", direction: "OUTBOUND", countries: ["KE"], currencies: ["KES"] },
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
    minAmount: { KES: 1000 },
    maxAmount: { KES: 500000 },
    dailyVolume: 5000000,
    monthlyVolume: 50000000,
  },
  fees: {
    percentageBps: 0, // STK push is free for the merchant; Safaricom charges the subscriber
    fixedFee: { KES: 0 },
    crossBorderBps: 0,
  },
  apiVersion: "v1",
  sandboxBaseUrl: "https://sandbox.safaricom.co.ke",
  liveBaseUrl: "https://api.safaricom.co.ke",
  authType: "OAUTH2",
  webhookSupported: true,
  supportsSandbox: true,
  webhookSignatureScheme: "NONE",
  settlementCycle: "INSTANT",
  healthCheckUrl: "https://api.safaricom.co.ke/oauth/v1/generate",
};
