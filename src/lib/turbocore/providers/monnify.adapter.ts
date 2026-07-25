// TurboCore — Monnify adapter.
//
// Implements 2 contracts:
//   - monnifyVirtualAccount (IVirtualAccountProvider) — reserved accounts
//   - monnifyCardPayment    (ICardPaymentProvider)     — initialize + verify
//
// Base URLs:
//   live:    https://api.monnify.com/v1
//   sandbox: https://sandbox.monnify.com/api/v1
//
// Auth: HTTP Basic (apiKey:clientSecret) → POST /auth/login returns a JWT
// access_token that's then used as `Bearer ${token}` for subsequent calls.
// We cache the token in-process for 25 minutes (token TTL is 30 min).
//
// Secrets expected: { "apiKey": "MK_PROD_...", "clientSecret": "...",
// "contractCode": "..." }

import { ok, fail } from "../result";
import type { ICardPaymentProvider, IVirtualAccountProvider } from "../contracts";
import { requireCreds, loadCreds, http, defaultHttpError, sanitize, mockWarnOnce } from "./_shared";
import { NIGERIAN_BANKS, UNIQUE_BANKS } from "@/lib/banks";
import { generateAccountNumber } from "@/lib/money";

const CODE = "monnify";
const LIVE_BASE = "https://api.monnify.com/v1";
const SANDBOX_BASE = "https://sandbox.monnify.com/api/v1";

// In-memory JWT cache (per sandbox/live base).
interface TokenCache {
  token: string;
  expiresAt: number;
}
const tokenCache: { sandbox: TokenCache | null; live: TokenCache | null } = { sandbox: null, live: null };

