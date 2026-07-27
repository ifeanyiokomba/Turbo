// TurboCore — Wise (TransferWise) adapter.
//
// Implements 4 contracts + 1 extension:
//   - wiseIntl              (IInternationalTransferProvider + WiseTransferExtensions)
//     • getQuote / sendTransfer / getTransferStatus / cancelTransfer  (existing)
//     • createQuote / createTransfer / fundTransfer / estimateTransferTime (new)
//   - wiseExchangeRate      (IExchangeRateProvider)
//   - wiseRecipients        (IRecipientProvider)                  — new
//   - wiseBalances          (IMultiCurrencyBalanceProvider)       — new
//   - wiseProfiles          (WiseProfiles extension)              — new
//
// Base URLs:
//   live:    https://api.wise.com
//   sandbox: https://api.sandbox.transferwise.tech
//
// Auth: `Authorization: Bearer ${apiToken}`.
//
// Quote flow:      POST /v2/quotes returns a quote with rate + fee + total.
// Transfer flow:   POST /v1/transfers creates a transfer against the quote.
// Fund flow:       POST /v3/profiles/:profileId/transfers/:transferId/payments
//                  funds a transfer from the Wise multi-currency balance.
// Recipient flow:  POST /v1/recipients creates a payout recipient.
// Profile flow:    POST /v1/profiles creates a personal/business profile.
// Balance flow:    GET  /v1/balances?profileId= lists multi-currency balances.
// Delivery flow:   GET  /v1/delivery-estimates?sourceCurrency=&targetCurrency=
//
// Secrets expected: { "apiToken": "...", "profileId": "..." }

import { ok, fail } from "../result";
import type { ProviderResult } from "../result";
import type {
  IInternationalTransferProvider,
  IExchangeRateProvider,
  IRecipientProvider,
  IMultiCurrencyBalanceProvider,
  RecipientSummary,
  BalanceSummary,
} from "../contracts";
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

// Extension surface for the Wise international transfer provider.
export interface WiseTransferExtensions {
  createQuote(req: {
    sourceCurrency: string;
    targetCurrency: string;
    sourceAmount: number; // major units
    targetType?: "BALANCE" | "BANK_ACCOUNT";
    targetAccount?: string;
  }): Promise<
    ProviderResult<{
      quoteId: string;
      rate: number;
      feeMinor: number;
      totalMinor: number;
      expiresAt: string;
    }>
  >;
  createTransfer(req: {
    targetAccount: string;
    quoteUuid: string;
    details?: Record<string, unknown>;
    customerTransactionId: string;
  }): Promise<ProviderResult<{ transferId: string; status: string }>>;
  fundTransfer(req: {
    profileId: string;
    transferId: string;
    type?: "BALANCE";
  }): Promise<ProviderResult<{ transferId: string; status: string; estimatedDelivery?: string }>>;
  estimateTransferTime(req: {
    sourceCurrency: string;
    targetCurrency: string;
  }): Promise<ProviderResult<{ estimatedDelivery: string; speed: string }>>;
}

// Wise profiles — personal/business onboarding.
export interface WiseProfiles {
  readonly contract: "INTERNATIONAL_TRANSFER";
  createProfile(req: {
    type: "PERSONAL" | "BUSINESS";
    details: {
      firstName?: string;
      lastName?: string;
      dateOfBirth?: string;
      address?: { country?: string; city?: string; firstLine?: string; postCode?: string };
      businessName?: string;
      businessType?: string;
    };
  }): Promise<ProviderResult<{ profileId: string; type: string; status: string }>>;
  getProfiles(): Promise<
    ProviderResult<{ profiles: Array<{ id: string; type: string; status?: string }> }>
  >;
}

// ---------------------------------------------------------------------------
// 1. International transfer + extension methods
// ---------------------------------------------------------------------------

