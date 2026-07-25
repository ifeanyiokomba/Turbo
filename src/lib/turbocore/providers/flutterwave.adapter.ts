// TurboCore — Flutterwave adapter.
//
// Implements 4 contracts:
//   - flutterwaveCardPayment   (ICardPaymentProvider)            — /charges?type=card
//   - flutterwaveBankTransfer  (IBankTransferProvider)           — /transfers + /banks
//   - flutterwaveIntl          (IInternationalTransferProvider)   — /transfers/rates + /transfers
//   - flutterwaveMobileMoney   (IMobileMoneyProvider)            — /charges?type=mobile_money_*
//
// Base URL: https://api.flutterwave.com/v3 (sandbox uses the same host with
// test keys prefixed `FLWTEST-...`).
//
// Secrets expected: { "secretKey": "FLWSECK-...", "publicKey": "FLWPUBK-...",
// "encryptionKey": "FLWSECK_TEST..." }

import { ok, fail } from "../result";
import type {
  ICardPaymentProvider,
  IBankTransferProvider,
  IInternationalTransferProvider,
  IMobileMoneyProvider,
} from "../contracts";
import { requireCreds, loadCreds, http, defaultHttpError, sanitize, mockWarnOnce } from "./_shared";
import { NIGERIAN_BANKS, UNIQUE_BANKS } from "@/lib/banks";

const CODE = "flutterwave";
const BASE = "https://api.flutterwave.com/v3";