async function getAccessToken(creds: { secrets: Record<string, string>; sandbox: boolean }): Promise<string | null> {
  const apiKey = creds.secrets.apiKey;
  const clientSecret = creds.secrets.clientSecret;
  if (!apiKey || !clientSecret) return null;
  const slot = creds.sandbox ? "sandbox" : "live";
  const cached = tokenCache[slot];
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
  const basic = Buffer.from(`${apiKey}:${clientSecret}`).toString("base64");
  try {
    const { body } = await http(
      `${base}/auth/login`,
      {
        method: "POST",
        headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
      },
      (s, b) => defaultHttpError(CODE, s, b),
    );
    const data = (body as { responseBody?: { accessToken?: string; expiresIn?: number } }).responseBody;
    if (!data?.accessToken) return null;
    const token = data.accessToken;
    const expiresAt = Date.now() + (data.expiresAt ?? 25 * 60) * 1000;
    tokenCache[slot] = { token, expiresAt };
    return token;
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

// ---------------------------------------------------------------------------
// 1. Virtual account (Reserved Accounts)
// ---------------------------------------------------------------------------

export const monnifyVirtualAccount: IVirtualAccountProvider = {
  contract: "VIRTUAL_ACCOUNT",

  async listSupportedBanks(country) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(UNIQUE_BANKS.map((b) => ({ ...b, country })), "mock", 12);
    }
    const token = await getAccessToken(creds);
    if (!token) return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(`${base}/banks`, { method: "GET", headers: bearerHeaders(token) }, (s, b) =>
        defaultHttpError(CODE, s, b),
      );
      const banks = (body as { responseBody?: Array<{ code?: string; name?: string; shortCode?: string }> }).responseBody ?? [];
      const out = banks
        .filter((b) => b.code && b.name)
        .map((b) => ({ code: String(b.code), name: String(b.name), short: String(b.shortCode ?? b.name), country }));
      return ok(out.length ? out : UNIQUE_BANKS.map((b) => ({ ...b, country })), "mn-banks", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Monnify listBanks failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async createVirtualAccount(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const acc = generateAccountNumber();
      return ok({ accountNumber: acc, bankCode: "000", bankName: "Monnify MFB", providerRef: `mn-va-${acc}` }, "mock", 80);
    }
    const token = await getAccessToken(creds);
    if (!token) return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const contractCode = creds.secrets.contractCode;
    if (!contractCode) return fail("AUTH_FAILED", "Monnify contractCode missing", { providerCode: CODE });
    const accountReference = `TURBO-${req.userId.slice(-8)}`;
    try {
      const { body } = await http(
        `${base}/bank-transfer/reserved-accounts`,
        {
          method: "POST",
          headers: bearerHeaders(token),
          body: JSON.stringify({
            accountName: req.accountName,
            accountReference,
            currencyCode: "NGN",
            contractCode,
            customerEmail: `${req.userId}@turbopay.ng`,
            customerName: req.accountName,
            getAllAvailableBanks: true,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as {
        responseBody?: {
          accountReference?: string;
          accounts?: Array<{ accountNumber?: string; bankCode?: string; bankName?: string; bankSlug?: string }>;
        };
      }).responseBody;
      const first = data?.accounts?.[0];
      const accountNumber = first?.accountNumber ?? generateAccountNumber();
      const bankCode = first?.bankCode ?? first?.bankSlug ?? "000";
      const bankName = first?.bankName ?? "Monnify MFB";
      const providerRef = data?.accountReference ?? accountReference;
      return ok({ accountNumber, bankCode, bankName, providerRef }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Monnify createVirtualAccount failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async getAccountStatus(providerRef) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "ACTIVE", accountNumber: providerRef.split("-").pop() ?? "" }, "mock", 10);
    }
    const token = await getAccessToken(creds);
    if (!token) return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/bank-transfer/reserved-accounts/${encodeURIComponent(providerRef)}`,
        { method: "GET", headers: bearerHeaders(token) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { responseBody?: { accountStatus?: string; accountReference?: string; accounts?: Array<{ accountNumber?: string }> } }).responseBody;
      const status = (data?.accountStatus ?? "ACTIVE").toUpperCase();
      const accountNumber = data?.accounts?.[0]?.accountNumber ?? "";
      return ok({ status, accountNumber }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Monnify getAccountStatus failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async deactivateVirtualAccount(providerRef) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ deactivated: true }, "mock", 10);
    }
    const token = await getAccessToken(creds);
    if (!token) return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      // Monnify uses PUT /bank-transfer/reserved-accounts/:ref/deactivate
      await http(
        `${base}/bank-transfer/reserved-accounts/${encodeURIComponent(providerRef)}/deactivate`,
        { method: "PUT", headers: bearerHeaders(token) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      return ok({ deactivated: true }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Monnify deactivate failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async resolveAccountName(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const known = NIGERIAN_BANKS.find((b) => b.code === req.bankCode);
      return ok({ accountName: `MOCK ${req.accountNumber.slice(-4)}`, bankName: known?.name ?? "Unknown" }, "mock", 25);
    }
    const token = await getAccessToken(creds);
    if (!token) return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/bank-transfer/reserved-accounts/resolve?accountNumber=${encodeURIComponent(req.accountNumber)}`,
        { method: "GET", headers: bearerHeaders(token) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { responseBody?: { accountName?: string; bankName?: string } }).responseBody;
      if (!data?.accountName) {
        return fail("BENEFICIARY_INVALID", "Monnify could not resolve account", { providerCode: CODE, raw: sanitize(body) });
      }
      const known = NIGERIAN_BANKS.find((b) => b.code === req.bankCode);
      return ok({ accountName: data.accountName, bankName: data.bankName ?? known?.name ?? req.bankCode }, "mn-resolve", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Monnify resolve failed";
      const code: "UPSTREAM_ERROR" | "BENEFICIARY_INVALID" = /404|not found/i.test(msg) ? "BENEFICIARY_INVALID" : "UPSTREAM_ERROR";
      return fail(code, msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 2. Card payment (Monnify inline / iframe flow)
// ---------------------------------------------------------------------------

export const monnifyCardPayment: ICardPaymentProvider = {
  contract: "CARD_PAYMENT",

  async initializeCharge(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `mn-card-${req.reference}`, status: "3DS_REQUIRED", authUrl: `${SANDBOX_BASE}/mock/checkout?ref=${req.reference}` }, "mock", 80);
    }
    const token = await getAccessToken(creds);
    if (!token) return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const contractCode = creds.secrets.contractCode;
    if (!contractCode) return fail("AUTH_FAILED", "Monnify contractCode missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${base}/merchant/transactions/init-transaction`,
        {
          method: "POST",
          headers: bearerHeaders(token),
          body: JSON.stringify({
            amount: req.amountMinor / 100, // Monnify uses major units
            customerName: req.customer.name ?? "Turbopay Customer",
            customerEmail: req.customer.email ?? "customer@turbopay.ng",
            paymentReference: req.reference,
            paymentDescription: "Turbopay card charge",
            currencyCode: req.currency,
            contractCode,
            paymentMethods: ["CARD"],
            redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/monnify/return`,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { responseBody?: { transactionReference?: string; checkoutUrl?: string; status?: string; merchantName?: string } }).responseBody;
      const providerRef = data?.transactionReference ?? `mn-card-${req.reference}`;
      const authUrl = data?.checkoutUrl;
      const status: "PENDING" | "3DS_REQUIRED" = authUrl ? "3DS_REQUIRED" : "PENDING";
      return ok({ providerRef, status, authUrl }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Monnify initializeCharge failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async verifyCharge(providerRef) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "success", amountSettledMinor: 0, currency: "NGN" }, "mock", 40);
    }
    const token = await getAccessToken(creds);
    if (!token) return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/merchant/transactions/${encodeURIComponent(providerRef)}`,
        { method: "GET", headers: bearerHeaders(token) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { responseBody?: { paymentStatus?: string; amountPaid?: number; currencyCode?: string } }).responseBody;
      const status = (data?.paymentStatus ?? "PENDING").toLowerCase();
      const amount = typeof data?.amountPaid === "number" ? Math.round(data.amountPaid * 100) : 0;
      return ok({ status, amountSettledMinor: amount, currency: data?.currencyCode ?? "NGN" }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Monnify verifyCharge failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async refund(req) {
    // Monnify refunds are via POST /merchant/transactions/refund with the
    // transaction reference + amount.
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ refundRef: `mn-refund-${req.providerRef}`, status: "pending" }, "mock", 70);
    }
    const token = await getAccessToken(creds);
    if (!token) return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/merchant/transactions/${encodeURIComponent(req.providerRef)}/refund`,
        {
          method: "POST",
          headers: bearerHeaders(token),
          body: JSON.stringify({
            amount: req.amountMinor != null ? req.amountMinor / 100 : undefined,
            reason: req.reason ?? "Customer requested refund",
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { responseBody?: { refundReference?: string; status?: string } }).responseBody;
      return ok(
        { refundRef: data?.refundReference ?? `mn-refund-${req.providerRef}`, status: (data?.status ?? "pending").toLowerCase() },
        `mn-refund-${req.providerRef}`,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Monnify refund failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