export const wiseIntl: IInternationalTransferProvider & WiseTransferExtensions = {
  contract: "INTERNATIONAL_TRANSFER",

  async getQuote(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const rate = req.sourceCurrency === "NGN" && req.targetCurrency === "USD" ? 1 / 1480 : 1;
      return ok(
        {
          rate,
          feeMinor: 500,
          totalMinor: req.amountMinor + 500,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
        "mock",
        80
      );
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
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        id?: string;
        rate?: number;
        fee?: number;
        total?: number;
        sourceAmount?: number;
        targetAmount?: number;
        rateType?: string;
        createdTime?: string;
        deliveryEstimate?: string;
      };
      const rate = Number(data?.rate ?? 0);
      const feeMinor = typeof data?.fee === "number" ? Math.round(data.fee * 100) : 0;
      const totalMinor =
        typeof data?.total === "number" ? Math.round(data.total * 100) : req.amountMinor + feeMinor;
      return ok(
        {
          rate,
          feeMinor,
          totalMinor,
          expiresAt: data?.deliveryEstimate ?? new Date(Date.now() + 60_000).toISOString(),
        },
        data?.id ?? "wise-quote",
        0
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
      return ok(
        {
          providerRef: `wise-intl-${req.reference}`,
          status: "PENDING",
          estimatedDelivery: new Date(Date.now() + 24 * 3600_000).toISOString(),
        },
        "mock",
        200
      );
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
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const quoteId = (quoteBody as { id?: string }).id;
      if (!quoteId) {
        return fail("UPSTREAM_ERROR", "Wise quote creation failed", {
          providerCode: CODE,
          raw: sanitize(quoteBody),
        });
      }

      // Step 2 — create a recipient account (lookup or create). For brevity
      // we assume the caller passes a targetAccount reference in
      // `beneficiary.routingNumber` (Wise recipientId). If absent we fall back
      // to the mock path so callers can still test the happy path.
      const targetAccount = req.beneficiary.routingNumber ?? req.beneficiary.accountNumber ?? "";
      if (!targetAccount) {
        return fail(
          "INVALID_REQUEST",
          "Wise transfer requires beneficiary.routingNumber (recipientId)",
          { providerCode: CODE }
        );
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
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        id?: number;
        status?: string;
        details?: { reference?: string; estimatedDelivery?: string };
      };
      const providerRef = String(data?.id ?? `wise-intl-${req.reference}`);
      return ok(
        {
          providerRef,
          status: (data?.status ?? "incoming_payment_waiting").toUpperCase(),
          estimatedDelivery: data?.details?.estimatedDelivery,
        },
        providerRef,
        0
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
      return ok(
        { status: "PENDING", timeline: [{ status: "initiated", at: new Date().toISOString() }] },
        "mock",
        20
      );
    }
    const apiToken = creds.secrets.apiToken;
    if (!apiToken) return fail("AUTH_FAILED", "Wise apiToken missing", { providerCode: CODE });
    const base = pickBase(creds);
    try {
      const { body } = await http(
        `${base}/v1/transfers/${encodeURIComponent(providerRef)}`,
        { method: "GET", headers: authHeaders(apiToken) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        status?: string;
        details?: {
          reference?: string;
          estimatedDelivery?: string;
          transferState?: string;
        };
      };
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
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { status?: string };
      return ok({ status: (data?.status ?? "cancelled").toUpperCase() }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wise cancel failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  // -------------------------------------------------------------------------
  // createQuote — explicit POST /v2/quotes with targetType + targetAccount.
  // Differs from getQuote() in that it accepts major-unit amounts directly
  // (no kobo conversion) and supports recipient-bound quotes.
  // -------------------------------------------------------------------------

  async createQuote(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const rate = req.sourceCurrency === "NGN" && req.targetCurrency === "USD" ? 1 / 1480 : 1;
      const feeMinor = 500;
      const totalMinor = Math.round(req.sourceAmount * 100) + feeMinor;
      return ok(
        {
          quoteId: `wise-quote-mock-${Date.now()}`,
          rate,
          feeMinor,
          totalMinor,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
        "mock",
        80
      );
    }
    const apiToken = creds.secrets.apiToken;
    if (!apiToken) return fail("AUTH_FAILED", "Wise apiToken missing", { providerCode: CODE });
    const base = pickBase(creds);
    try {
      const payload: Record<string, unknown> = {
        sourceCurrency: req.sourceCurrency,
        targetCurrency: req.targetCurrency,
        sourceAmount: req.sourceAmount,
        targetType: req.targetType ?? "BALANCE",
      };
      if (req.targetAccount) payload.targetAccount = Number(req.targetAccount);
      const { body } = await http(
        `${base}/v2/quotes`,
        { method: "POST", headers: authHeaders(apiToken), body: JSON.stringify(payload) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        id?: string;
        rate?: number;
        fee?: number;
        total?: number;
        deliveryEstimate?: string;
      };
      return ok(
        {
          quoteId: String(data?.id ?? `wise-quote-${Date.now()}`),
          rate: Number(data?.rate ?? 0),
          feeMinor: typeof data?.fee === "number" ? Math.round(data.fee * 100) : 0,
          totalMinor:
            typeof data?.total === "number"
              ? Math.round(data.total * 100)
              : Math.round(req.sourceAmount * 100),
          expiresAt: data?.deliveryEstimate ?? new Date(Date.now() + 60_000).toISOString(),
        },
        data?.id ?? "wise-quote",
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wise createQuote failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  // -------------------------------------------------------------------------
  // createTransfer — explicit POST /v1/transfers against a pre-existing quote.
  // -------------------------------------------------------------------------

  async createTransfer(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { transferId: `wise-transfer-mock-${Date.now()}`, status: "incoming_payment_waiting" },
        "mock",
        150
      );
    }
    const apiToken = creds.secrets.apiToken;
    if (!apiToken) return fail("AUTH_FAILED", "Wise apiToken missing", { providerCode: CODE });
    const base = pickBase(creds);
    try {
      const details = req.details ?? {
        reference: req.customerTransactionId,
        transferPurpose: "verification.transfers.purpose.other",
        sourceOfFunds: "verification.source.of.funds.other",
      };
      const { body } = await http(
        `${base}/v1/transfers`,
        {
          method: "POST",
          headers: authHeaders(apiToken),
          body: JSON.stringify({
            targetAccount: Number(req.targetAccount),
            quoteUuid: req.quoteUuid,
            details,
            customerTransactionId: req.customerTransactionId,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { id?: number; status?: string };
      return ok(
        {
          transferId: String(data?.id ?? `wise-transfer-${Date.now()}`),
          status: (data?.status ?? "incoming_payment_waiting").toUpperCase(),
        },
        String(data?.id ?? "wise-transfer"),
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wise createTransfer failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  // -------------------------------------------------------------------------
  // fundTransfer — POST /v3/profiles/:profileId/transfers/:transferId/payments
  // Funds an existing transfer from the Wise multi-currency balance.
  // -------------------------------------------------------------------------

  async fundTransfer(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        {
          transferId: req.transferId,
          status: "OUTGOING_PAYMENT_SENT",
          estimatedDelivery: new Date(Date.now() + 24 * 3600_000).toISOString(),
        },
        "mock",
        200
      );
    }
    const apiToken = creds.secrets.apiToken;
    if (!apiToken) return fail("AUTH_FAILED", "Wise apiToken missing", { providerCode: CODE });
    const base = pickBase(creds);
    try {
      const { body } = await http(
        `${base}/v3/profiles/${encodeURIComponent(req.profileId)}/transfers/${encodeURIComponent(req.transferId)}/payments`,
        {
          method: "POST",
          headers: authHeaders(apiToken),
          body: JSON.stringify({ type: req.type ?? "BALANCE" }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        id?: number;
        status?: string;
        estimatedDelivery?: string;
        details?: { estimatedDelivery?: string };
      };
      return ok(
        {
          transferId: String(data?.id ?? req.transferId),
          status: (data?.status ?? "OUTGOING_PAYMENT_SENT").toUpperCase(),
          estimatedDelivery: data?.estimatedDelivery ?? data?.details?.estimatedDelivery,
        },
        String(req.transferId),
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wise fundTransfer failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  // -------------------------------------------------------------------------
  // estimateTransferTime — GET /v1/delivery-estimates?sourceCurrency=&targetCurrency=
  // -------------------------------------------------------------------------

  async estimateTransferTime(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        {
          estimatedDelivery: new Date(Date.now() + 24 * 3600_000).toISOString(),
          speed: "INSTANT_OR_SAME_DAY",
        },
        "mock",
        60
      );
    }
    const apiToken = creds.secrets.apiToken;
    if (!apiToken) return fail("AUTH_FAILED", "Wise apiToken missing", { providerCode: CODE });
    const base = pickBase(creds);
    try {
      const qs = new URLSearchParams({
        sourceCurrency: req.sourceCurrency,
        targetCurrency: req.targetCurrency,
      }).toString();
      const { body } = await http(
        `${base}/v1/delivery-estimates?${qs}`,
        { method: "GET", headers: authHeaders(apiToken) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { estimatedDelivery?: string; speed?: string; date?: string };
      return ok(
        {
          estimatedDelivery:
            data.estimatedDelivery ??
            data.date ??
            new Date(Date.now() + 24 * 3600_000).toISOString(),
          speed: data.speed ?? "INSTANT_OR_SAME_DAY",
        },
        "wise-delivery-estimate",
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wise estimateTransferTime failed";
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
      const rates: Record<string, number> = {
        "NGN-USD": 1 / 1480,
        "USD-NGN": 1480,
        "NGN-KES": 11.4,
        "USD-KES": 168,
      };
      return ok(
        {
          rate: rates[`${req.base}-${req.quote}`] ?? 1,
          source: "mock",
          timestamp: new Date().toISOString(),
        },
        "mock",
        20
      );
    }
    const apiToken = creds.secrets.apiToken;
    if (!apiToken) return fail("AUTH_FAILED", "Wise apiToken missing", { providerCode: CODE });
    const base = pickBase(creds);
    try {
      // Wise exposes live rates via GET /v1/rates?source=&target=
      const { body } = await http(
        `${base}/v1/rates?source=${encodeURIComponent(req.base)}&target=${encodeURIComponent(req.quote)}`,
        { method: "GET", headers: authHeaders(apiToken) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { rate?: number; source?: string; target?: string; time?: string };
      if (typeof data?.rate !== "number") {
        return fail("UPSTREAM_ERROR", "Wise returned no rate", {
          providerCode: CODE,
          raw: sanitize(body),
        });
      }
      return ok(
        {
          rate: Number(data.rate),
          source: "wise",
          timestamp: data.time ?? new Date().toISOString(),
        },
        "wise-rate",
        0
      );
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
      return ok(
        {
          pairs: [
            { base: "NGN", quote: "USD" },
            { base: "USD", quote: "KES" },
            { base: "USD", quote: "GBP" },
          ],
        },
        "mock",
        10
      );
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

// ---------------------------------------------------------------------------
// 3. Recipients — POST/GET/PATCH/DELETE /v1/recipients
// ---------------------------------------------------------------------------

export const wiseRecipients: IRecipientProvider = {
  contract: "RECIPIENT",

  async createRecipient(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        {
          recipientId: `wise-recipient-mock-${Date.now()}`,
          currency: req.currency,
          type: req.type,
          active: true,
        },
        "mock",
        150
      );
    }
    const apiToken = creds.secrets.apiToken;
    if (!apiToken) return fail("AUTH_FAILED", "Wise apiToken missing", { providerCode: CODE });
    const base = pickBase(creds);
    try {
      const payload: Record<string, unknown> = {
        currency: req.currency,
        type: req.type,
        profile: Number(req.profileId),
        accountHolderName: req.accountHolderName,
        ownedByCustomer: false,
      };
      if (req.bankDetails) {
        for (const [k, v] of Object.entries(req.bankDetails)) {
          payload[k] = v as unknown;
        }
      }
      const { body } = await http(
        `${base}/v1/recipients`,
        { method: "POST", headers: authHeaders(apiToken), body: JSON.stringify(payload) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { id?: number; currency?: string; type?: string; active?: boolean };
      return ok(
        {
          recipientId: String(data?.id ?? `wise-recipient-${Date.now()}`),
          currency: data?.currency ?? req.currency,
          type: data?.type ?? req.type,
          active: data?.active ?? true,
        },
        String(data?.id ?? "wise-recipient"),
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wise createRecipient failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async listRecipients(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ recipients: [] }, "mock", 50);
    }
    const apiToken = creds.secrets.apiToken;
    if (!apiToken) return fail("AUTH_FAILED", "Wise apiToken missing", { providerCode: CODE });
    const base = pickBase(creds);
    try {
      const qs = new URLSearchParams({ profileId: req.profileId }).toString();
      const { body } = await http(
        `${base}/v1/recipients?${qs}`,
        { method: "GET", headers: authHeaders(apiToken) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        recipients?: Array<Record<string, unknown>>;
        data?: Array<Record<string, unknown>>;
      };
      const list = data.recipients ?? data.data ?? [];
      const recipients: RecipientSummary[] = list.map((r) => ({
        id: String(r.id ?? ""),
        name: String(r.accountHolderName ?? r.account_holder_name ?? r.name ?? ""),
        currency: String(r.currency ?? ""),
        type: String(r.type ?? ""),
        active: typeof r.active === "boolean" ? r.active : undefined,
      }));
      return ok({ recipients }, "wise-recipients", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wise listRecipients failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async getRecipient(id) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ id, name: "Mock Recipient", currency: "USD", type: "iban" }, "mock", 50);
    }
    const apiToken = creds.secrets.apiToken;
    if (!apiToken) return fail("AUTH_FAILED", "Wise apiToken missing", { providerCode: CODE });
    const base = pickBase(creds);
    try {
      const { body } = await http(
        `${base}/v1/recipients/${encodeURIComponent(id)}`,
        { method: "GET", headers: authHeaders(apiToken) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as Record<string, unknown>;
      const bankDetails: Record<string, unknown> = {};
      const knownMeta = new Set([
        "id",
        "currency",
        "type",
        "accountHolderName",
        "account_holder_name",
        "active",
        "profile",
        "ownedByCustomer",
        "name",
      ]);
      for (const [k, v] of Object.entries(data)) {
        if (!knownMeta.has(k)) bankDetails[k] = v;
      }
      return ok(
        {
          id: String(data.id ?? id),
          name: String(data.accountHolderName ?? data.account_holder_name ?? data.name ?? ""),
          currency: String(data.currency ?? ""),
          type: String(data.type ?? ""),
          bankDetails: Object.keys(bankDetails).length > 0 ? bankDetails : undefined,
        },
        id,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wise getRecipient failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async updateRecipient(id, req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ id, updated: true }, "mock", 80);
    }
    const apiToken = creds.secrets.apiToken;
    if (!apiToken) return fail("AUTH_FAILED", "Wise apiToken missing", { providerCode: CODE });
    const base = pickBase(creds);
    try {
      const payload: Record<string, unknown> = {};
      if (req.accountHolderName) payload.accountHolderName = req.accountHolderName;
      if (req.bankDetails) {
        for (const [k, v] of Object.entries(req.bankDetails)) {
          payload[k] = v as unknown;
        }
      }
      const { body } = await http(
        `${base}/v1/recipients/${encodeURIComponent(id)}`,
        { method: "PATCH", headers: authHeaders(apiToken), body: JSON.stringify(payload) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { id?: number };
      return ok({ id: String(data?.id ?? id), updated: true }, id, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wise updateRecipient failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async deleteRecipient(id) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ deleted: true }, "mock", 60);
    }
    const apiToken = creds.secrets.apiToken;
    if (!apiToken) return fail("AUTH_FAILED", "Wise apiToken missing", { providerCode: CODE });
    const base = pickBase(creds);
    try {
      await http(
        `${base}/v1/recipients/${encodeURIComponent(id)}`,
        { method: "DELETE", headers: authHeaders(apiToken) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      return ok({ deleted: true }, id, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wise deleteRecipient failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 4. Multi-currency balances — GET /v1/balances?profileId=, GET /v1/balances/:id
// ---------------------------------------------------------------------------

export const wiseBalances: IMultiCurrencyBalanceProvider = {
  contract: "MULTI_CURRENCY_BALANCE",

  async getBalances(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        {
          balances: [
            { id: "bal-ngn", currency: "NGN", amountMinor: 1_500_000_00, type: "STANDARD" },
            { id: "bal-usd", currency: "USD", amountMinor: 2_500_00, type: "STANDARD" },
            { id: "bal-gbp", currency: "GBP", amountMinor: 800_00, type: "STANDARD" },
          ],
        },
        "mock",
        80
      );
    }
    const apiToken = creds.secrets.apiToken;
    if (!apiToken) return fail("AUTH_FAILED", "Wise apiToken missing", { providerCode: CODE });
    const base = pickBase(creds);
    try {
      const qs = new URLSearchParams({ profileId: req.profileId, types: "STANDARD" }).toString();
      const { body } = await http(
        `${base}/v1/balances?${qs}`,
        { method: "GET", headers: authHeaders(apiToken) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { balances?: Array<Record<string, unknown>> };
      const list = data.balances ?? [];
      const balances: BalanceSummary[] = list.map((b) => ({
        id: String(b.id ?? ""),
        currency: String(b.currency ?? ""),
        amountMinor:
          typeof b.amount === "object" &&
          b.amount &&
          "value" in (b.amount as Record<string, unknown>)
            ? Math.round(Number((b.amount as { value?: unknown }).value) * 100)
            : typeof b.amountValue === "number"
              ? Math.round(b.amountValue * 100)
              : typeof b.amount === "number"
                ? Math.round(b.amount * 100)
                : 0,
        type: typeof b.type === "string" ? b.type : "STANDARD",
      }));
      return ok({ balances }, "wise-balances", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wise getBalances failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async getBalance(balanceId) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { id: balanceId, currency: "NGN", amountMinor: 1_500_000_00, type: "STANDARD" },
        "mock",
        50
      );
    }
    const apiToken = creds.secrets.apiToken;
    if (!apiToken) return fail("AUTH_FAILED", "Wise apiToken missing", { providerCode: CODE });
    const base = pickBase(creds);
    try {
      const { body } = await http(
        `${base}/v1/balances/${encodeURIComponent(balanceId)}`,
        { method: "GET", headers: authHeaders(apiToken) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as Record<string, unknown>;
      const amountRaw = data.amount;
      const amountMinor =
        typeof amountRaw === "object" &&
        amountRaw &&
        "value" in (amountRaw as Record<string, unknown>)
          ? Math.round(Number((amountRaw as { value?: unknown }).value) * 100)
          : typeof amountRaw === "number"
            ? Math.round(amountRaw * 100)
            : 0;
      const bankDetails: Record<string, unknown> | undefined =
        typeof data.bankDetails === "object" && data.bankDetails
          ? (data.bankDetails as Record<string, unknown>)
          : undefined;
      return ok(
        {
          id: String(data.id ?? balanceId),
          currency: String(data.currency ?? ""),
          amountMinor,
          type: typeof data.type === "string" ? data.type : "STANDARD",
          bankDetails,
        },
        balanceId,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wise getBalance failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 5. Profiles — POST /v1/profiles, GET /v1/profiles
// ---------------------------------------------------------------------------

export const wiseProfiles: WiseProfiles = {
  contract: "INTERNATIONAL_TRANSFER",

  async createProfile(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { profileId: `wise-profile-mock-${Date.now()}`, type: req.type, status: "ACTIVE" },
        "mock",
        200
      );
    }
    const apiToken = creds.secrets.apiToken;
    if (!apiToken) return fail("AUTH_FAILED", "Wise apiToken missing", { providerCode: CODE });
    const base = pickBase(creds);
    try {
      const details: Record<string, unknown> = {};
      if (req.details.firstName) details.firstName = req.details.firstName;
      if (req.details.lastName) details.lastName = req.details.lastName;
      if (req.details.dateOfBirth) details.dateOfBirth = req.details.dateOfBirth;
      if (req.details.address) details.address = req.details.address;
      if (req.details.businessName) details.name = req.details.businessName;
      if (req.details.businessType) details.businessType = req.details.businessType;
      const { body } = await http(
        `${base}/v1/profiles`,
        {
          method: "POST",
          headers: authHeaders(apiToken),
          body: JSON.stringify({ type: req.type, details }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { id?: number; type?: string; status?: string };
      return ok(
        {
          profileId: String(data?.id ?? `wise-profile-${Date.now()}`),
          type: data?.type ?? req.type,
          status: data?.status ?? "ACTIVE",
        },
        String(data?.id ?? "wise-profile"),
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wise createProfile failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async getProfiles() {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { profiles: [{ id: "mock-profile", type: "PERSONAL", status: "ACTIVE" }] },
        "mock",
        60
      );
    }
    const apiToken = creds.secrets.apiToken;
    if (!apiToken) return fail("AUTH_FAILED", "Wise apiToken missing", { providerCode: CODE });
    const base = pickBase(creds);
    try {
      const { body } = await http(
        `${base}/v1/profiles`,
        { method: "GET", headers: authHeaders(apiToken) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as
        Array<Record<string, unknown>> | { data?: Array<Record<string, unknown>> };
      const list = Array.isArray(data) ? data : (data.data ?? []);
      const profiles = list.map((p) => ({
        id: String(p.id ?? ""),
        type: String(p.type ?? "PERSONAL"),
        status: typeof p.status === "string" ? p.status : undefined,
      }));
      return ok({ profiles }, "wise-profiles", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wise getProfiles failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};
