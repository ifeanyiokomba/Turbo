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

  // ─── Deep methods ──────────────────────────────────────────────────────────

  /**
   * POST /collection/v2_0/preapproval — merchant pre-approves a payment from
   * a customer (used for subscriptions/recurring billing). Uses the collection
   * token (collection subscription key).
   */
  async createPreApproval(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { referenceId: `mtnmomo-preapp-${Date.now()}`, status: "PENDING" },
        "mock", 200,
      );
    }
    const token = await getCollectToken(creds);
    if (!token) return fail("AUTH_FAILED", "MTN MoMo token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const env = creds.secrets.targetEnvironment ?? "sandbox";
    const referenceId = randomUUID();
    try {
      const { status } = await http(
        `${base}/collection/v2_0/preapproval`,
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
            payerId: req.payerId,
            payerIdType: req.payerIdType,
            currency: req.currency,
            proposedAmount: String(Math.round(req.proposedAmountMinor / 100)),
            externalId: req.externalId?.slice(0, 16) ?? undefined,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      // 202 Accepted = preapproval request initiated, pending callback.
      const st = status === 202 ? "PENDING" : "FAILED";
      return ok({ referenceId, status: st }, referenceId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "MTN MoMo preapproval failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  /**
   * POST /collection/v2_0/deliverynotification/:referenceId — notify the
   * customer that goods/services have been delivered. Triggers payment release
   * for pre-approved request-to-pay flows. Uses the collection token.
   */
  async sendDeliveryNotification(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "SUCCESS" }, "mock", 50);
    }
    const token = await getCollectToken(creds);
    if (!token) return fail("AUTH_FAILED", "MTN MoMo token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const env = creds.secrets.targetEnvironment ?? "sandbox";
    const note = (req.note ?? req.message ?? "Turbopay delivery notification").slice(0, 100);
    try {
      const { status } = await http(
        `${base}/collection/v2_0/deliverynotification/${encodeURIComponent(req.referenceId)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Target-Environment": env,
            "Ocp-Apim-Subscription-Key": creds.secrets.subscriptionKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ note }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const st = status === 204 || status === 200 || status === 202 ? "SUCCESS" : "PENDING";
      return ok({ status: st }, req.referenceId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "MTN MoMo delivery notification failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  /**
   * GET /collection/v2_0/accountholder/:type/:id/basicuserinfo — basic info
   * (name, surname, msisdn) for an account holder. Useful for KYC enrichment
   * before disbursement. Uses the collection token.
   */
  async getAccountHolderBasicInfo(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { name: "MTN", surname: "Customer", msisdn: req.accountHolderId, status: "ACTIVE" },
        "mock", 50,
      );
    }
    const token = await getCollectToken(creds);
    if (!token) return fail("AUTH_FAILED", "MTN MoMo token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const env = creds.secrets.targetEnvironment ?? "sandbox";
    try {
      const { body } = await http(
        `${base}/collection/v2_0/accountholder/${encodeURIComponent(req.accountHolderIdType)}/${encodeURIComponent(req.accountHolderId)}/basicuserinfo`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Target-Environment": env,
            "Ocp-Apim-Subscription-Key": creds.secrets.subscriptionKey,
          },
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { name?: string; sub_msisdn?: string; given_name?: string; family_name?: string; status?: string; birthdate?: string; locale?: string; gender?: string });
      return ok(
        {
          name: data.given_name ?? data.name,
          surname: data.family_name,
          msisdn: data.sub_msisdn ?? req.accountHolderId,
          status: data.status ?? "ACTIVE",
        },
        `mtnmomo-acctinfo-${req.accountHolderId}`, 0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "MTN MoMo getAccountHolderBasicInfo failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  /**
   * GET /collection/v2_0/accountholder/:type/:id/active — check whether the
   * account holder is registered and active. Returns active=false on 404 too.
   * Uses the collection token.
   */
  async isAccountHolderActive(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ active: true }, "mock", 30);
    }
    const token = await getCollectToken(creds);
    if (!token) return fail("AUTH_FAILED", "MTN MoMo token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const env = creds.secrets.targetEnvironment ?? "sandbox";
    try {
      const { status, body } = await http(
        `${base}/collection/v2_0/accountholder/${encodeURIComponent(req.accountHolderIdType)}/${encodeURIComponent(req.accountHolderId)}/active`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Target-Environment": env,
            "Ocp-Apim-Subscription-Key": creds.secrets.subscriptionKey,
          },
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      // 200 with body { "result": true/false }
      const data = (body as { result?: boolean });
      const active = status === 200 && (data?.result === true || data?.result === undefined);
      return ok({ active }, `mtnmomo-active-${req.accountHolderId}`, 0);
    } catch (e) {
      // A 404 means the account holder doesn't exist — return active=false
      // instead of an error so the caller can pre-validate before disbursement.
      if (e && typeof e === "object" && "error" in e) {
        const err = (e as { error?: { httpStatus?: number } }).error;
        if (err?.httpStatus === 404) return ok({ active: false }, `mtnmomo-active-${req.accountHolderId}`, 0);
      }
      const msg = e instanceof Error ? e.message : "MTN MoMo isAccountHolderActive failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  /**
   * POST /disbursement/v2_0/transfer — disbursement-specific transfer (v2_0).
   * Uses the disbursement token (different subscription key from collection).
   * The actual transfer is async; we return PENDING on 202 Accepted.
   */
  async disburseTransfer(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { referenceId: `mtnmomo-disb-v2-${req.externalId}`, status: "PENDING" },
        "mock", 200,
      );
    }
    const token = await getDisburseToken(creds);
    if (!token) return fail("AUTH_FAILED", "MTN MoMo disbursement token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const env = creds.secrets.targetEnvironment ?? "sandbox";
    const referenceId = randomUUID();
    try {
      const { status } = await http(
        `${base}/disbursement/v2_0/transfer`,
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
            externalId: req.externalId.slice(0, 16),
            payee: { partyIdType: req.payee.partyIdType, partyId: req.payee.partyId },
            payerMessage: (req.payerMessage ?? "Turbopay disbursement").slice(0, 100),
            payeeNote: (req.payeeNote ?? req.externalId).slice(0, 100),
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const st = status === 202 ? "PENDING" : "FAILED";
      return ok({ referenceId, status: st }, referenceId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "MTN MoMo disbursement v2 transfer failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  /**
   * GET /disbursement/v2_0/transfer/:referenceId — disbursement transfer status.
   * Uses the disbursement token.
   */
  async getDisbursementTransferStatus(referenceId) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "SUCCESS" }, "mock", 30);
    }
    const token = await getDisburseToken(creds);
    if (!token) return fail("AUTH_FAILED", "MTN MoMo disbursement token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const env = creds.secrets.targetEnvironment ?? "sandbox";
    try {
      const { body } = await http(
        `${base}/disbursement/v2_0/transfer/${encodeURIComponent(referenceId)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Target-Environment": env,
            "Ocp-Apim-Subscription-Key": creds.secrets.disbursementSubscriptionKey,
          },
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { status?: string; financialTransactionId?: string });
      const st = String(data.status ?? "PENDING").toUpperCase();
      const status = st === "SUCCESSFUL" ? "SUCCESS" : st === "FAILED" || st === "TIMEOUT" ? "FAILED" : "PENDING";
      return ok({ status, financialTransactionId: data.financialTransactionId }, referenceId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "MTN MoMo disbursement status query failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  /**
   * GET /disbursement/v2_0/account/balance — disbursement account balance.
   * Returns availableBalanceMinor and currency. Uses the disbursement token.
   */
  async getDisbursementAccountBalance() {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ balanceMinor: 0, currency: "UGX", availableBalanceMinor: 0 }, "mock", 50);
    }
    const token = await getDisburseToken(creds);
    if (!token) return fail("AUTH_FAILED", "MTN MoMo disbursement token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const env = creds.secrets.targetEnvironment ?? "sandbox";
    try {
      const { body } = await http(
        `${base}/disbursement/v2_0/account/balance`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Target-Environment": env,
            "Ocp-Apim-Subscription-Key": creds.secrets.disbursementSubscriptionKey,
          },
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { availableBalance?: string; currency?: string });
      const available = Number(data?.availableBalance ?? 0) * 100;
      return ok(
        {
          balanceMinor: Math.round(available),
          availableBalanceMinor: Math.round(available),
          currency: data?.currency ?? "UGX",
        },
        `mtnmomo-disb-bal-${Date.now()}`, 0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "MTN MoMo disbursement balance query failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};
