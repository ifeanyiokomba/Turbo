// TurboCore — Flutterwave adapter.
//
// Implements 10 contracts:
//   - flutterwaveCardPayment      (ICardPaymentProvider)             — /charges?type=card
//   - flutterwaveBankTransfer     (IBankTransferProvider)            — /transfers + /banks
//   - flutterwaveIntl             (IInternationalTransferProvider)    — /transfers/rates + /transfers
//   - flutterwaveMobileMoney      (IMobileMoneyProvider)             — /charges?type=mobile_money_*
//   - flutterwaveSubaccounts      (ISplitPaymentProvider)            — /subaccounts CRUD
//   - flutterwavePaymentPlans     (IRecurringBillingProvider)        — /payment-plans CRUD
//   - flutterwaveVirtualCards     (IVirtualCardManagementProvider)   — /virtual-cards CRUD
//   - flutterwaveTransfersToBank  (IBulkTransferProvider)            — /bulk-transfers + /transfers/fee
//   - flutterwaveBillsPayment     (IBillPaymentProvider)             — /bills + /bills/validate
//   - flutterwaveChargebacks      (IChargebackProvider)              — /chargebacks
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
  ISplitPaymentProvider,
  IRecurringBillingProvider,
  IVirtualCardManagementProvider,
  IBulkTransferProvider,
  IBillPaymentProvider,
  IChargebackProvider,
  Biller,
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
      return ok({ balanceMinor: 0, currency: "NGN" }, "mock", 50);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(`${BASE}/balances`, { method: "GET", headers: authHeaders(secretKey) }, (s, b) =>
        defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { available_balance?: number; currency?: string } }).data;
      const bal = typeof data?.available_balance === "number" ? Math.round(data.available_balance * 100) : 0;
      return ok({ balanceMinor: bal, currency: data?.currency ?? "NGN" }, "fw-bal", 0);
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
            narration: "Turbopay mobile money payout",
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

// ---------------------------------------------------------------------------
// 5. Subaccounts / split payments — POST /subaccounts, GET /subaccounts(/:id), PUT, DELETE
// ---------------------------------------------------------------------------

function mapFlwSubaccount(d: Record<string, unknown>): import("../contracts").ISubaccountSummary {
  return {
    subaccountCode: String(d.subaccount_id ?? d.id ?? d.account_reference ?? ""),
    subaccountId: String(d.id ?? d.subaccount_id ?? d.account_reference ?? ""),
    businessName: typeof d.account_name === "string" ? d.account_name : undefined,
    accountName: typeof d.account_name === "string" ? d.account_name : undefined,
    accountNumber: typeof d.account_number === "string" ? d.account_number : undefined,
    bankCode: typeof d.account_bank === "string" ? d.account_bank : undefined,
    accountBank: typeof d.account_bank === "string" ? d.account_bank : undefined,
    currency: typeof d.currency === "string" ? d.currency : "NGN",
    splitType: typeof d.split_type === "string" ? d.split_type : undefined,
    splitValue: typeof d.split_value === "number" ? d.split_value : undefined,
  };
}

