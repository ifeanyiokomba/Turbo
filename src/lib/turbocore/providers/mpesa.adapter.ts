// TurboCore — M-Pesa (Safaricom) adapter.
//
// Implements 1 contract:
//   - mpesaProvider (IMobileMoneyProvider)
//
// Base URLs:
//   live:    https://api.safaricom.co.ke
//   sandbox: https://sandbox.safaricom.co.ke
//
// Auth: OAuth 2.0 client-credentials — GET /oauth/v1/generate?grant_type=
// client_credentials with HTTP Basic (consumerKey:consumerSecret) returns an
// access_token valid for 1 hour. We cache it for 50 minutes.
//
// STK push (collect): POST /mpesa/stkpush/v1/processrequest with a base64
// password = shortcode + passkey + timestamp.
//
// B2C (disburse): POST /mpesa/b2c/v1/paymentrequest with a SecurityCredential
// (the Initiator's password encrypted with M-Pesa's public cert). For the
// sandbox we fall back to mock disbursement when no SecurityCredential is
// configured.
//
// Secrets expected:
//   { "consumerKey": "...", "consumerSecret": "...", "passkey": "...",
//     "shortCode": "174379", "initiatorName": "...", "securityCredential": "...",
//     "callbackUrl": "https://yourapp/api/webhooks/mpesa" }

import { ok, fail } from "../result";
import type { IMobileMoneyProvider } from "../contracts";
import { requireCreds, loadCreds, http, defaultHttpError, sanitize, mockWarnOnce } from "./_shared";

const CODE = "mpesa";
const LIVE_BASE = "https://api.safaricom.co.ke";
const SANDBOX_BASE = "https://sandbox.safaricom.co.ke";

interface TokenCache {
  token: string;
  expiresAt: number;
}
const tokenCache: { sandbox: TokenCache | null; live: TokenCache | null } = {
  sandbox: null,
  live: null,
};

