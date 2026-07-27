// TurboCore manifest — Termii (SMS / WhatsApp / Voice / OTP).
//
// Source of truth: src/lib/turbocore/providers/termii.adapter.ts (2 contracts).
// Coverage: ALL — Termii is a global notification + OTP gateway.
// Single base URL for sandbox + live (mode keyed off the api_key).
// Auth: `api_key` in the request body (Termii's auth model is body-based, not
// header-based).
// Webhook: not supported — delivery status is read via GET /sms/{messageId}.

import type { ProviderManifest } from "../../manifest-registry";

export const termiiManifest: ProviderManifest = {
  provider: "termii",
  version: "1.0.0",
  displayName: "Termii SMS",
  logoUrl: "https://termii.com/favicon.ico",
  website: "https://termii.com",
  countries: ["ALL"],
  currencies: ["ALL"],
  capabilities: [
    { name: "NOTIFICATION", direction: "INBOUND", countries: ["ALL"], currencies: ["ALL"] },
    { name: "OTP", direction: "INBOUND", countries: ["ALL"], currencies: ["ALL"] },
  ],
  paymentMethods: [],
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
  sandboxBaseUrl: "https://api.termii.com/api",
  liveBaseUrl: "https://api.termii.com/api",
  authType: "API_KEY",
  webhookSupported: false,
  supportsSandbox: true,
  webhookSignatureScheme: "NONE",
  settlementCycle: "INSTANT",
  healthCheckUrl: "https://api.termii.com/api/sms/balance",
};
