// TurboCore — Airtel Money adapter.
//
// Implements 1 contract:
//   - airtelMoneyProvider (IMobileMoneyProvider)
//
// Covers: Uganda, Tanzania, Kenya, Rwanda, Nigeria (P2P), India.
//
// Base URLs:
//   live:    https://open.airtel.africa
//   uat:     https://openapiuat.airtel.africa
//
// Auth: POST /auth/oauth2/token with body { client_id, client_secret,
// grant_type: "client_credentials" } → access_token (valid 1h, cached 50min).
//
// Collect (STK push): POST /merchant/v1/payments/ with body:
//   { reference, subscriber: { country, currency, msisdn },
//     transaction: { amount, country, currency, id } }
// The subscriber receives an STK prompt.
//
// Disburse: POST /standard/v1/disbursements/
//
// getStatus: GET /standard/v1/payments/{paymentId} or /merchant/v1/payments/{paymentId}
//
// Secrets expected:
//   { "clientId": "...", "clientSecret": "...",
//     "callbackUrl": "https://yourapp/api/webhooks/turbocore/airtel_money" }

import { ok, fail } from "../result";
import type { IMobileMoneyProvider } from "../contracts";
import { requireCreds, loadCreds, http, defaultHttpError, sanitize, mockWarnOnce } from "./_shared";
import { randomUUID } from "crypto";

const CODE = "airtel_money";
const LIVE_BASE = "https://open.airtel.africa";
const UAT_BASE = "https://openapiuat.airtel.africa";

interface TokenCache {
  token: string;
  expiresAt: number;
}
let tokenCache: TokenCache | null = null;

async function getToken(creds: { secrets: Record<string, string>; sandbox: boolean }): Promise<string | null> {
  const clientId = creds.secrets.clientId;
  const clientSecret = creds.secrets.clientSecret;
  if (!clientId || !clientSecret) return null;
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const base = creds.sandbox ? UAT_BASE : LIVE_BASE;
  try {
    const { body } = await http(
      `${base}/auth/oauth2/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
      },
      (s, b) => defaultHttpError(CODE, s, b),
    );
    const data = body as { access_token?: string; expires_in?: string | number; token_type?: string };
    if (!data?.access_token) return null;
    const expiresIn = Number(data.expires_in ?? 3600);
    tokenCache = { token: data.access_token, expiresAt: Date.now() + expiresIn * 1000 };
    return data.access_token;
  } catch {
    return null;
  }
}

function bearerHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" };
}

export const airtelMoneyProvider: IMobileMoneyProvider = {
  contract: "MOBILE_MONEY",

  async getBalance(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ balanceMinor: 0, currency: "UGX" }, "mock", 50);
    }
    const token = await getToken(creds);
    if (!token) return fail("AUTH_FAILED", "Airtel Money token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? UAT_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/standard/v1/users/balance`,
        { method: "GET", headers: bearerHeaders(token) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = body as { data?: { balance?: string; currency?: string } };
      const bal = Number(data?.data?.balance ?? 0) * 100;
      return ok({ balanceMinor: Math.round(bal), currency: data?.data?.currency ?? "UGX" }, `airtel-bal-${Date.now()}`, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Airtel Money getBalance failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async collect(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `airtel-pay-${req.reference}`, status: "PENDING" }, "mock", 200);
    }
    const token = await getToken(creds);
    if (!token) return fail("AUTH_FAILED", "Airtel Money token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? UAT_BASE : LIVE_BASE;
    const paymentId = randomUUID();
    // Derive a 2-letter country code from currency (UGX→UG, TZS→TZ, KES→KE, NGN→NG, RWF→RW)
    const countryMap: Record<string, string> = { UGX: "UG", TZS: "TZ", KES: "KE", NGN: "NG", RWF: "RW", INR: "IN" };
    const country = countryMap[req.currency] ?? "UG";
    try {
      const { body } = await http(
        `${base}/merchant/v1/payments/`,
        {
          method: "POST",
          headers: bearerHeaders(token),
          body: JSON.stringify({
            reference: req.reference.slice(0, 32),
            subscriber: { country, currency: req.currency, msisdn: req.phone },
            transaction: {
              amount: Number((req.amountMinor / 100).toFixed(2)),
              country,
              currency: req.currency,
              id: paymentId,
            },
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = body as { status?: { success?: boolean; response_code?: string }; data?: { id?: string; status?: string } };
      const providerRef = data?.data?.id ?? paymentId;
      const st = String(data?.data?.status ?? "").toUpperCase();
      const status = st === "SUCCESS" || st === "SUCCESSFUL" ? "SUCCESS" : "PENDING";
      return ok({ providerRef, status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Airtel Money collect failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async disburse(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `airtel-disburse-${req.reference}`, status: "PENDING" }, "mock", 200);
    }
    const token = await getToken(creds);
    if (!token) return fail("AUTH_FAILED", "Airtel Money token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? UAT_BASE : LIVE_BASE;
    const paymentId = randomUUID();
    const countryMap: Record<string, string> = { UGX: "UG", TZS: "TZ", KES: "KE", NGN: "NG", RWF: "RW", INR: "IN" };
    const country = countryMap[req.currency] ?? "UG";
    try {
      const { body } = await http(
        `${base}/standard/v1/disbursements/`,
        {
          method: "POST",
          headers: bearerHeaders(token),
          body: JSON.stringify({
            reference: req.reference.slice(0, 32),
            subscriber: { country, currency: req.currency, msisdn: req.phone },
            transaction: {
              amount: Number((req.amountMinor / 100).toFixed(2)),
              country,
              currency: req.currency,
              id: paymentId,
            },
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = body as { data?: { id?: string; status?: string } };
      const providerRef = data?.data?.id ?? paymentId;
      const st = String(data?.data?.status ?? "").toUpperCase();
      const status = st === "SUCCESS" || st === "SUCCESSFUL" ? "SUCCESS" : "PENDING";
      return ok({ providerRef, status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Airtel Money disbursement failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async getStatus(providerRef) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "SUCCESS" }, "mock", 15);
    }
    const token = await getToken(creds);
    if (!token) return fail("AUTH_FAILED", "Airtel Money token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? UAT_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/standard/v1/payments/${providerRef}`,
        { method: "GET", headers: bearerHeaders(token) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = body as { data?: { transaction?: { status?: string } } };
      const st = String(data?.data?.transaction?.status ?? "").toUpperCase();
      const status = st === "SUCCESS" || st === "SUCCESSFUL" ? "SUCCESS" : st === "FAILED" ? "FAILED" : "PENDING";
      return ok({ status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Airtel Money status query failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};
