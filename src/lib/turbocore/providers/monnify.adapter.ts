// TurboCore — Monnify adapter.
//
// Implements 6 contracts:
//   - monnifyVirtualAccount        (IVirtualAccountProvider) — reserved accounts
//   - monnifyCardPayment           (ICardPaymentProvider)     — initialize + verify
//   - monnifySubaccounts           (ISplitPaymentProvider)    — subaccounts for split settlement
//   - monnifyReservedAccountSplit  (extended VA + split)       — reserved account with subAccountCodes
//   - monnifyInvoice               (IInvoiceProvider)          — create + status + details
//   - monnifyDirectDebit           (IDirectDebitProvider)      — mandate + status + debit
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
import type {
  ICardPaymentProvider,
  IVirtualAccountProvider,
  ISplitPaymentProvider,
  IInvoiceProvider,
  IDirectDebitProvider,
  ProviderResult,
} from "../contracts";
import { requireCreds, loadCreds, http, defaultHttpError, sanitize, mockWarnOnce } from "./_shared";
import { NIGERIAN_BANKS, UNIQUE_BANKS } from "@/lib/banks";
import { generateAccountNumber, generateReference } from "@/lib/money";

const CODE = "monnify";
const LIVE_BASE = "https://api.monnify.com/v1";
const SANDBOX_BASE = "https://sandbox.monnify.com/api/v1";

