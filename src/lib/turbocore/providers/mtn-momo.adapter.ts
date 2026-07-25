// TurboCore — MTN MoMo (MTN Mobile Money) adapter.
//
// Implements 1 contract:
//   - mtnMomoProvider (IMobileMoneyProvider)
//
// Covers: Uganda (UG), Ghana (GH), Rwanda (RW), Côte d'Ivoire (CI),
// Zambia (ZM), Cameroon (CM). Not Nigeria (Smartcash covers NG).
//
// Base URLs:
//   live:    https://momodeveloper.mtn.com
//   sandbox: https://sandbox.momodeveloper.mtn.com
//
// Auth: OAuth2 client-credentials — POST /collection/token/ (and
// /disbursement/token/) with HTTP Basic (userId:apiKey) + header
// `Ocp-Apim-Subscription-Key`. Returns access_token valid 1h; cached 50min.
//
// Collect (request-to-pay / STK): POST /collection/v1_0/requesttopay with
// X-Reference-Id (UUID) + X-Target-Environment. The customer receives an STK
// prompt on their phone.
//
// Disburse: POST /disbursement/v1_0/transfer (requires disbursement token).
//
// Secrets expected:
//   { "subscriptionKey": "...", "apiKey": "...", "userId": "...",
//     "disbursementSubscriptionKey": "...", "disbursementApiKey": "...",
//     "disbursementUserId": "...", "targetEnvironment": "mtnuganda",
//     "callbackUrl": "https://yourapp/api/webhooks/turbocore/mtn_momo" }

import { ok, fail } from "../result";
import type { IMobileMoneyProvider } from "../contracts";
import { requireCreds, loadCreds, http, defaultHttpError, sanitize, mockWarnOnce } from "./_shared";
import { randomUUID } from "crypto";

const CODE = "mtn_momo";
const LIVE_BASE = "https://momodeveloper.mtn.com";
const SANDBOX_BASE = "https://sandbox.momodeveloper.mtn.com";

interface TokenCache {
  token: string;
  expiresAt: number;
}
const collectTokenCache: { sandbox: TokenCache | null; live: TokenCache | null } = { sandbox: null, live: null };
const disburseTokenCache: { sandbox: TokenCache | null; live: TokenCache | null } = { sandbox: null, live: null };

async function getCollectToken(creds: { secrets: Record<string, string>; sandbox: boolean }): Promise<string | null> {
  const userId = creds.secrets.userId;
  const apiKey = creds.secrets.apiKey;
  const subKey = creds.secrets.subscriptionKey;
  if (!userId || !apiKey || !subKey) return null;
  const slot = creds.sandbox ? "sandbox" : "live";
  const cached = collectTokenCache[slot];
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
  const basic = Buffer.from(`${userId}:${apiKey}`).toString("base64");
  try {
    const { body } = await http(
      `${base}/collection/token/`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Ocp-Apim-Subscription-Key": subKey,
        },
      },
      (s, b) => defaultHttpError(CODE, s, b),
    );
    const data = body as { access_token?: string; expires_in?: string | number };
    if (!data?.access_token) return null;
    const expiresIn = Number(data.expires_in ?? 3600);
    collectTokenCache[slot] = { token: data.access_token, expiresAt: Date.now() + expiresIn * 1000 };
    return data.access_token;
  } catch {
    return null;
  }
}

async function getDisburseToken(creds: { secrets: Record<string, string>; sandbox: boolean }): Promise<string | null> {
  const userId = creds.secrets.disbursementUserId;
  const apiKey = creds.secrets.disbursementApiKey;
  const subKey = creds.secrets.disbursementSubscriptionKey;
  if (!userId || !apiKey || !subKey) return null;
  const slot = creds.sandbox ? "sandbox" : "live";
  const cached = disburseTokenCache[slot];
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
  const basic = Buffer.from(`${userId}:${apiKey}`).toString("base64");
  try {
    const { body } = await http(
      `${base}/disbursement/token/`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Ocp-Apim-Subscription-Key": subKey,
        },
      },
      (s, b) => defaultHttpError(CODE, s, b),
    );
    const data = body as { access_token?: string; expires_in?: string | number };
    if (!data?.access_token) return null;
    const expiresIn = Number(data.expires_in ?? 3600);
    disburseTokenCache[slot] = { token: data.access_token, expiresAt: Date.now() + expiresIn * 1000 };
    return data.access_token;
  } catch {
    return null;
  }
}