export const flutterwaveSubaccounts: ISplitPaymentProvider = {
  contract: "SPLIT_PAYMENT",

  async createSubaccount(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const code = `FLW_SUB-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
      return ok(
        {
          subaccountCode: code,
          subaccountId: code,
          businessName: req.accountName ?? req.businessName ?? "Turbopay Merchant",
          accountName: req.accountName ?? req.businessName ?? "Turbopay Merchant",
          accountNumber: req.accountNumber,
          bankCode: req.accountBank ?? req.bankCode ?? req.settlementBank ?? "",
          accountBank: req.accountBank ?? req.bankCode ?? req.settlementBank ?? "",
          currency: req.currency ?? "NGN",
          splitType: req.splitType ?? "PERCENTAGE",
          splitValue: req.splitValue ?? req.percentageCharge ?? req.defaultPercentage ?? 0,
        },
        "mock",
        80,
      );
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/subaccounts`,
        {
          method: "POST",
          headers: authHeaders(secretKey),
          body: JSON.stringify({
            account_name: req.accountName ?? req.businessName,
            account_bank: req.accountBank ?? req.bankCode ?? req.settlementBank,
            account_number: req.accountNumber,
            currency: req.currency ?? "NGN",
            split_type: (req.splitType ?? "PERCENTAGE").toLowerCase(),
            split_value: req.splitValue ?? req.percentageCharge ?? req.defaultPercentage ?? 0,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: Record<string, unknown> }).data;
      if (!data) return fail("UPSTREAM_ERROR", "Flutterwave createSubaccount returned no data", { providerCode: CODE, raw: sanitize(body) });
      return ok(mapFlwSubaccount(data), String(data.subaccount_id ?? data.id ?? "flw-sub"), 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave createSubaccount failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async listSubaccounts(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok([], "mock", 30);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      const page = req?.page ?? 1;
      const { body } = await http(
        `${BASE}/subaccounts?page=${page}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: Record<string, unknown>[] }).data ?? [];
      return ok(data.map(mapFlwSubaccount), "flw-sub-list", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave listSubaccounts failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async fetchSubaccount(id) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        {
          subaccountCode: id,
          subaccountId: id,
          businessName: "Demo Subaccount",
          accountNumber: "0000000000",
          bankCode: "044",
          currency: "NGN",
          splitType: "PERCENTAGE",
          splitValue: 5,
        },
        "mock",
        20,
      );
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/subaccounts/${encodeURIComponent(id)}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: Record<string, unknown> }).data;
      if (!data) return fail("UPSTREAM_ERROR", "Flutterwave fetchSubaccount returned no data", { providerCode: CODE, raw: sanitize(body) });
      return ok(mapFlwSubaccount(data), id, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave fetchSubaccount failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async updateSubaccount(id, req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        {
          subaccountCode: id,
          subaccountId: id,
          businessName: req.businessName ?? "Updated Subaccount",
          accountNumber: req.accountNumber ?? "0000000000",
          bankCode: req.settlementBank ?? "044",
          currency: "NGN",
          splitType: req.splitType ?? "PERCENTAGE",
          splitValue: req.splitValue ?? 0,
        },
        "mock",
        40,
      );
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      const payload: Record<string, unknown> = {};
      if (req.businessName !== undefined) payload.account_name = req.businessName;
      if (req.settlementBank !== undefined) payload.account_bank = req.settlementBank;
      if (req.accountNumber !== undefined) payload.account_number = req.accountNumber;
      if (req.splitType !== undefined) payload.split_type = String(req.splitType).toLowerCase();
      if (req.splitValue !== undefined) payload.split_value = req.splitValue;
      const { body } = await http(
        `${BASE}/subaccounts/${encodeURIComponent(id)}`,
        { method: "PUT", headers: authHeaders(secretKey), body: JSON.stringify(payload) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: Record<string, unknown> }).data;
      if (!data) return fail("UPSTREAM_ERROR", "Flutterwave updateSubaccount returned no data", { providerCode: CODE, raw: sanitize(body) });
      return ok(mapFlwSubaccount(data), id, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave updateSubaccount failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async deleteSubaccount(id) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ deleted: true }, "mock", 20);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      await http(
        `${BASE}/subaccounts/${encodeURIComponent(id)}`,
        { method: "DELETE", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      return ok({ deleted: true }, id, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave deleteSubaccount failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 6. Payment plans — POST /payment-plans, GET /payment-plans(/:id), PUT /payment-plans/:id/cancel
// ---------------------------------------------------------------------------

export const flutterwavePaymentPlans: IRecurringBillingProvider = {
  contract: "RECURRING_BILLING",

  async createPaymentPlan(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const code = `FLW_PLN-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      return ok({ code, status: "active", id: String(Math.floor(Math.random() * 10000)) }, "mock", 70);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/payment-plans`,
        {
          method: "POST",
          headers: authHeaders(secretKey),
          body: JSON.stringify({
            amount: req.amount,
            name: req.name,
            interval: req.interval,
            duration: req.duration ?? 0,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { id?: number; status?: string; plan?: number; amount?: number; name?: string; interval?: string } }).data;
      if (!data) return fail("UPSTREAM_ERROR", "Flutterwave createPaymentPlan returned no data", { providerCode: CODE, raw: sanitize(body) });
      return ok(
        { code: String(data.id ?? data.plan ?? "flw-plan"), status: data.status ?? "active", id: String(data.id ?? "") },
        String(data.id ?? "flw-plan"),
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave createPaymentPlan failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async listPaymentPlans(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ plans: [], meta: { page_info: { total: 0 } } }, "mock", 25);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      const page = req?.page ?? 1;
      const { body } = await http(
        `${BASE}/payment-plans?page=${page}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: unknown[]; meta?: Record<string, unknown> }).data ?? [];
      const meta = (body as { meta?: Record<string, unknown> }).meta;
      return ok({ plans: data, meta }, "flw-plan-list", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave listPaymentPlans failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async fetchPaymentPlan(id) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ plan: { id, name: "Demo Plan", amount: 1000, interval: "monthly" } }, "mock", 20);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/payment-plans/${encodeURIComponent(id)}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: Record<string, unknown> }).data;
      if (!data) return fail("UPSTREAM_ERROR", "Flutterwave fetchPaymentPlan returned no data", { providerCode: CODE, raw: sanitize(body) });
      return ok({ plan: data }, id, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave fetchPaymentPlan failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async cancelPaymentPlan(id) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "cancelled" }, "mock", 25);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/payment-plans/${encodeURIComponent(id)}/cancel`,
        { method: "PUT", headers: authHeaders(secretKey), body: JSON.stringify({}) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { status?: string } }).data;
      return ok({ status: (data?.status ?? "cancelled").toUpperCase() }, id, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave cancelPaymentPlan failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 7. Virtual cards — POST /virtual-cards, GET /virtual-cards/:id, POST /virtual-cards/:id/fund, DELETE
// ---------------------------------------------------------------------------

export const flutterwaveVirtualCards: IVirtualCardManagementProvider = {
  contract: "VIRTUAL_CARD_MGMT",

  async createVirtualCard(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const id = `FLW-VC-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
      return ok(
        {
          id,
          currency: req.currency,
          amountMinor: req.amountMinor,
          billingName: req.billingName,
          billingAddress: req.billingAddress,
          last4: "1234",
          status: "active",
        },
        "mock",
        100,
      );
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      const payload: Record<string, unknown> = {
        currency: req.currency,
        amount: req.amountMinor / 100, // Flutterwave uses major units
        billing_name: req.billingName,
      };
      if (req.billingAddress) payload.billing_address = req.billingAddress;
      const { body } = await http(
        `${BASE}/virtual-cards`,
        { method: "POST", headers: authHeaders(secretKey), body: JSON.stringify(payload) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { id?: string; cvv?: string; card_pan?: string; last4?: string; name_on_card?: string; status?: string; currency?: string; amount?: number } }).data;
      if (!data) return fail("UPSTREAM_ERROR", "Flutterwave createVirtualCard returned no data", { providerCode: CODE, raw: sanitize(body) });
      return ok(
        {
          id: String(data.id ?? "flw-vc"),
          currency: data.currency ?? req.currency,
          amountMinor: typeof data.amount === "number" ? Math.round(data.amount * 100) : req.amountMinor,
          billingName: data.name_on_card ?? req.billingName,
          billingAddress: req.billingAddress,
          last4: data.last4,
          status: data.status ?? "active",
        },
        String(data.id ?? "flw-vc"),
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave createVirtualCard failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async getVirtualCard(id) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { id, currency: "USD", amountMinor: 0, billingName: "Turbopay User", last4: "1234", status: "active" },
        "mock",
        20,
      );
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/virtual-cards/${encodeURIComponent(id)}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { id?: string; currency?: string; amount?: number; name_on_card?: string; last4?: string; status?: string } }).data;
      if (!data) return fail("UPSTREAM_ERROR", "Flutterwave getVirtualCard returned no data", { providerCode: CODE, raw: sanitize(body) });
      return ok(
        {
          id: String(data.id ?? id),
          currency: data.currency ?? "USD",
          amountMinor: typeof data.amount === "number" ? Math.round(data.amount * 100) : 0,
          billingName: data.name_on_card ?? "",
          last4: data.last4,
          status: data.status,
        },
        id,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave getVirtualCard failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async fundVirtualCard(id, req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "success", balanceMinor: req.amountMinor }, "mock", 60);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/virtual-cards/${encodeURIComponent(id)}/fund`,
        {
          method: "POST",
          headers: authHeaders(secretKey),
          body: JSON.stringify({ amount: req.amountMinor / 100, currency: req.currency ?? "USD" }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { status?: string; amount?: number; new_balance?: number; currency?: string } }).data;
      const balanceMinor = typeof data?.new_balance === "number" ? Math.round(data.new_balance * 100) : typeof data?.amount === "number" ? Math.round(data.amount * 100) : undefined;
      return ok({ status: data?.status ?? "success", balanceMinor }, id, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave fundVirtualCard failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async terminateVirtualCard(id) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "terminated" }, "mock", 30);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      await http(
        `${BASE}/virtual-cards/${encodeURIComponent(id)}`,
        { method: "DELETE", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      return ok({ status: "terminated" }, id, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave terminateVirtualCard failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 8. Bulk transfers — POST /bulk-transfers, POST /transfers/fee
// ---------------------------------------------------------------------------

export const flutterwaveTransfersToBank: IBulkTransferProvider = {
  contract: "BULK_TRANSFER",

  async bulkTransfer(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const batchId = `FLW-BULK-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
      const totalCreditMinor = req.bulkData.reduce((acc, b) => acc + b.amountMinor, 0);
      return ok(
        {
          batchId,
          status: "PENDING",
          totalCreditMinor,
          totalDebitMinor: totalCreditMinor,
          entryCount: req.bulkData.length,
        },
        "mock",
        120,
      );
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      const bulkData = req.bulkData.map((b, i) => ({
        bank_code: b.bankCode,
        account_number: b.accountNumber,
        amount: b.amountMinor / 100,
        currency: b.currency ?? req.currency ?? "NGN",
        narration: b.narration ?? `Turbopay bulk transfer ${i + 1}`,
        reference: b.reference ?? `flw-bulk-${Date.now()}-${i}`,
      }));
      const { body } = await http(
        `${BASE}/bulk-transfers`,
        {
          method: "POST",
          headers: authHeaders(secretKey),
          body: JSON.stringify({ bulk_data: bulkData, title: req.title }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { id?: number; status?: string; total_credit?: number; total_debit?: number; total_approved_amount?: number; count?: number; approvers?: unknown[] } }).data;
      const batchId = String(data?.id ?? `flw-bulk-${Date.now()}`);
      const totalCreditMinor = typeof data?.total_credit === "number" ? Math.round(data.total_credit * 100) : undefined;
      const totalDebitMinor = typeof data?.total_debit === "number" ? Math.round(data.total_debit * 100) : undefined;
      const entryCount = typeof data?.count === "number" ? data.count : req.bulkData.length;
      return ok(
        { batchId, status: (data?.status ?? "PENDING").toUpperCase(), totalCreditMinor, totalDebitMinor, entryCount },
        batchId,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave bulkTransfer failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async fetchTransferFee(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ feeMinor: 50, currency: req.currency }, "mock", 40);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/transfers/fee`,
        {
          method: "POST",
          headers: authHeaders(secretKey),
          body: JSON.stringify({ amount: req.amountMinor / 100, currency: req.currency }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { fee?: number; currency?: string } }).data;
      const feeMinor = typeof data?.fee === "number" ? Math.round(data.fee * 100) : 0;
      return ok({ feeMinor, currency: data?.currency ?? req.currency }, "flw-fee", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave fetchTransferFee failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 9. Bills payment — GET /bills, GET /bills/:category, POST /bills/validate, POST /bills
// ---------------------------------------------------------------------------

function mapFlwBiller(d: Record<string, unknown>, category: string, country: string): Biller {
  return {
    code: String(d.item_code ?? d.id ?? d.billerCode ?? ""),
    name: String(d.name ?? d.biller_name ?? "Unknown Biller"),
    category,
    country,
    refLabel: String(d.customer_ref_label ?? "Customer ID"),
    refType: String(d.customer_ref_type ?? "MSISDN"),
  };
}

export const flutterwaveBillsPayment: IBillPaymentProvider = {
  contract: "BILL_PAYMENT",

  async listBillers(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok([], "mock", 30);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      // If a category is provided, list billers under that category.
      // Otherwise fetch all bill categories (Flutterwave treats /bills as the
      // category list and /bills/:category as the biller list within).
      const url = req.category
        ? `${BASE}/bills/${encodeURIComponent(req.category)}?country=${encodeURIComponent(req.country)}`
        : `${BASE}/bills?country=${encodeURIComponent(req.country)}`;
      const { body } = await http(
        url,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: Record<string, unknown>[] }).data ?? [];
      const billers = data.map((d) =>
        mapFlwBiller(d, req.category ?? String(d.category ?? "general"), req.country),
      );
      return ok(billers, "flw-billers", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave listBillers failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async validateCustomer(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ customerName: `MOCK ${req.customerRef.slice(-4)}`, valid: true }, "mock", 30);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/bills/validate`,
        {
          method: "POST",
          headers: authHeaders(secretKey),
          body: JSON.stringify({
            item_code: req.billerCode,
            code: req.billerCode,
            customer: req.customerRef,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { response_message?: string; name?: string; valid?: boolean; status?: string; account_name?: string; customer_name?: string } }).data;
      const valid = (data?.status ?? "").toLowerCase() === "success" || data?.valid === true;
      const customerName = data?.name ?? data?.customer_name ?? data?.account_name ?? "";
      return ok(
        { customerName, valid, metadata: { response_message: data?.response_message } },
        "flw-validate",
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave validateCustomer failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async payBill(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `flw-bill-${req.reference}`, status: "success" }, "mock", 100);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/bills`,
        {
          method: "POST",
          headers: authHeaders(secretKey),
          body: JSON.stringify({
            country: "NG",
            customer: req.customerRef,
            amount: req.amountMinor / 100,
            type: req.productCode ?? req.billerCode,
            reference: req.reference,
            item_code: req.billerCode,
            currency: req.currency,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { flw_ref?: string; status?: string; tx_ref?: string; receipt_number?: string; token?: string; units?: string; amount?: number; currency?: string } }).data;
      const providerRef = data?.flw_ref ?? data?.tx_ref ?? req.reference;
      return ok(
        {
          providerRef,
          status: (data?.status ?? "pending").toLowerCase(),
          token: data?.token,
          units: data?.units,
          receipt: data?.receipt_number,
        },
        providerRef,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave payBill failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async queryBillPayment(providerRef) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "success" }, "mock", 20);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/bills/${encodeURIComponent(providerRef)}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { status?: string; token?: string } }).data;
      return ok({ status: (data?.status ?? "pending").toLowerCase(), token: data?.token }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave queryBillPayment failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 10. Chargebacks — GET /chargebacks(/:id)
// ---------------------------------------------------------------------------

function mapFlwChargeback(d: Record<string, unknown>): import("../contracts").IChargeback {
  return {
    id: String(d.id ?? d.chargeback_id ?? ""),
    amountMinor: typeof d.amount === "number" ? Math.round(d.amount * 100) : 0,
    currency: typeof d.currency === "string" ? d.currency : "NGN",
    status: String(d.status ?? "pending"),
    reason: typeof d.reason === "string" ? d.reason : undefined,
    flwRef: typeof d.flw_ref === "string" ? d.flw_ref : undefined,
    merchantId: typeof d.merchant_id === "string" ? d.merchant_id : undefined,
    createdAt: typeof d.created_at === "string" ? d.created_at : undefined,
  };
}

export const flutterwaveChargebacks: IChargebackProvider = {
  contract: "CHARGEBACK",

  async listChargebacks(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ chargebacks: [], meta: {} }, "mock", 30);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      const page = req?.page ?? 1;
      const { body } = await http(
        `${BASE}/chargebacks?page=${page}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: Record<string, unknown>[]; meta?: Record<string, unknown> }).data ?? [];
      const meta = (body as { meta?: Record<string, unknown> }).meta;
      return ok({ chargebacks: data.map(mapFlwChargeback), meta }, "flw-chargeback-list", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave listChargebacks failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async fetchChargeback(id) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ id, amountMinor: 0, currency: "NGN", status: "pending" }, "mock", 20);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Flutterwave secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/chargebacks/${encodeURIComponent(id)}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: Record<string, unknown> }).data;
      if (!data) return fail("UPSTREAM_ERROR", "Flutterwave fetchChargeback returned no data", { providerCode: CODE, raw: sanitize(body) });
      return ok(mapFlwChargeback(data), id, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Flutterwave fetchChargeback failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

