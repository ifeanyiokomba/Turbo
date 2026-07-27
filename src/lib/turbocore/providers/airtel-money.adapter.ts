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

async function getToken(creds: {
  secrets: Record<string, string>;
  sandbox: boolean;
}): Promise<string | null> {
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
      (s, b) => defaultHttpError(CODE, s, b)
    );
    const data = body as {
      access_token?: string;
      expires_in?: string | number;
      token_type?: string;
    };
    if (!data?.access_token) return null;
    const expiresIn = Number(data.expires_in ?? 3600);
    tokenCache = { token: data.access_token, expiresAt: Date.now() + expiresIn * 1000 };
    return data.access_token;
  } catch {
    return null;
  }
}

function bearerHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
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
    if (!token)
      return fail("AUTH_FAILED", "Airtel Money token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? UAT_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/standard/v1/users/balance`,
        { method: "GET", headers: bearerHeaders(token) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { data?: { balance?: string; currency?: string } };
      const bal = Number(data?.data?.balance ?? 0) * 100;
      return ok(
        { balanceMinor: Math.round(bal), currency: data?.data?.currency ?? "UGX" },
        `airtel-bal-${Date.now()}`,
        0
      );
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
    if (!token)
      return fail("AUTH_FAILED", "Airtel Money token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? UAT_BASE : LIVE_BASE;
    const paymentId = randomUUID();
    // Derive a 2-letter country code from currency (UGX→UG, TZS→TZ, KES→KE, NGN→NG, RWF→RW)
    const countryMap: Record<string, string> = {
      UGX: "UG",
      TZS: "TZ",
      KES: "KE",
      NGN: "NG",
      RWF: "RW",
      INR: "IN",
    };
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
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        status?: { success?: boolean; response_code?: string };
        data?: { id?: string; status?: string };
      };
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
      return ok(
        { providerRef: `airtel-disburse-${req.reference}`, status: "PENDING" },
        "mock",
        200
      );
    }
    const token = await getToken(creds);
    if (!token)
      return fail("AUTH_FAILED", "Airtel Money token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? UAT_BASE : LIVE_BASE;
    const paymentId = randomUUID();
    const countryMap: Record<string, string> = {
      UGX: "UG",
      TZS: "TZ",
      KES: "KE",
      NGN: "NG",
      RWF: "RW",
      INR: "IN",
    };
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
        (s, b) => defaultHttpError(CODE, s, b)
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
    if (!token)
      return fail("AUTH_FAILED", "Airtel Money token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? UAT_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/standard/v1/payments/${providerRef}`,
        { method: "GET", headers: bearerHeaders(token) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { data?: { transaction?: { status?: string } } };
      const st = String(data?.data?.transaction?.status ?? "").toUpperCase();
      const status =
        st === "SUCCESS" || st === "SUCCESSFUL"
          ? "SUCCESS"
          : st === "FAILED"
            ? "FAILED"
            : "PENDING";
      return ok({ status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Airtel Money status query failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  // ─── Deep methods ──────────────────────────────────────────────────────────

  /**
   * POST /merchant/v1/kyc/verify — verify the KYC of an Airtel customer.
   * Returns the customer's KYC level (e.g. "FULL_KYC", "LIMITED_KYC") and a
   * verified flag. Useful for Airtel-issued SIM KYC enrichment.
   */
  async verifyKyc(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ verified: true, kycLevel: "FULL_KYC", msisdn: req.msisdn }, "mock", 80);
    }
    const token = await getToken(creds);
    if (!token)
      return fail("AUTH_FAILED", "Airtel Money token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? UAT_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/merchant/v1/kyc/verify`,
        {
          method: "POST",
          headers: bearerHeaders(token),
          body: JSON.stringify({
            msisdn: req.msisdn,
            first_name: req.first_name ?? "",
            last_name: req.last_name ?? "",
            address: req.address ?? "",
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        status?: { success?: boolean; response_code?: string; code?: string };
        data?: { kyc_level?: string; is_verified?: boolean; msisdn?: string };
      };
      const verified = Boolean(data?.status?.success ?? data?.data?.is_verified ?? false);
      const kycLevel = data?.data?.kyc_level ?? (verified ? "FULL_KYC" : "UNVERIFIED");
      return ok(
        { verified, kycLevel, msisdn: data?.data?.msisdn ?? req.msisdn },
        `airtel-kyc-${req.msisdn}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Airtel Money KYC verification failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  /**
   * POST /merchant/v1/payments/:id/refund — refund a completed Airtel payment.
   * Full or partial refund; if refund_amountMinor is omitted, Airtel refunds
   * the full original amount.
   */
  async refundTransaction(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ refundId: `airtel-refund-${req.payment_id}`, status: "PENDING" }, "mock", 100);
    }
    const token = await getToken(creds);
    if (!token)
      return fail("AUTH_FAILED", "Airtel Money token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? UAT_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/merchant/v1/payments/${encodeURIComponent(req.payment_id)}/refund`,
        {
          method: "POST",
          headers: bearerHeaders(token),
          body: JSON.stringify({
            refund_amount:
              req.refund_amountMinor != null
                ? Number((req.refund_amountMinor / 100).toFixed(2))
                : undefined,
            reference: req.reference ?? `refund-${req.payment_id}`.slice(0, 32),
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        status?: { success?: boolean; response_code?: string };
        data?: { refund_id?: string; id?: string; status?: string };
      };
      const refundId = data?.data?.refund_id ?? data?.data?.id ?? `airtel-refund-${req.payment_id}`;
      const st = String(data?.data?.status ?? "").toUpperCase();
      const status =
        st === "SUCCESS" || st === "SUCCESSFUL"
          ? "SUCCESS"
          : st === "FAILED"
            ? "FAILED"
            : "PENDING";
      return ok({ refundId, status }, refundId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Airtel Money refund failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  /**
   * POST /merchant/v1/payments — merchant collect from customer (alternative
   * to the standard collect flow). This is the same endpoint as the existing
   * collect() but exposed via the deep method surface so it can be called
   * with the explicit { reference, subscriber, transaction } shape.
   */
  async merchantPayment(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: req.transaction.id, status: "PENDING" }, "mock", 200);
    }
    const token = await getToken(creds);
    if (!token)
      return fail("AUTH_FAILED", "Airtel Money token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? UAT_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/merchant/v1/payments`,
        {
          method: "POST",
          headers: bearerHeaders(token),
          body: JSON.stringify({
            reference: req.reference.slice(0, 32),
            subscriber: {
              country: req.subscriber.country,
              currency: req.subscriber.currency,
              msisdn: req.subscriber.msisdn,
            },
            transaction: {
              amount: Number((req.transaction.amountMinor / 100).toFixed(2)),
              country: req.transaction.country,
              currency: req.transaction.currency,
              id: req.transaction.id,
            },
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        status?: { success?: boolean; response_code?: string };
        data?: { id?: string; status?: string };
      };
      const providerRef = data?.data?.id ?? req.transaction.id;
      const st = String(data?.data?.status ?? "").toUpperCase();
      const status = st === "SUCCESS" || st === "SUCCESSFUL" ? "SUCCESS" : "PENDING";
      return ok({ providerRef, status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Airtel Money merchant payment failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  /**
   * GET /standard/v1/payments/:paymentId — deep transaction status query with
   * full response parsing. Returns the raw Airtel status, transaction id, and
   * amount alongside the normalized status.
   */
  async getTransactionStatus(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { status: "SUCCESS", conversationId: `airtel-tx-status-${req.transactionID}` },
        "mock",
        50
      );
    }
    const token = await getToken(creds);
    if (!token)
      return fail("AUTH_FAILED", "Airtel Money token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? UAT_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/standard/v1/payments/${encodeURIComponent(req.transactionID)}`,
        { method: "GET", headers: bearerHeaders(token) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      // Full response shape: { status: {...}, data: { transaction: { id, status, amount, currency, ... }, ... } }
      const data = body as {
        status?: { success?: boolean; response_code?: string; code?: string; result_code?: string };
        data?: {
          transaction?: {
            id?: string;
            status?: string;
            amount?: string | number;
            currency?: string;
            reference?: string;
          };
          payment?: { id?: string; status?: string; amount?: string | number };
        };
      };
      const txStatus = String(
        data?.data?.transaction?.status ?? data?.data?.payment?.status ?? ""
      ).toUpperCase();
      const status =
        txStatus === "SUCCESS" || txStatus === "SUCCESSFUL"
          ? "SUCCESS"
          : txStatus === "FAILED"
            ? "FAILED"
            : "PENDING";
      return ok(
        {
          status,
          conversationId:
            data?.data?.transaction?.id ?? data?.data?.payment?.id ?? req.transactionID,
          originatorConversationId: data?.data?.transaction?.reference,
        },
        req.transactionID,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Airtel Money deep transaction status failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  /**
   * GET /standard/v1/users/balance — deep account balance query that ensures
   * the currency is always returned alongside the balance. Mirrors the
   * existing getBalance() but is exposed via the deep method surface.
   */
  async getAccountBalance(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        {
          conversationId: `airtel-acct-bal-${req.partyA ?? "self"}`,
          responseCode: "0",
          responseDescription: "Mock balance query accepted",
          balanceMinor: 0,
          currency: "UGX",
        },
        "mock",
        50
      );
    }
    const token = await getToken(creds);
    if (!token)
      return fail("AUTH_FAILED", "Airtel Money token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? UAT_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/standard/v1/users/balance`,
        { method: "GET", headers: bearerHeaders(token) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        status?: { success?: boolean; response_code?: string };
        data?: { balance?: string | number; currency?: string };
      };
      const bal = Number(data?.data?.balance ?? 0) * 100;
      const currency = data?.data?.currency ?? "UGX";
      const responseCode = String(data?.status?.response_code ?? "0");
      return ok(
        {
          conversationId: `airtel-acct-bal-${Date.now()}`,
          responseCode,
          responseDescription:
            responseCode === "0" ? "Balance query accepted" : "Balance query failed",
          balanceMinor: Math.round(bal),
          currency,
        },
        `airtel-acct-bal-${Date.now()}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Airtel Money deep account balance failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};