async function getAccessToken(creds: {
  secrets: Record<string, string>;
  sandbox: boolean;
}): Promise<string | null> {
  const consumerKey = creds.secrets.consumerKey;
  const consumerSecret = creds.secrets.consumerSecret;
  if (!consumerKey || !consumerSecret) return null;
  const slot = creds.sandbox ? "sandbox" : "live";
  const cached = tokenCache[slot];
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
  const basic = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  try {
    const { body } = await http(
      `${base}/oauth/v1/generate?grant_type=client_credentials`,
      { method: "GET", headers: { Authorization: `Basic ${basic}` } },
      (s, b) => defaultHttpError(CODE, s, b)
    );
    const data = body as { access_token?: string; expires_in?: string | number };
    if (!data?.access_token) return null;
    const expiresIn = Number(data.expires_in ?? 3600);
    const expiresAt = Date.now() + expiresIn * 1000;
    tokenCache[slot] = { token: data.access_token, expiresAt };
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

function mpesaTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function mpesaPassword(shortCode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortCode}${passkey}${timestamp}`).toString("base64");
}

export const mpesaProvider: IMobileMoneyProvider = {
  contract: "MOBILE_MONEY",

  async getBalance(req) {
    // Account-balance query: POST /mpesa/accountbalance/v1/query — sent
    // asynchronously via a callback URL. Without a configured callback we
    // can't surface the actual balance, so we return a PENDING-shaped error.
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ balanceMinor: 0, currency: "KES" }, "mock", 50);
    }
    const token = await getAccessToken(creds);
    if (!token) return fail("AUTH_FAILED", "M-Pesa token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const shortCode = creds.secrets.shortCode;
    const initiator = creds.secrets.initiatorName;
    const securityCredential = creds.secrets.securityCredential;
    if (!shortCode || !initiator || !securityCredential) {
      return fail(
        "AUTH_FAILED",
        "M-Pesa balance requires shortCode + initiatorName + securityCredential",
        { providerCode: CODE }
      );
    }
    try {
      const { body } = await http(
        `${base}/mpesa/accountbalance/v1/query`,
        {
          method: "POST",
          headers: bearerHeaders(token),
          body: JSON.stringify({
            Initiator: initiator,
            SecurityCredential: securityCredential,
            CommandID: "AccountBalance",
            PartyA: shortCode,
            IdentifierType: "4",
            Remarks: "Turbopay balance query",
            QueueTimeOutURL: `${creds.secrets.callbackUrl ?? ""}/timeout`,
            ResultURL: `${creds.secrets.callbackUrl ?? ""}/result`,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const conversationId =
        (body as { ConversationID?: string; ResponseCode?: string }).ConversationID ?? "mpesa-bal";
      // Balance is delivered async via callback; surface 0 with the conversation
      // id so the caller can correlate.
      return ok({ balanceMinor: 0, currency: "KES" }, conversationId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "M-Pesa getBalance failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async collect(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `mpesa-stk-${req.reference}`, status: "PENDING" }, "mock", 200);
    }
    const token = await getAccessToken(creds);
    if (!token) return fail("AUTH_FAILED", "M-Pesa token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const shortCode = creds.secrets.shortCode;
    const passkey = creds.secrets.passkey;
    if (!shortCode || !passkey) {
      return fail("AUTH_FAILED", "M-Pesa STK push requires shortCode + passkey", {
        providerCode: CODE,
      });
    }
    const timestamp = mpesaTimestamp();
    const password = mpesaPassword(shortCode, passkey, timestamp);
    const callbackUrl =
      creds.secrets.callbackUrl ?? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/mpesa`;
    try {
      const { body } = await http(
        `${base}/mpesa/stkpush/v1/processrequest`,
        {
          method: "POST",
          headers: bearerHeaders(token),
          body: JSON.stringify({
            BusinessShortCode: shortCode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: Math.round(req.amountMinor / 100), // KES major units
            PartyA: req.phone,
            PartyB: shortCode,
            PhoneNumber: req.phone,
            CallBackURL: callbackUrl,
            AccountReference: req.reference.slice(0, 12),
            TransactionDesc: req.narration ?? "Turbopay STK push",
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        CheckoutRequestID?: string;
        ResponseCode?: string;
        ResponseDescription?: string;
        CustomerMessage?: string;
      };
      if (!data.CheckoutRequestID) {
        return fail("UPSTREAM_ERROR", data.ResponseDescription ?? "M-Pesa STK push failed", {
          providerCode: CODE,
          raw: sanitize(body),
        });
      }
      return ok(
        { providerRef: data.CheckoutRequestID, status: "PENDING" },
        data.CheckoutRequestID,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "M-Pesa STK push failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async disburse(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `mpesa-b2c-${req.reference}`, status: "PENDING" }, "mock", 200);
    }
    const token = await getAccessToken(creds);
    if (!token) return fail("AUTH_FAILED", "M-Pesa token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const shortCode = creds.secrets.shortCode;
    const initiator = creds.secrets.initiatorName;
    const securityCredential = creds.secrets.securityCredential;
    if (!shortCode || !initiator || !securityCredential) {
      return fail(
        "AUTH_FAILED",
        "M-Pesa B2C requires shortCode + initiatorName + securityCredential",
        { providerCode: CODE }
      );
    }
    const callbackUrl =
      creds.secrets.callbackUrl ?? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/mpesa`;
    try {
      const { body } = await http(
        `${base}/mpesa/b2c/v1/paymentrequest`,
        {
          method: "POST",
          headers: bearerHeaders(token),
          body: JSON.stringify({
            InitiatorName: initiator,
            SecurityCredential: securityCredential,
            CommandID: "BusinessPayment",
            Amount: Math.round(req.amountMinor / 100),
            PartyA: shortCode,
            PartyB: req.phone,
            Remarks: "Turbopay B2C payout",
            QueueTimeOutURL: `${callbackUrl}/timeout`,
            ResultURL: `${callbackUrl}/result`,
            Occasion: req.reference.slice(0, 32),
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        ConversationID?: string;
        ResponseCode?: string;
        ResponseDescription?: string;
      };
      const providerRef = data.ConversationID ?? `mpesa-b2c-${req.reference}`;
      return ok({ providerRef, status: "PENDING" }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "M-Pesa B2C failed";
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
    const token = await getAccessToken(creds);
    if (!token) return fail("AUTH_FAILED", "M-Pesa token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const shortCode = creds.secrets.shortCode;
    const passkey = creds.secrets.passkey;
    if (!shortCode || !passkey) {
      return fail("AUTH_FAILED", "M-Pesa STK query requires shortCode + passkey", {
        providerCode: CODE,
      });
    }
    const timestamp = mpesaTimestamp();
    const password = mpesaPassword(shortCode, passkey, timestamp);
    try {
      const { body } = await http(
        `${base}/mpesa/stkpushquery/v1/query`,
        {
          method: "POST",
          headers: bearerHeaders(token),
          body: JSON.stringify({
            BusinessShortCode: shortCode,
            Password: password,
            Timestamp: timestamp,
            CheckoutRequestID: providerRef,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { ResultCode?: string | number; ResultDesc?: string };
      const resultCode = String(data.ResultCode ?? "");
      // 0 = success; 1032/1037 = cancelled/timeout; everything else = failed.
      let status = "PENDING";
      if (resultCode === "0") status = "SUCCESS";
      else if (resultCode === "1032" || resultCode === "1037") status = "FAILED";
      else if (resultCode !== "") status = "FAILED";
      return ok({ status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "M-Pesa status query failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  // ─── Deep methods ──────────────────────────────────────────────────────────

  /**
   * POST /mpesa/reversal/v1/request — reverse a completed M-Pesa transaction.
   * Requires SecurityCredential (RSA-encrypted initiator password). If the
   * credential is missing we either mock (non-prod) or fail AUTH (prod).
   */
  async reverseTransaction(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { reversalRef: `mpesa-reversal-${req.transactionId}`, status: "PENDING" },
        "mock",
        200
      );
    }
    const token = await getAccessToken(creds);
    if (!token) return fail("AUTH_FAILED", "M-Pesa token retrieval failed", { providerCode: CODE });
    const initiator = creds.secrets.initiatorName;
    const securityCredential = creds.secrets.securityCredential;
    if (!initiator || !securityCredential) {
      // No SecurityCredential → in non-prod return mock, in prod fail AUTH.
      if (process.env.NODE_ENV === "production") {
        return fail("AUTH_FAILED", "M-Pesa reversal requires initiatorName + securityCredential", {
          providerCode: CODE,
        });
      }
      mockWarnOnce(CODE);
      return ok(
        { reversalRef: `mpesa-reversal-${req.transactionId}`, status: "PENDING" },
        "mock-cred-missing",
        0
      );
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const shortCode = creds.secrets.shortCode ?? "";
    const callbackUrl =
      creds.secrets.callbackUrl ?? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/mpesa`;
    try {
      const { body } = await http(
        `${base}/mpesa/reversal/v1/request`,
        {
          method: "POST",
          headers: bearerHeaders(token),
          body: JSON.stringify({
            Initiator: initiator,
            SecurityCredential: securityCredential,
            CommandID: "TransactionReversal",
            TransactionID: req.transactionId,
            ReceiverParty: req.receiverParty ?? shortCode,
            RecieverIdentifierType: "11", // shortcode identifier type
            Amount: req.amountMinor != null ? Math.round(req.amountMinor / 100) : undefined,
            Remarks: (req.remarks ?? "Turbopay reversal").slice(0, 100),
            QueueTimeOutURL: `${callbackUrl}/timeout`,
            ResultURL: `${callbackUrl}/result`,
            Occasion: req.transactionId.slice(0, 32),
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        ConversationID?: string;
        OriginatorConversationID?: string;
        ResponseCode?: string;
        ResponseDescription?: string;
      };
      const ref =
        data.ConversationID ??
        data.OriginatorConversationID ??
        `mpesa-reversal-${req.transactionId}`;
      const responseCode = String(data.ResponseCode ?? "0");
      // ResponseCode "0" = accepted (pending callback); anything else = reject.
      const status = responseCode === "0" ? "PENDING" : "FAILED";
      return ok({ reversalRef: ref, status }, ref, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "M-Pesa reversal failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  /**
   * POST /mpesa/transactionstatus/v1/query — query B2C transaction status.
   * Result is delivered async via callback; we surface the OriginatorConversationID
   * so the caller can correlate.
   */
  async getB2CStatus(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { status: "PENDING", conversationId: `mpesa-b2c-status-${req.transactionID}` },
        "mock",
        50
      );
    }
    const token = await getAccessToken(creds);
    if (!token) return fail("AUTH_FAILED", "M-Pesa token retrieval failed", { providerCode: CODE });
    const initiator = creds.secrets.initiatorName;
    const securityCredential = creds.secrets.securityCredential;
    if (!initiator || !securityCredential) {
      if (process.env.NODE_ENV === "production") {
        return fail(
          "AUTH_FAILED",
          "M-Pesa B2C status requires initiatorName + securityCredential",
          { providerCode: CODE }
        );
      }
      mockWarnOnce(CODE);
      return ok(
        { status: "PENDING", conversationId: `mpesa-b2c-status-${req.transactionID}` },
        "mock-cred-missing",
        0
      );
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const shortCode = creds.secrets.shortCode ?? "";
    const callbackUrl =
      creds.secrets.callbackUrl ?? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/mpesa`;
    try {
      const { body } = await http(
        `${base}/mpesa/transactionstatus/v1/query`,
        {
          method: "POST",
          headers: bearerHeaders(token),
          body: JSON.stringify({
            Initiator: initiator,
            SecurityCredential: securityCredential,
            CommandID: req.commandID || "TransactionStatusQuery",
            TransactionID: req.transactionID,
            PartyA: req.partyA ?? shortCode,
            IdentifierType: req.identifierType ?? "4",
            Remarks: (req.remarks ?? "Turbopay B2C status query").slice(0, 100),
            Occasion: (req.occasion ?? req.transactionID).slice(0, 32),
            QueueTimeOutURL: `${callbackUrl}/timeout`,
            ResultURL: `${callbackUrl}/result`,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        ConversationID?: string;
        OriginatorConversationID?: string;
        ResponseCode?: string;
        ResponseDescription?: string;
      };
      const responseCode = String(data.ResponseCode ?? "0");
      const status = responseCode === "0" ? "PENDING" : "FAILED";
      return ok(
        {
          status,
          conversationId: data.ConversationID,
          originatorConversationId: data.OriginatorConversationID,
        },
        data.ConversationID ?? `mpesa-b2c-status-${req.transactionID}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "M-Pesa B2C status query failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  /**
   * POST /mpesa/c2b/v1/register/url — register C2B validation + confirmation
   * URLs for a Paybill / Till shortcode. Only needs OAuth (no SecurityCredential).
   */
  async registerC2BUrl(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { responseCode: "0", responseDescription: "Mock C2B registration accepted" },
        "mock",
        50
      );
    }
    const token = await getAccessToken(creds);
    if (!token) return fail("AUTH_FAILED", "M-Pesa token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/mpesa/c2b/v1/register/url`,
        {
          method: "POST",
          headers: bearerHeaders(token),
          body: JSON.stringify({
            ValidationURL: req.validationURL,
            ConfirmationURL: req.confirmationURL,
            ResponseType: req.responseType,
            ShortCode: req.shortCode,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { ResponseCode?: string; ResponseDescription?: string };
      return ok(
        {
          responseCode: String(data.ResponseCode ?? "0"),
          responseDescription: data.ResponseDescription ?? "C2B URLs registered",
        },
        `mpesa-c2b-register-${req.shortCode}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "M-Pesa C2B registration failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  /**
   * POST /mpesa/c2b/v1/simulate — simulate a customer-to-business payment
   * (sandbox only; production calls are rejected by Safaricom).
   */
  async simulateC2B(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        {
          conversationId: `mpesa-c2b-sim-${req.shortCode}`,
          responseCode: "0",
          responseDescription: "Mock C2B simulate accepted",
        },
        "mock",
        50
      );
    }
    if (!creds.sandbox) {
      return fail("NOT_SUPPORTED", "M-Pesa C2B simulate is only available in sandbox", {
        providerCode: CODE,
      });
    }
    const token = await getAccessToken(creds);
    if (!token) return fail("AUTH_FAILED", "M-Pesa token retrieval failed", { providerCode: CODE });
    const base = SANDBOX_BASE;
    try {
      const { body } = await http(
        `${base}/mpesa/c2b/v1/simulate`,
        {
          method: "POST",
          headers: bearerHeaders(token),
          body: JSON.stringify({
            CommandID: req.commandID,
            Amount: Math.round(req.amountMinor / 100),
            Msisdn: req.msisdn,
            BillRefNumber: req.billRefNumber.slice(0, 32),
            ShortCode: req.shortCode,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        ConversationID?: string;
        ResponseCode?: string;
        ResponseDescription?: string;
      };
      return ok(
        {
          conversationId: data.ConversationID,
          responseCode: String(data.ResponseCode ?? "0"),
          responseDescription: data.ResponseDescription ?? "C2B simulate accepted",
        },
        data.ConversationID ?? `mpesa-c2b-sim-${req.shortCode}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "M-Pesa C2B simulate failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  /**
   * POST /mpesa/accountbalance/v1/query — query the balance of a shortcode
   * (async; the actual balance arrives via the configured ResultURL callback).
   * Requires SecurityCredential; falls back to mock when not configured.
   */
  async getAccountBalance(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        {
          conversationId: `mpesa-acct-bal-${req.partyA ?? "shortcode"}`,
          responseCode: "0",
          responseDescription: "Mock balance query accepted",
          balanceMinor: 0,
          currency: "KES",
        },
        "mock",
        50
      );
    }
    const token = await getAccessToken(creds);
    if (!token) return fail("AUTH_FAILED", "M-Pesa token retrieval failed", { providerCode: CODE });
    const initiator = req.initiator ?? creds.secrets.initiatorName;
    const securityCredential = creds.secrets.securityCredential;
    if (!initiator || !securityCredential) {
      if (process.env.NODE_ENV === "production") {
        return fail(
          "AUTH_FAILED",
          "M-Pesa account balance requires initiatorName + securityCredential",
          { providerCode: CODE }
        );
      }
      const shortCode = creds.secrets.shortCode ?? "";
      const partyA = req.partyA ?? shortCode;
      mockWarnOnce(CODE);
      return ok(
        {
          conversationId: `mpesa-acct-bal-${partyA}`,
          responseCode: "0",
          responseDescription: "Mock balance query accepted (no SecurityCredential)",
          balanceMinor: 0,
          currency: "KES",
        },
        "mock-cred-missing",
        0
      );
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const shortCode = creds.secrets.shortCode ?? "";
    const callbackUrl =
      creds.secrets.callbackUrl ?? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/mpesa`;
    try {
      const { body } = await http(
        `${base}/mpesa/accountbalance/v1/query`,
        {
          method: "POST",
          headers: bearerHeaders(token),
          body: JSON.stringify({
            Initiator: initiator,
            SecurityCredential: securityCredential,
            CommandID: req.commandID ?? "AccountBalance",
            PartyA: req.partyA ?? shortCode,
            IdentifierType: req.identifierType ?? "4",
            Remarks: (req.remarks ?? "Turbopay account balance query").slice(0, 100),
            QueueTimeOutURL: `${callbackUrl}/timeout`,
            ResultURL: `${callbackUrl}/result`,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        ConversationID?: string;
        OriginatorConversationID?: string;
        ResponseCode?: string;
        ResponseDescription?: string;
      };
      const responseCode = String(data.ResponseCode ?? "0");
      return ok(
        {
          conversationId: data.ConversationID ?? data.OriginatorConversationID,
          responseCode,
          responseDescription: data.ResponseDescription ?? "Account balance query accepted",
          // Actual balance arrives async via callback; surface 0 placeholder.
          balanceMinor: 0,
          currency: "KES",
        },
        data.ConversationID ?? `mpesa-acct-bal-${req.partyA ?? shortCode}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "M-Pesa account balance query failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  /**
   * POST /mpesa/transactionstatus/v1/query — generic transaction status query
   * (works for B2C, B2B, reversal, etc.). The actual result arrives async via
   * the configured ResultURL callback; we surface the ConversationID for
   * correlation. Requires SecurityCredential.
   */
  async getTransactionStatus(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { status: "PENDING", conversationId: `mpesa-tx-status-${req.transactionID}` },
        "mock",
        50
      );
    }
    const token = await getAccessToken(creds);
    if (!token) return fail("AUTH_FAILED", "M-Pesa token retrieval failed", { providerCode: CODE });
    const initiator = creds.secrets.initiatorName;
    const securityCredential = creds.secrets.securityCredential;
    if (!initiator || !securityCredential) {
      if (process.env.NODE_ENV === "production") {
        return fail(
          "AUTH_FAILED",
          "M-Pesa transaction status requires initiatorName + securityCredential",
          { providerCode: CODE }
        );
      }
      mockWarnOnce(CODE);
      return ok(
        { status: "PENDING", conversationId: `mpesa-tx-status-${req.transactionID}` },
        "mock-cred-missing",
        0
      );
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const shortCode = creds.secrets.shortCode ?? "";
    const callbackUrl =
      creds.secrets.callbackUrl ?? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/mpesa`;
    try {
      const { body } = await http(
        `${base}/mpesa/transactionstatus/v1/query`,
        {
          method: "POST",
          headers: bearerHeaders(token),
          body: JSON.stringify({
            Initiator: initiator,
            SecurityCredential: securityCredential,
            CommandID: req.commandID || "TransactionStatusQuery",
            TransactionID: req.transactionID,
            PartyA: req.partyA ?? shortCode,
            IdentifierType: req.identifierType ?? "4",
            Remarks: (req.remarks ?? "Turbopay transaction status query").slice(0, 100),
            Occasion: (req.occasion ?? req.transactionID).slice(0, 32),
            QueueTimeOutURL: `${callbackUrl}/timeout`,
            ResultURL: `${callbackUrl}/result`,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        ConversationID?: string;
        OriginatorConversationID?: string;
        ResponseCode?: string;
        ResponseDescription?: string;
      };
      const responseCode = String(data.ResponseCode ?? "0");
      const status = responseCode === "0" ? "PENDING" : "FAILED";
      return ok(
        {
          status,
          conversationId: data.ConversationID,
          originatorConversationId: data.OriginatorConversationID,
        },
        data.ConversationID ?? `mpesa-tx-status-${req.transactionID}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "M-Pesa transaction status query failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};