function authHeaders(secretKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// Map Flutterwave's `status` field ("success" | "failed" | "pending" | "cancelled")
// into the 3-state union our contract expects.
function mapStatus(s: string | undefined): "PENDING" | "SUCCESS" | "FAILED" {
  const v = (s ?? "").toLowerCase();
  if (v === "success" || v === "successful") return "SUCCESS";
  if (v === "failed" || v === "cancelled" || v === "error") return "FAILED";
  return "PENDING";
}

// ---------------------------------------------------------------------------
// 1. Card payment
// ---------------------------------------------------------------------------

export const flutterwaveCardPayment: ICardPaymentProvider = {
  contract: "CARD_PAYMENT",

  async initializeCharge(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `fw-mock-${req.reference}`, status: "3DS_REQUIRED", authUrl: `${BASE}/mock/charge?ref=${req.reference}` }, "mock", 60);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/charges?type=card`,
        {
          method: "POST",
          headers: authHeaders(secretKey),
          body: JSON.stringify({
            amount: req.amountMinor / 100, // Flutterwave expects MAJOR units
            currency: req.currency,
            email: req.customer.email ?? "customer@turbopay.ng",
            tx_ref: req.reference,
            fullname: req.customer.name,
            phone_number: req.customer.phone,
            redirect_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/flutterwave/return`,
            meta: req.metadata ?? {},
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as {
        data?: { id?: number; tx_ref?: string; status?: string; link?: string; flw_ref?: string };
      }).data;
      const providerRef = String(data?.id ?? data?.tx_ref ?? req.reference);
      const authUrl = data?.link;
      const status: "PENDING" | "SUCCESS" | "3DS_REQUIRED" = authUrl ? "3DS_REQUIRED" : "PENDING";
      return ok({ providerRef, status, authUrl }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave charge failed";
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
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      // providerRef is either the tx_ref or the numeric id — Flutterwave's
      // verify endpoint accepts either via /transactions/:id/verify (numeric)
      // or /transactions/verify_by_reference?tx_ref=...
      const url = /^\d+$/.test(providerRef)
        ? `${BASE}/transactions/${encodeURIComponent(providerRef)}/verify`
        : `${BASE}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(providerRef)}`;
      const { body } = await http(url, { method: "GET", headers: authHeaders(secretKey) }, (s, b) =>
        defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { status?: string; amount?: number; currency?: string; amount_settled?: number } }).data;
      const amount = typeof data?.amount === "number" ? Math.round(data.amount * 100) : 0; // major → minor
      const settled = typeof data?.amount_settled === "number" ? Math.round(data.amount_settled * 100) : amount;
      return ok({ status: data?.status ?? "pending", amountSettledMinor: settled, currency: data?.currency ?? "NGN" }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave verify failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async refund(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ refundRef: `fw-refund-${req.providerRef}`, status: "pending" }, "mock", 70);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      const payload: Record<string, unknown> = { amount: (req.amountMinor ?? 0) / 100 };
      if (req.reason) payload.comments = req.reason;
      const { body } = await http(
        `${BASE}/transactions/${encodeURIComponent(req.providerRef)}/refund`,
        { method: "POST", headers: authHeaders(secretKey), body: JSON.stringify(payload) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { id?: number; status?: string } }).data;
      return ok(
        { refundRef: `fw-refund-${data?.id ?? req.providerRef}`, status: data?.status ?? "pending" },
        `fw-refund-${data?.id ?? ""}`,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave refund failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 2. Bank transfer
// ---------------------------------------------------------------------------

export const flutterwaveBankTransfer: IBankTransferProvider = {
  contract: "BANK_TRANSFER",

  async listBanks(country) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(UNIQUE_BANKS.map((b) => ({ ...b, country })), "mock", 12);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/banks/${encodeURIComponent(country)}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: Array<{ code?: string; name?: string }> }).data ?? [];
      const banks = data
        .filter((b) => b.code && b.name)
        .map((b) => ({ code: String(b.code), name: String(b.name), short: String(b.name), country }));
      return ok(banks.length ? banks : UNIQUE_BANKS.map((b) => ({ ...b, country })), "fw-banks", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave listBanks failed";
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
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/accounts/resolve`,
        {
          method: "POST",
          headers: authHeaders(secretKey),
          body: JSON.stringify({ account_number: req.accountNumber, account_bank: req.bankCode }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { account_name?: string } }).data;
      if (!data?.account_name) {
        return fail("BENEFICIARY_INVALID", "Flutterwave could not resolve account", { providerCode: CODE, raw: sanitize(body) });
      }
      const known = NIGERIAN_BANKS.find((b) => b.code === req.bankCode);
      return ok({ accountName: data.account_name, bankName: known?.name ?? req.bankCode }, "fw-resolve", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave resolve failed";
      const code: "UPSTREAM_ERROR" | "BENEFICIARY_INVALID" = /404|not found/i.test(msg) ? "BENEFICIARY_INVALID" : "UPSTREAM_ERROR";
      return fail(code, msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async initiateTransfer(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `fw-trf-${req.reference}`, status: "PENDING" }, "mock", 110);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/transfers`,
        {
          method: "POST",
          headers: authHeaders(secretKey),
          body: JSON.stringify({
            account_bank: req.beneficiary.bankCode,
            account_number: req.beneficiary.accountNumber,
            amount: req.amountMinor / 100,
            currency: req.currency,
            narration: req.narration ?? "Turbopay transfer",
            reference: req.reference,
            callback_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/flutterwave/transfer`,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { id?: number; status?: string } }).data;
      const providerRef = String(data?.id ?? `fw-trf-${req.reference}`);
      return ok({ providerRef, status: mapStatus(data?.status) }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave transfer failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async getTransferStatus(providerRef) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "SUCCESS", settlementTime: new Date().toISOString() }, "mock", 18);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/transfers/${encodeURIComponent(providerRef)}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { status?: string; created_at?: string } }).data;
      return ok({ status: (data?.status ?? "pending").toUpperCase(), settlementTime: data?.created_at }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave getTransferStatus failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async reverseTransfer(req) {
    // Flutterwave supports transfer reversal via /transfers/:id/reverse (paid
    // transfers require a refund request). For unpaid transfers this succeeds
    // immediately; for paid ones we surface a PENDING reversal reference.
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ reversalRef: `fw-rev-${req.providerRef}`, status: "SUCCESS" }, "mock", 50);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/transfers/${encodeURIComponent(req.providerRef)}/reverse`,
        { method: "POST", headers: authHeaders(secretKey), body: JSON.stringify({ reason: req.reason }) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { id?: number; status?: string } }).data;
      return ok(
        { reversalRef: `fw-rev-${data?.id ?? req.providerRef}`, status: (data?.status ?? "pending").toUpperCase() },
        `fw-rev-${data?.id ?? ""}`,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave reverse failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 3. International transfer
// ---------------------------------------------------------------------------

export const flutterwaveIntl: IInternationalTransferProvider = {
  contract: "INTERNATIONAL_TRANSFER",

  async getQuote(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const rate = req.sourceCurrency === "NGN" && req.targetCurrency === "USD" ? 1 / 1480 : 1;
      return ok({ rate, feeMinor: 500, totalMinor: req.amountMinor + 500, expiresAt: new Date(Date.now() + 60_000).toISOString() }, "mock", 80);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/transfers/rates`,
        {
          method: "POST",
          headers: authHeaders(secretKey),
          body: JSON.stringify({
            amount: req.amountMinor / 100,
            destination_currency: req.targetCurrency,
            source_currency: req.sourceCurrency,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { rate?: number; fee?: number; total?: number; expires_at?: string } }).data;
      const rate = Number(data?.rate ?? 0);
      const feeMinor = typeof data?.fee === "number" ? Math.round(data.fee * 100) : 0;
      const totalMinor = typeof data?.total === "number" ? Math.round(data.total * 100) : req.amountMinor + feeMinor;
      return ok(
        { rate, feeMinor, totalMinor, expiresAt: data?.expires_at ?? new Date(Date.now() + 60_000).toISOString() },
        "fw-quote",
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave getQuote failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async sendTransfer(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `fw-intl-${req.reference}`, status: "PENDING", estimatedDelivery: new Date(Date.now() + 24 * 3600_000).toISOString() }, "mock", 200);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });
    try {
      const payload: Record<string, unknown> = {
        account_bank: req.beneficiary.swiftCode ?? req.beneficiary.bankName,
        account_number: req.beneficiary.iban ?? req.beneficiary.accountNumber,
        amount: req.amountMinor / 100,
        currency: req.currency,
        narration: req.narration ?? "Turbopay international transfer",
        reference: req.reference,
        beneficiary_name: req.beneficiary.name,
      };
      const { body } = await http(
        `${BASE}/transfers`,
        { method: "POST", headers: authHeaders(secretKey), body: JSON.stringify(payload) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { id?: number; status?: string; expected_delivery?: string } }).data;
      return ok(
        {
          providerRef: String(data?.id ?? `fw-intl-${req.reference}`),
          status: (data?.status ?? "PENDING").toUpperCase(),
          estimatedDelivery: data?.expected_delivery,
        },
        `fw-intl-${data?.id ?? ""}`,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave intl transfer failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async getTransferStatus(providerRef) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "PENDING", timeline: [{ status: "initiated", at: new Date().toISOString() }] }, "mock", 20);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/transfers/${encodeURIComponent(providerRef)}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { status?: string; created_at?: string; completed_at?: string } }).data;
      const timeline: { status: string; at: string }[] = [];
      if (data?.created_at) timeline.push({ status: "initiated", at: data.created_at });
      if (data?.completed_at) timeline.push({ status: "completed", at: data.completed_at });
      return ok({ status: (data?.status ?? "pending").toUpperCase(), timeline }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave getTransferStatus failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async cancelTransfer(providerRef) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "CANCELLED" }, "mock", 30);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });
    try {
      // Flutterwave allows cancellation of NEW transfers via /transfers/:id/cancel
      const { body } = await http(
        `${BASE}/transfers/${encodeURIComponent(providerRef)}/cancel`,
        { method: "POST", headers: authHeaders(secretKey), body: JSON.stringify({}) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { status?: string } }).data;
      return ok({ status: (data?.status ?? "CANCELLED").toUpperCase() }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave cancel failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 4. Mobile money (Ghana / Uganda / Rwanda / Zambia)
// ---------------------------------------------------------------------------

function pickMobileMoneyChannel(walletProvider: string): string {
  const p = walletProvider.toLowerCase();
  if (p.includes("ghana") || p === "mtn-gh" || p === "mtn-ghana") return "mobile_money_ghana";
  if (p.includes("uganda") || p === "mtn-ug") return "mobile_money_uganda";
  if (p.includes("rwanda")) return "mobile_money_rwanda";
  if (p.includes("zambia")) return "mobile_money_zambia";
  return "mobile_money_ghana"; // default fallback
}

export const flutterwaveMobileMoney: IMobileMoneyProvider = {
  contract: "MOBILE_MONEY",

  async getBalance(req) {
    // Flutterwave exposes wallet balance via GET /balances — denominated in NGN.
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ balanceMinor: 0, currency: req.currency ?? "NGN" }, "mock", 50);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(`${BASE}/balances`, { method: "GET", headers: authHeaders(secretKey) }, (s, b) =>
        defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { available_balance?: number; currency?: string } }).data;
      const bal = typeof data?.available_balance === "number" ? Math.round(data.available_balance * 100) : 0;
      return ok({ balanceMinor: bal, currency: data?.currency ?? req.currency ?? "NGN" }, "fw-bal", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave getBalance failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async collect(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `fw-momo-${req.reference}`, status: "PENDING" }, "mock", 200);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });
    try {
      const channel = pickMobileMoneyChannel(req.walletProvider);
      const { body } = await http(
        `${BASE}/charges?type=${channel}`,
        {
          method: "POST",
          headers: authHeaders(secretKey),
          body: JSON.stringify({
            amount: req.amountMinor / 100,
            currency: req.currency,
            email: "customer@turbopay.ng",
            phone_number: req.phone,
            network: req.walletProvider,
            tx_ref: req.reference,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { id?: number; status?: string; flw_ref?: string } }).data;
      return ok(
        { providerRef: String(data?.id ?? `fw-momo-${req.reference}`), status: (data?.status ?? "PENDING").toUpperCase() },
        `fw-momo-${data?.id ?? ""}`,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave mobile money collect failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async disburse(req) {
    // B2C disbursement: Flutterwave treats these as outbound transfers to a
    // mobile-money account (no `account_bank` for MM — set to "MPS" etc).
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `fw-momo-out-${req.reference}`, status: "PENDING" }, "mock", 200);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/transfers`,
        {
          method: "POST",
          headers: authHeaders(secretKey),
          body: JSON.stringify({
            account_bank: "MPS",
            account_number: req.phone,
            amount: req.amountMinor / 100,
            currency: req.currency,
            narration: req.narration ?? "Turbopay mobile money payout",
            reference: req.reference,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { id?: number; status?: string } }).data;
      return ok(
        { providerRef: String(data?.id ?? `fw-momo-out-${req.reference}`), status: mapStatus(data?.status) },
        `fw-momo-out-${data?.id ?? ""}`,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave mobile money disburse failed";
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
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/transactions/${encodeURIComponent(providerRef)}/verify`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { status?: string } }).data;
      return ok({ status: (data?.status ?? "pending").toUpperCase() }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave getStatus failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