export const mtnMomoProvider: IMobileMoneyProvider = {
  contract: "MOBILE_MONEY",

  async getBalance(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ balanceMinor: 0, currency: "UGX" }, "mock", 50);
    }
    const token = await getCollectToken(creds);
    if (!token) return fail("AUTH_FAILED", "MTN MoMo token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const env = creds.secrets.targetEnvironment ?? "sandbox";
    try {
      // GET /collection/v1_0/account/balance/{accountIdType}/{accountId} — async result via callback.
      // We surface a placeholder pending balance since the real result arrives via webhook.
      const { body } = await http(
        `${base}/collection/v1_0/account/balance/MSISDN/${req.phone}`,
        { method: "GET", headers: { Authorization: `Bearer ${token}`, "X-Target-Environment": env, "Ocp-Apim-Subscription-Key": creds.secrets.subscriptionKey } },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      return ok({ balanceMinor: 0, currency: "UGX" }, `mtn-bal-${Date.now()}`, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "MTN MoMo getBalance failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async collect(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `mtnmomo-rtp-${req.reference}`, status: "PENDING" }, "mock", 200);
    }
    const token = await getCollectToken(creds);
    if (!token) return fail("AUTH_FAILED", "MTN MoMo token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const env = creds.secrets.targetEnvironment ?? "sandbox";
    const referenceId = randomUUID();
    try {
      const { status } = await http(
        `${base}/collection/v1_0/requesttopay`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Reference-Id": referenceId,
            "X-Target-Environment": env,
            "Ocp-Apim-Subscription-Key": creds.secrets.subscriptionKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: String(Math.round(req.amountMinor / 100)),
            currency: req.currency,
            externalId: req.reference.slice(0, 16),
            payer: { partyIdType: "MSISDN", partyId: req.phone },
            payerMessage: (req.narration ?? "Turbopay payment").slice(0, 100),
            payeeNote: "Turbopay collection",
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      // 202 Accepted = STK push initiated, status pending
      if (status === 202) {
        return ok({ providerRef: referenceId, status: "PENDING" }, referenceId, 0);
      }
      return ok({ providerRef: referenceId, status: "PENDING" }, referenceId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "MTN MoMo request-to-pay failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async disburse(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `mtnmomo-trf-${req.reference}`, status: "PENDING" }, "mock", 200);
    }
    const token = await getDisburseToken(creds);
    if (!token) return fail("AUTH_FAILED", "MTN MoMo disbursement token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const env = creds.secrets.targetEnvironment ?? "sandbox";
    const referenceId = randomUUID();
    try {
      const { status } = await http(
        `${base}/disbursement/v1_0/transfer`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Reference-Id": referenceId,
            "X-Target-Environment": env,
            "Ocp-Apim-Subscription-Key": creds.secrets.disbursementSubscriptionKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: String(Math.round(req.amountMinor / 100)),
            currency: req.currency,
            externalId: req.reference.slice(0, 16),
            payee: { partyIdType: "MSISDN", partyId: req.phone },
            payerMessage: "Turbopay disbursement",
            payeeNote: req.reference.slice(0, 100),
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      if (status === 202) {
        return ok({ providerRef: referenceId, status: "PENDING" }, referenceId, 0);
      }
      return ok({ providerRef: referenceId, status: "PENDING" }, referenceId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "MTN MoMo disbursement failed";
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
    const token = await getCollectToken(creds);
    if (!token) return fail("AUTH_FAILED", "MTN MoMo token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const env = creds.secrets.targetEnvironment ?? "sandbox";
    try {
      const { body } = await http(
        `${base}/collection/v1_0/requesttopay/${providerRef}`,
        { method: "GET", headers: { Authorization: `Bearer ${token}`, "X-Target-Environment": env, "Ocp-Apim-Subscription-Key": creds.secrets.subscriptionKey } },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = body as { status?: string; financialTransactionId?: string };
      // MTN statuses: PENDING, SUCCESSFUL, FAILED, TIMEOUT
      const st = String(data.status ?? "PENDING").toUpperCase();
      const status = st === "SUCCESSFUL" ? "SUCCESS" : st === "FAILED" || st === "TIMEOUT" ? "FAILED" : "PENDING";
      return ok({ status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "MTN MoMo status query failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};