// In-memory JWT cache (per sandbox/live base).
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
      (s, b) => defaultHttpError(CODE, s, b)
    );
    const data = (body as { responseBody?: { accessToken?: string; expiresIn?: number } })
      .responseBody;
    if (!data?.accessToken) return null;
    const token = data.accessToken;
    const expiresAt = Date.now() + (data.expiresIn ?? 25 * 60) * 1000;
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
      return ok(
        UNIQUE_BANKS.map((b) => ({ ...b, country })),
        "mock",
        12
      );
    }
    const token = await getAccessToken(creds);
    if (!token)
      return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/banks`,
        { method: "GET", headers: bearerHeaders(token) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const banks =
        (body as { responseBody?: Array<{ code?: string; name?: string; shortCode?: string }> })
          .responseBody ?? [];
      const out = banks
        .filter((b) => b.code && b.name)
        .map((b) => ({
          code: String(b.code),
          name: String(b.name),
          short: String(b.shortCode ?? b.name),
          country,
        }));
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
      return ok(
        {
          accountNumber: acc,
          bankCode: "000",
          bankName: "Monnify MFB",
          providerRef: `mn-va-${acc}`,
        },
        "mock",
        80
      );
    }
    const token = await getAccessToken(creds);
    if (!token)
      return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const contractCode = creds.secrets.contractCode;
    if (!contractCode)
      return fail("AUTH_FAILED", "Monnify contractCode missing", { providerCode: CODE });
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
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = (
        body as {
          responseBody?: {
            accountReference?: string;
            accounts?: Array<{
              accountNumber?: string;
              bankCode?: string;
              bankName?: string;
              bankSlug?: string;
            }>;
          };
        }
      ).responseBody;
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
      return ok(
        { status: "ACTIVE", accountNumber: providerRef.split("-").pop() ?? "" },
        "mock",
        10
      );
    }
    const token = await getAccessToken(creds);
    if (!token)
      return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/bank-transfer/reserved-accounts/${encodeURIComponent(providerRef)}`,
        { method: "GET", headers: bearerHeaders(token) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = (
        body as {
          responseBody?: {
            accountStatus?: string;
            accountReference?: string;
            accounts?: Array<{ accountNumber?: string }>;
          };
        }
      ).responseBody;
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
    if (!token)
      return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      // Monnify uses PUT /bank-transfer/reserved-accounts/:ref/deactivate
      await http(
        `${base}/bank-transfer/reserved-accounts/${encodeURIComponent(providerRef)}/deactivate`,
        { method: "PUT", headers: bearerHeaders(token) },
        (s, b) => defaultHttpError(CODE, s, b)
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
      return ok(
        { accountName: `MOCK ${req.accountNumber.slice(-4)}`, bankName: known?.name ?? "Unknown" },
        "mock",
        25
      );
    }
    const token = await getAccessToken(creds);
    if (!token)
      return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/bank-transfer/reserved-accounts/resolve?accountNumber=${encodeURIComponent(req.accountNumber)}`,
        { method: "GET", headers: bearerHeaders(token) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = (body as { responseBody?: { accountName?: string; bankName?: string } })
        .responseBody;
      if (!data?.accountName) {
        return fail("BENEFICIARY_INVALID", "Monnify could not resolve account", {
          providerCode: CODE,
          raw: sanitize(body),
        });
      }
      const known = NIGERIAN_BANKS.find((b) => b.code === req.bankCode);
      return ok(
        { accountName: data.accountName, bankName: data.bankName ?? known?.name ?? req.bankCode },
        "mn-resolve",
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Monnify resolve failed";
      const code: "UPSTREAM_ERROR" | "BENEFICIARY_INVALID" = /404|not found/i.test(msg)
        ? "BENEFICIARY_INVALID"
        : "UPSTREAM_ERROR";
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
      return ok(
        {
          providerRef: `mn-card-${req.reference}`,
          status: "3DS_REQUIRED",
          authUrl: `${SANDBOX_BASE}/mock/checkout?ref=${req.reference}`,
        },
        "mock",
        80
      );
    }
    const token = await getAccessToken(creds);
    if (!token)
      return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const contractCode = creds.secrets.contractCode;
    if (!contractCode)
      return fail("AUTH_FAILED", "Monnify contractCode missing", { providerCode: CODE });
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
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = (
        body as {
          responseBody?: {
            transactionReference?: string;
            checkoutUrl?: string;
            status?: string;
            merchantName?: string;
          };
        }
      ).responseBody;
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
    if (!token)
      return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/merchant/transactions/${encodeURIComponent(providerRef)}`,
        { method: "GET", headers: bearerHeaders(token) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = (
        body as {
          responseBody?: { paymentStatus?: string; amountPaid?: number; currencyCode?: string };
        }
      ).responseBody;
      const status = (data?.paymentStatus ?? "PENDING").toLowerCase();
      const amount = typeof data?.amountPaid === "number" ? Math.round(data.amountPaid * 100) : 0;
      return ok(
        { status, amountSettledMinor: amount, currency: data?.currencyCode ?? "NGN" },
        providerRef,
        0
      );
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
    if (!token)
      return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
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
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = (body as { responseBody?: { refundReference?: string; status?: string } })
        .responseBody;
      return ok(
        {
          refundRef: data?.refundReference ?? `mn-refund-${req.providerRef}`,
          status: (data?.status ?? "pending").toLowerCase(),
        },
        `mn-refund-${req.providerRef}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Monnify refund failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 3. Subaccounts (Split payment)
//    POST /bank-transfer/reserved-accounts/subaccounts
//    GET  /bank-transfer/reserved-accounts/subaccounts
// ---------------------------------------------------------------------------

export const monnifySubaccounts: ISplitPaymentProvider = {
  contract: "SPLIT_PAYMENT",

  async createSubaccount(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const code = `MNFYSUB-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
      return ok({ subaccountCode: code, subaccountId: code }, "mock", 80);
    }
    const token = await getAccessToken(creds);
    if (!token)
      return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/bank-transfer/reserved-accounts/subaccounts`,
        {
          method: "POST",
          headers: bearerHeaders(token),
          body: JSON.stringify({
            currencyCode: req.currency,
            bankCode: req.bankCode,
            accountNumber: req.accountNumber,
            email: req.email,
            defaultPercentage: req.defaultPercentage ?? 100,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = (
        body as {
          responseBody?: { subAccountCode?: string; reference?: string; id?: string | number };
        }
      ).responseBody;
      const subaccountCode = data?.subAccountCode ?? data?.reference ?? `MNFYSUB-${Date.now()}`;
      return ok(
        { subaccountCode, subaccountId: String(data?.id ?? subaccountCode) },
        subaccountCode,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Monnify createSubaccount failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async listSubaccounts() {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        [
          {
            subaccountCode: "MNFYSUB-DEMO1",
            subaccountId: "1",
            accountName: "Demo Merchant One",
            bankCode: "057",
            accountNumber: "0123456789",
            defaultPercentage: 80,
          },
          {
            subaccountCode: "MNFYSUB-DEMO2",
            subaccountId: "2",
            accountName: "Demo Merchant Two",
            bankCode: "058",
            accountNumber: "9876543210",
            defaultPercentage: 20,
          },
        ],
        "mock",
        40
      );
    }
    const token = await getAccessToken(creds);
    if (!token)
      return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/bank-transfer/reserved-accounts/subaccounts`,
        { method: "GET", headers: bearerHeaders(token) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const list =
        (
          body as {
            responseBody?: Array<{
              subAccountCode?: string;
              reference?: string;
              id?: string | number;
              accountName?: string;
              accountNumber?: string;
              bankCode?: string;
              defaultPercentage?: number;
              currencyCode?: string;
            }>;
          }
        ).responseBody ?? [];
      const out = list
        .filter((s) => s.subAccountCode || s.reference)
        .map((s) => ({
          subaccountCode: String(s.subAccountCode ?? s.reference),
          subaccountId: String(s.id ?? s.subAccountCode ?? s.reference),
          accountName: s.accountName ?? "",
          bankCode: s.bankCode ?? "",
          accountNumber: s.accountNumber ?? "",
          defaultPercentage: s.defaultPercentage,
        }));
      return ok(out, "mn-subaccounts", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Monnify listSubaccounts failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 4. Reserved account with split (extended IVirtualAccountProvider)
//    POST /bank-transfer/reserved-accounts with subAccountCodes
//
//    This is an extension of IVirtualAccountProvider — exposes a single new
//    method `createReservedAccountWithSplit` that wraps the standard reserved
//    account creation but accepts an array of subaccount codes to link for
//    automatic split settlement.
// ---------------------------------------------------------------------------

export interface MonnifyReservedAccountSplitProvider extends IVirtualAccountProvider {
  createReservedAccountWithSplit(req: {
    accountName: string;
    accountReference: string;
    currencyCode: string;
    contractCode: string;
    customerEmail: string;
    customerName: string;
    subAccountCodes: string[];
  }): Promise<
    ProviderResult<{
      accountNumber: string;
      bankCode: string;
      bankName: string;
      providerRef: string;
      accounts: Array<{ accountNumber: string; bankCode: string; bankName: string }>;
    }>
  >;
}

export const monnifyReservedAccountSplit: MonnifyReservedAccountSplitProvider = {
  ...monnifyVirtualAccount,
  contract: "VIRTUAL_ACCOUNT",

  async createReservedAccountWithSplit(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const acc = generateAccountNumber();
      return ok(
        {
          accountNumber: acc,
          bankCode: "000",
          bankName: "Monnify MFB",
          providerRef: `mn-vasplit-${req.accountReference}`,
          accounts: [{ accountNumber: acc, bankCode: "000", bankName: "Monnify MFB" }],
        },
        "mock",
        100
      );
    }
    const token = await getAccessToken(creds);
    if (!token)
      return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/bank-transfer/reserved-accounts`,
        {
          method: "POST",
          headers: bearerHeaders(token),
          body: JSON.stringify({
            accountName: req.accountName,
            accountReference: req.accountReference,
            currencyCode: req.currencyCode,
            contractCode: req.contractCode,
            customerEmail: req.customerEmail,
            customerName: req.customerName,
            subAccountCodes: req.subAccountCodes,
            getAllAvailableBanks: true,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = (
        body as {
          responseBody?: {
            accountReference?: string;
            accounts?: Array<{
              accountNumber?: string;
              bankCode?: string;
              bankName?: string;
              bankSlug?: string;
            }>;
          };
        }
      ).responseBody;
      const accounts = (data?.accounts ?? []).map((a) => ({
        accountNumber: String(a.accountNumber ?? ""),
        bankCode: String(a.bankCode ?? a.bankSlug ?? ""),
        bankName: String(a.bankName ?? ""),
      }));
      const first = accounts[0];
      const accountNumber = first?.accountNumber ?? generateAccountNumber();
      const bankCode = first?.bankCode ?? "000";
      const bankName = first?.bankName ?? "Monnify MFB";
      const providerRef = data?.accountReference ?? req.accountReference;
      return ok({ accountNumber, bankCode, bankName, providerRef, accounts }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Monnify createReservedAccountWithSplit failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 5. Invoice
//    POST /invoice/create
//    GET  /invoice/status/:reference
//    GET  /invoice/details/:reference
// ---------------------------------------------------------------------------

export const monnifyInvoice: IInvoiceProvider = {
  contract: "INVOICE",

  async createInvoice(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const invoiceReference = `MNFYINV-${generateReference("I")}`;
      return ok(
        {
          invoiceReference,
          checkoutUrl: `${SANDBOX_BASE}/mock/invoice?ref=${invoiceReference}`,
          status: "PENDING",
        },
        "mock",
        100
      );
    }
    const token = await getAccessToken(creds);
    if (!token)
      return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const contractCode = creds.secrets.contractCode;
    if (!contractCode)
      return fail("AUTH_FAILED", "Monnify contractCode missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${base}/invoice/create`,
        {
          method: "POST",
          headers: bearerHeaders(token),
          body: JSON.stringify({
            amount: req.amountMinor / 100, // Monnify uses major units
            description: req.description,
            contractCode,
            customerEmail: req.customerEmail,
            customerName: req.customerName,
            expiryDate: req.expiryDate,
            currencyCode: req.currency ?? "NGN",
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = (
        body as {
          responseBody?: {
            invoiceReference?: string;
            invoiceUrl?: string;
            checkoutUrl?: string;
            status?: string;
          };
        }
      ).responseBody;
      const invoiceReference = data?.invoiceReference ?? `MNFYINV-${Date.now()}`;
      return ok(
        {
          invoiceReference,
          checkoutUrl: data?.checkoutUrl ?? data?.invoiceUrl,
          status: (data?.status ?? "PENDING").toUpperCase(),
        },
        invoiceReference,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Monnify createInvoice failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async getInvoiceStatus(invoiceReference) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "PENDING" }, "mock", 30);
    }
    const token = await getAccessToken(creds);
    if (!token)
      return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/invoice/status/${encodeURIComponent(invoiceReference)}`,
        { method: "GET", headers: bearerHeaders(token) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = (
        body as { responseBody?: { invoiceStatus?: string; status?: string; amountPaid?: number } }
      ).responseBody;
      const status = String(data?.invoiceStatus ?? data?.status ?? "PENDING").toUpperCase();
      const amountPaidMinor =
        typeof data?.amountPaid === "number" ? Math.round(data.amountPaid * 100) : undefined;
      return ok({ status, amountPaidMinor }, invoiceReference, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Monnify getInvoiceStatus failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async getInvoiceDetails(invoiceReference) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        {
          status: "PENDING",
          amountMinor: 0,
          customerEmail: "customer@turbopay.ng",
          description: "Mock invoice",
          createdAt: new Date().toISOString(),
        },
        "mock",
        30
      );
    }
    const token = await getAccessToken(creds);
    if (!token)
      return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/invoice/details/${encodeURIComponent(invoiceReference)}`,
        { method: "GET", headers: bearerHeaders(token) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = (
        body as {
          responseBody?: {
            invoiceStatus?: string;
            status?: string;
            amount?: number;
            amountPaid?: number;
            customerEmail?: string;
            description?: string;
            createdOn?: string;
            dateCreated?: string;
            completedOn?: string;
            datePaid?: string;
          };
        }
      ).responseBody;
      return ok(
        {
          status: String(data?.invoiceStatus ?? data?.status ?? "PENDING").toUpperCase(),
          amountMinor: typeof data?.amount === "number" ? Math.round(data.amount * 100) : 0,
          customerEmail: data?.customerEmail ?? "",
          description: data?.description ?? "",
          createdAt: data?.createdOn ?? data?.dateCreated ?? new Date().toISOString(),
          paidAt: data?.completedOn ?? data?.datePaid,
        },
        invoiceReference,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Monnify getInvoiceDetails failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 6. Direct debit (mandate + status + debit)
//    POST /direct-debit/mandate
//    GET  /direct-debit/mandate/:id
//    POST /direct-debit/debit
// ---------------------------------------------------------------------------

export const monnifyDirectDebit: IDirectDebitProvider = {
  contract: "DIRECT_DEBIT",

  async createMandate(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const mandateId = `MNFYMDT-${generateReference("M")}`;
      return ok(
        {
          mandateId,
          status: "PENDING",
          authUrl: `${SANDBOX_BASE}/mock/mandate/auth?id=${mandateId}`,
        },
        "mock",
        150
      );
    }
    const token = await getAccessToken(creds);
    if (!token)
      return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const contractCode = creds.secrets.contractCode;
    if (!contractCode)
      return fail("AUTH_FAILED", "Monnify contractCode missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${base}/direct-debit/mandate`,
        {
          method: "POST",
          headers: bearerHeaders(token),
          body: JSON.stringify({
            contractCode,
            mandateType: req.mandateType ?? "RECURRING",
            payerName: req.payerName,
            payerEmail:
              req.payerEmail ?? `${req.payerName.replace(/\s+/g, ".").toLowerCase()}@turbopay.ng`,
            payerPhone: req.payerPhone,
            amount: req.amountMinor / 100, // major units
            currencyCode: req.currency ?? "NGN",
            startDate: req.startDate,
            endDate: req.endDate,
            frequency: req.frequency ?? "MONTHLY",
            accountNumber: req.accountNumber,
            bankCode: req.bankCode,
            narration: req.narration ?? "TurboPay direct debit mandate",
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = (
        body as {
          responseBody?: {
            mandateId?: string;
            reference?: string;
            status?: string;
            authUrl?: string;
            authorizationUrl?: string;
          };
        }
      ).responseBody;
      const mandateId = String(data?.mandateId ?? data?.reference ?? `MNFYMDT-${Date.now()}`);
      return ok(
        {
          mandateId,
          status: String(data?.status ?? "PENDING").toUpperCase(),
          authUrl: data?.authUrl ?? data?.authorizationUrl,
        },
        mandateId,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Monnify createMandate failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async getMandateStatus(mandateId) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "ACTIVE", mandateId }, "mock", 30);
    }
    const token = await getAccessToken(creds);
    if (!token)
      return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/direct-debit/mandate/${encodeURIComponent(mandateId)}`,
        { method: "GET", headers: bearerHeaders(token) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = (
        body as { responseBody?: { mandateId?: string; status?: string; mandateStatus?: string } }
      ).responseBody;
      return ok(
        {
          status: String(data?.mandateStatus ?? data?.status ?? "ACTIVE").toUpperCase(),
          mandateId: String(data?.mandateId ?? mandateId),
        },
        mandateId,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Monnify getMandateStatus failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async debitMandate(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const providerRef = `MNFYDBT-${generateReference("D")}`;
      return ok({ providerRef, status: "PENDING" }, "mock", 100);
    }
    const token = await getAccessToken(creds);
    if (!token)
      return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/direct-debit/debit`,
        {
          method: "POST",
          headers: bearerHeaders(token),
          body: JSON.stringify({
            mandateId: req.mandateId,
            amount: req.amountMinor / 100, // major units
            narration: req.narration ?? "TurboPay mandate debit",
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = (
        body as {
          responseBody?: {
            debitReference?: string;
            transactionReference?: string;
            status?: string;
          };
        }
      ).responseBody;
      const providerRef = String(
        data?.debitReference ?? data?.transactionReference ?? `MNFYDBT-${Date.now()}`
      );
      return ok(
        { providerRef, status: String(data?.status ?? "PENDING").toUpperCase() },
        providerRef,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Monnify debitMandate failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async stopMandate(mandateId) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "STOPPED", mandateId }, "mock", 30);
    }
    const token = await getAccessToken(creds);
    if (!token)
      return fail("AUTH_FAILED", "Monnify token retrieval failed", { providerCode: CODE });
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/direct-debit/mandate/${encodeURIComponent(mandateId)}/stop`,
        { method: "POST", headers: bearerHeaders(token) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = (body as { responseBody?: { status?: string; mandateStatus?: string } })
        .responseBody;
      return ok(
        {
          status: String(data?.mandateStatus ?? data?.status ?? "STOPPED").toUpperCase(),
          mandateId,
        },
        mandateId,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Monnify stopMandate failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};
