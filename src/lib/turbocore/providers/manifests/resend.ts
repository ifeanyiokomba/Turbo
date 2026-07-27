// TurboCore manifest — Resend (transactional email).
//
// Source of truth: src/lib/turbocore/providers/resend.adapter.ts (1 contract).
// Coverage: ALL — Resend is a global transactional email gateway.
// Single base URL for sandbox + live (mode keyed off the api key being `re_…_test_…`).
// Auth: Bearer apiKey. User-Agent header is mandatory (Resend 403s without it).
// Webhook signature: HMAC-SHA256 (Resend signs webhook payloads with the
// `svix-*` header scheme).

import type { ProviderManifest } from "../../manifest-registry";

export const resendManifest: ProviderManifest = {
  provider: "resend",
  version: "1.0.0",
  displayName: "Resend Email",
  logoUrl: "https://resend.com/favicon.ico",
  website: "https://resend.com",
  countries: ["ALL"],
  currencies: ["ALL"],
  capabilities: [
    { name: "NOTIFICATION", direction: "INBOUND", countries: ["ALL"], currencies: ["ALL"] },
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
  sandboxBaseUrl: "https://api.resend.com",
  liveBaseUrl: "https://api.resend.com",
  authType: "BEARER",
  webhookSupported: true,
  webhookSignatureScheme: "HMAC_SHA256",
  settlementCycle: "INSTANT",
  healthCheckUrl: "https://api.resend.com/domains",
};
