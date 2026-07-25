// TurboCore — Wise (TransferWise) adapter.
//
// Implements 2 contracts:
//   - wiseIntl          (IInternationalTransferProvider)
//   - wiseExchangeRate  (IExchangeRateProvider)
//
// Base URLs:
//   live:    https://api.wise.com
//   sandbox: https://api.sandbox.transferwise.tech
//
// Auth: `Authorization: Bearer ${apiToken}`.
//
// Quote flow: POST /v2/quotes returns a quote with rate + fee + total.
// Transfer flow: POST /v1/transfers creates a transfer against the quote.
//
// Secrets expected: { "apiToken": "...", "profileId": "..." }

import { ok, fail } from "../result";
import type { IInternationalTransferProvider, IExchangeRateProvider } from "../contracts";
import { requireCreds, loadCreds, http, defaultHttpError, sanitize, mockWarnOnce } from "./_shared";

const CODE = "wise";
const LIVE_BASE = "https://api.wise.com";
const SANDBOX_BASE = "https://api.sandbox.transferwise.tech";

function authHeaders(apiToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function pickBase(creds: { sandbox: boolean }): string {
  return creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
}

// ---------------------------------------------------------------------------
// 1. International transfer
// ---------------------------------------------------------------------------

export const wiseIntl: IInternationalTransferProvider = {
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
    const apiToken = creds.secrets.apiToken;
    if (!apiToken) return fail("AUTH_FAILED", "Wise apiToken missing", { providerCode: CODE });
    const base = pickBase(creds);
    try {
      const { body } = await http(
        `${base}/v2/quotes`,
        {
          method: "POST",
          headers: authHeaders(apiToken),
          body: JSON.stringify({
            sourceCurrency: req.sourceCurrency,
            targetCurrency: req.targetCurrency,
            sourceAmount: req.amountMinor / 100, // Wise uses major units
            targetType: "BALANCE",
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as {
        id?: string;
        rate?: number;
        fee?: number;
        total?: number;
        sourceAmount?: number;
        targetAmount?: number;
        rateType?: string;
        createdTime?: string;
        deliveryEstimate?: string;
      });
      const rate = Number(data?.rate ?? 0);
      const feeMinor = typeof data?.fee === "number" ? Math.round(data.fee * 100) : 0;
      const totalMinor = typeof data?.total === "number" ? Math.round(data.total * 100) : req.amountMinor + feeMinor;
      return ok(
        {
          rate,
          feeMinor,
          totalMinor,
          expiresAt: data?.deliveryEstimate ?? new Date(Date.now() + 60_000).toISOString(),
        },
        data?.id ?? "wise-quote",
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wise getQuote failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async sendTransfer(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `wise-intl-${req.reference}`, status: "PENDING", estimatedDelivery: new Date(Date.now() + 24 * 3600_000).toISOString() }, "mock", 200);
    }
    const apiToken = creds.secrets.apiToken;
    if (!apiToken) return fail("AUTH_FAILED", "Wise apiToken missing", { providerCode: CODE });
    const profileId = creds.secrets.profileId;
    if (!profileId) return fail("AUTH_FAILED", "Wise profileId missing", { providerCode: CODE });
    const base = pickBase(creds);

    try {
      // Step 1 — create a quote for the requested amount.
      const { body: quoteBody } = await http(
        `${base}/v2/quotes`,
        {
          method: "POST",
          headers: authHeaders(apiToken),
          body: JSON.stringify({
            sourceCurrency: req.currency,
            targetCurrency: req.beneficiary.currency ?? req.currency,
            sourceAmount: req.amountMinor / 100,
            targetType: "BALANCE",
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const quoteId = (quoteBody as { id?: string }).id;
      if (!quoteId) {
        return fail("UPSTREAM_ERROR", "Wise quote creation failed", { providerCode: CODE, raw: sanitize(quoteBody) });
      }

      // Step 2 — create a recipient account (lookup or create). For brevity
      // we assume the caller passes a targetAccount reference in
      // `beneficiary.routingNumber` (Wise recipientId). If absent we fall back
      // to the mock path so callers can still test the happy path.
      const targetAccount = req.beneficiary.routingNumber ?? req.beneficiary.accountNumber ?? "";
      if (!targetAccount) {
        return fail("INVALID_REQUEST", "Wise transfer requires beneficiary.routingNumber (recipientId)", { providerCode: CODE });
      }

      // Step 3 — create the transfer.
      const { body } = await http(
        `${base}/v1/transfers`,
        {
          method: "POST",
          headers: authHeaders(apiToken),
          body: JSON.stringify({
            targetAccount: Number(targetAccount),
            quoteUuid: quoteId,
            details: {
              reference: req.reference,
              transferPurpose: "verification.transfers.purpose.other",
              sourceOfFunds: "verification.source.of.funds.other",
            },
            customerTransactionId: req.reference,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: number; status?: string; details?: { reference?: string; estimatedDelivery?: string } });
      const providerRef = String(data?.id ?? `wise-intl-${req.reference}`);
      return ok(
        {
          providerRef,
          status: (data?.status ?? "incoming_payment_waiting").toUpperCase(),
          estimatedDelivery: data?.details?.estimatedDelivery,
        },
        providerRef,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wise sendTransfer failed";
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
    const apiToken = creds.secrets.apiToken;
    if (!apiToken) return fail("AUTH_FAILED", "Wise apiToken missing", { providerCode: CODE });
    const base = pickBase(creds);
    try {
      const { body } = await http(
        `${base}/v1/transfers/${encodeURIComponent(providerRef)}`,
        { method: "GET", headers: authHeaders(apiToken) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as {
        status?: string;
        details?: {
          reference?: string;
          estimatedDelivery?: string;
          transferState?: string;
        };
      });
      const timeline: { status: string; at: string; note?: string }[] = [];
      if (data?.details?.estimatedDelivery) {
        timeline.push({ status: "estimated_delivery", at: data.details.estimatedDelivery });
      }
      return ok({ status: (data?.status ?? "PENDING").toUpperCase(), timeline }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wise getTransferStatus failed";
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
    const apiToken = creds.secrets.apiToken;
    if (!apiToken) return fail("AUTH_FAILED", "Wise apiToken missing", { providerCode: CODE });
    const base = pickBase(creds);
    try {
      // Wise cancellation: POST /v1/transfers/:id/cancel with a reason.
      const { body } = await http(
        `${base}/v1/transfers/${encodeURIComponent(providerRef)}/cancel`,
        {
          method: "POST",
          headers: authHeaders(apiToken),
          body: JSON.stringify({ reason: "Customer requested cancellation" }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { status?: string });
      return ok({ status: (data?.status ?? "cancelled").toUpperCase() }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wise cancel failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 2. Exchange rate
// ---------------------------------------------------------------------------

export const wiseExchangeRate: IExchangeRateProvider = {
  contract: "EXCHANGE_RATE",

  async getRate(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const rates: Record<string, number> = { "NGN-USD": 1 / 1480, "USD-NGN": 1480, "NGN-KES": 11.4, "USD-KES": 168 };
      return ok({ rate: rates[`${req.base}-${req.quote}`] ?? 1, source: "mock", timestamp: new Date().toISOString() }, "mock", 20);
    }
    const apiToken = creds.secrets.apiToken;
    if (!apiToken) return fail("AUTH_FAILED", "Wise apiToken missing", { providerCode: CODE });
    const base = pickBase(creds);
    try {
      // Wise exposes live rates via GET /v1/rates?source=&target=
      const { body } = await http(
        `${base}/v1/rates?source=${encodeURIComponent(req.base)}&target=${encodeURIComponent(req.quote)}`,
        { method: "GET", headers: authHeaders(apiToken) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { rate?: number; source?: string; target?: string; time?: string });
      if (typeof data?.rate !== "number") {
        return fail("UPSTREAM_ERROR", "Wise returned no rate", { providerCode: CODE, raw: sanitize(body) });
      }
      return ok({ rate: Number(data.rate), source: "wise", timestamp: data.time ?? new Date().toISOString() }, "wise-rate", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wise getRate failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async listSupported() {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ pairs: [{ base: "NGN", quote: "USD" }, { base: "USD", quote: "KES" }, { base: "USD", quote: "GBP" }] }, "mock", 10);
    }
    // Wise doesn't expose a "list all supported pairs" endpoint — we return
    // a curated set of the most-traded pairs against USD + NGN + KES.
    const pairs = [
      { base: "USD", quote: "NGN" },
      { base: "USD", quote: "KES" },
      { base: "USD", quote: "GHS" },
      { base: "USD", quote: "GBP" },
      { base: "USD", quote: "EUR" },
      { base: "GBP", quote: "NGN" },
      { base: "EUR", quote: "NGN" },
      { base: "NGN", quote: "USD" },
      { base: "KES", quote: "USD" },
    ];
    return ok({ pairs }, "wise-pairs", 0);
  },
};
