// TurboCore — Smartcash PSB (Airtel Nigeria) adapter.
//
// Implements 4 contracts:
//   - smartcashProvider (IMobileMoneyProvider) — wallet collections + disbursements
//     + deep methods (wallet transfer, account verify, transaction history).
//   - smartcashBankTransfer (IBankTransferProvider) — send money to any NG bank.
//   - smartcashAirtime (IAirtimeProvider) — airtime + data top-up from wallet.
//   - smartcashBillPayment (IBillPaymentProvider) — electricity, cable TV, etc.
//
// Smartcash is Airtel Nigeria's Payment Service Bank (PSB) — a mobile money
// wallet for the Nigerian market (NGN). It enables wallet-to-wallet transfers,
// collections (STK prompt to Smartcash wallet), and disbursements (B2C payout
// to a Smartcash wallet holder).
//
// NOTE: Smartcash's public developer API is typically accessed via an
// aggregator (OnePipe/PSSP) or direct partner integration. The endpoints
// below reflect the documented Smartcash Open API pattern; when credentials
// are absent the adapter runs in sandbox/mock mode (same as all adapters).
//
// Base URLs (configurable, defaults shown):
//   live:    https://api.smartcashpsb.ng
//   sandbox: https://sandbox.api.smartcashpsb.ng
//
// Auth: Bearer apiKey + header `X-Merchant-Id`.
//
// Collect (wallet debit / STK prompt): POST /v1/collections/charge
//   body: { reference, phone, amount, currency, narration }
//   → { transactionId, status: "PENDING"|"SUCCESS"|"FAILED" }
//
// Disburse (payout to Smartcash wallet): POST /v1/disbursements/transfer
//   body: { reference, phone, amount, currency, narration }
//   → { transactionId, status }
//
// getStatus: GET /v1/transactions/{transactionId}
//
// Deep methods:
//   transferWallet:   POST /v1/transfers/wallet        (wallet-to-wallet)
//   transferToBank:   POST /v1/transfers/bank           (via IBankTransferProvider)
//   buyAirtime:       POST /v1/airtime                   (via IAirtimeProvider)
//   payBill:          POST /v1/bills/pay                 (via IBillPaymentProvider)
//   verifyAccount:    GET  /v1/accounts/verify?phone=
//   getTransactionHistory: GET /v1/transactions/history
//
// Secrets expected:
//   { "apiKey": "...", "merchantId": "...",
//     "callbackUrl": "https://yourapp/api/webhooks/turbocore/smartcash" }

import { ok, fail } from "../result";
import type {
  IMobileMoneyProvider,
  IBankTransferProvider,
  IAirtimeProvider,
  IBillPaymentProvider,
} from "../contracts";
import { requireCreds, loadCreds, http, defaultHttpError, sanitize, mockWarnOnce } from "./_shared";

const CODE = "smartcash";
const LIVE_BASE = "https://api.smartcashpsb.ng";
const SANDBOX_BASE = "https://sandbox.api.smartcashpsb.ng";

function authHeaders(apiKey: string, merchantId: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "X-Merchant-Id": merchantId,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/** Mock list of NG banks — Smartcash doesn't expose a public listBanks endpoint. */
const NG_BANKS = [
  { code: "044", name: "Access Bank", short: "ACCESS", country: "NG" },
  { code: "058", name: "GTBank", short: "GTB", country: "NG" },
  { code: "057", name: "Zenith Bank", short: "ZENITH", country: "NG" },
  { code: "011", name: "First Bank of Nigeria", short: "FIRST", country: "NG" },
  { code: "033", name: "United Bank for Africa", short: "UBA", country: "NG" },
  { code: "232", name: "Sterling Bank", short: "STERLING", country: "NG" },
  { code: "070", name: "Fidelity Bank", short: "FIDELITY", country: "NG" },
  { code: "076", name: "Polaris Bank", short: "POLARIS", country: "NG" },
  { code: "082", name: "Keystone Bank", short: "KEYSTONE", country: "NG" },
  { code: "035", name: "Wema Bank", short: "WEMA", country: "NG" },
  { code: "032", name: "Union Bank", short: "UNION", country: "NG" },
  { code: "030", name: "Heritage Bank", short: "HERITAGE", country: "NG" },
  { code: "221", name: "Stanbic IBTC Bank", short: "STANBIC", country: "NG" },
  { code: "215", name: "Unity Bank", short: "UNITY", country: "NG" },
  { code: "071", name: "Optimus Bank", short: "OPTIMUS", country: "NG" },
];

/** Mock list of NG mobile networks for the airtime contract. */
const NG_NETWORKS = [
  { id: "airtel", name: "Airtel", country: "NG", color: "#E40000" },
  { id: "mtn", name: "MTN", country: "NG", color: "#FFCC00" },
  { id: "glo", name: "Glo Mobile", country: "NG", color: "#00B050" },
  { id: "9mobile", name: "9mobile", country: "NG", color: "#0066B3" },
];

type BankTransferStatus = "PENDING" | "SUCCESS" | "FAILED";

function normalizeStatus(raw: unknown): BankTransferStatus {
  const st = String(raw ?? "PENDING").toUpperCase();
  if (st === "SUCCESS" || st === "SUCCESSFUL" || st === "COMPLETED") return "SUCCESS";
  if (st === "FAILED" || st === "REJECTED" || st === "CANCELLED") return "FAILED";
  return "PENDING";
}

export const smartcashProvider: IMobileMoneyProvider = {
  contract: "MOBILE_MONEY",

  async getBalance(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ balanceMinor: 0, currency: "NGN" }, "mock", 50);
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/v1/wallets/balance?phone=${encodeURIComponent(req.phone)}`,
        { method: "GET", headers: authHeaders(creds.secrets.apiKey, creds.secrets.merchantId) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { data?: { balance?: string | number; currency?: string } };
      const bal = Number(data?.data?.balance ?? 0) * 100;
      return ok(
        { balanceMinor: Math.round(bal), currency: data?.data?.currency ?? "NGN" },
        `smartcash-bal-${Date.now()}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Smartcash getBalance failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async collect(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { providerRef: `smartcash-charge-${req.reference}`, status: "PENDING" },
        "mock",
        200
      );
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/v1/collections/charge`,
        {
          method: "POST",
          headers: authHeaders(creds.secrets.apiKey, creds.secrets.merchantId),
          body: JSON.stringify({
            reference: req.reference,
            phone: req.phone,
            amount: Number((req.amountMinor / 100).toFixed(2)),
            currency: req.currency,
            narration: (req.narration ?? "Turbopay collection").slice(0, 100),
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        data?: { transactionId?: string; status?: string };
        status?: string;
        message?: string;
      };
      const providerRef = data?.data?.transactionId ?? `smartcash-${req.reference}`;
      const status = normalizeStatus(data?.data?.status ?? data?.status ?? "PENDING");
      return ok({ providerRef, status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Smartcash collect failed";
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
        { providerRef: `smartcash-payout-${req.reference}`, status: "PENDING" },
        "mock",
        200
      );
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/v1/disbursements/transfer`,
        {
          method: "POST",
          headers: authHeaders(creds.secrets.apiKey, creds.secrets.merchantId),
          body: JSON.stringify({
            reference: req.reference,
            phone: req.phone,
            amount: Number((req.amountMinor / 100).toFixed(2)),
            currency: req.currency,
            narration: "Turbopay payout",
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { data?: { transactionId?: string; status?: string }; status?: string };
      const providerRef = data?.data?.transactionId ?? `smartcash-payout-${req.reference}`;
      const status = normalizeStatus(data?.data?.status ?? data?.status ?? "PENDING");
      return ok({ providerRef, status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Smartcash disbursement failed";
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
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/v1/transactions/${encodeURIComponent(providerRef)}`,
        { method: "GET", headers: authHeaders(creds.secrets.apiKey, creds.secrets.merchantId) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { data?: { status?: string } };
      const status = normalizeStatus(data?.data?.status ?? "PENDING");
      return ok({ status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Smartcash status query failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  // ─── Deep methods ──────────────────────────────────────────────────────────

  /**
   * POST /v1/transfers/wallet — Smartcash wallet-to-wallet transfer. Debits
   * the sender's wallet identified by `fromPhone` and credits the receiver's
   * wallet identified by `toPhone`. Returns a transaction id + status.
   */
  async transferWallet(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `smartcash-w2w-${req.reference}`, status: "PENDING" }, "mock", 200);
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/v1/transfers/wallet`,
        {
          method: "POST",
          headers: authHeaders(creds.secrets.apiKey, creds.secrets.merchantId),
          body: JSON.stringify({
            reference: req.reference,
            fromPhone: req.fromPhone,
            toPhone: req.toPhone,
            amount: Number((req.amountMinor / 100).toFixed(2)),
            currency: "NGN",
            narration: (req.narration ?? "Turbopay wallet transfer").slice(0, 100),
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { data?: { transactionId?: string; status?: string }; status?: string };
      const providerRef = data?.data?.transactionId ?? `smartcash-w2w-${req.reference}`;
      const status = normalizeStatus(data?.data?.status ?? data?.status ?? "PENDING");
      return ok({ providerRef, status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Smartcash wallet transfer failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  /**
   * GET /v1/accounts/verify?phone= — verify that a Smartcash account exists
   * before initiating a transfer. Returns valid=true with the account name
   * when the account exists, valid=false otherwise (including 404s).
   */
  async verifyAccount(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { valid: true, accountName: `Customer ${req.phone.slice(-4)}`, status: "ACTIVE" },
        "mock",
        50
      );
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/v1/accounts/verify?phone=${encodeURIComponent(req.phone)}`,
        { method: "GET", headers: authHeaders(creds.secrets.apiKey, creds.secrets.merchantId) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { data?: { accountName?: string; status?: string; valid?: boolean } };
      const valid = Boolean(data?.data?.valid ?? data?.data?.accountName ?? false);
      return ok(
        {
          valid,
          accountName: data?.data?.accountName,
          status: data?.data?.status ?? (valid ? "ACTIVE" : "NOT_FOUND"),
        },
        `smartcash-verify-${req.phone}`,
        0
      );
    } catch (e) {
      // 404 → account doesn't exist; surface as valid=false instead of erroring.
      if (e && typeof e === "object" && "error" in e) {
        const err = (e as { error?: { httpStatus?: number } }).error;
        if (err?.httpStatus === 404)
          return ok({ valid: false, status: "NOT_FOUND" }, `smartcash-verify-${req.phone}`, 0);
      }
      const msg = e instanceof Error ? e.message : "Smartcash account verification failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  /**
   * GET /v1/transactions/history — fetch transaction history for a Smartcash
   * wallet. Supports optional date range (ISO8601) and a limit (default 50).
   */
  async getTransactionHistory(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        {
          transactions: [
            {
              id: `smartcash-tx-${Date.now()}`,
              type: "CREDIT",
              amountMinor: 10000,
              currency: "NGN",
              status: "SUCCESS",
              timestamp: new Date().toISOString(),
            },
          ],
        },
        "mock",
        80
      );
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    const limit = req.limit ?? 50;
    const params = new URLSearchParams({ phone: req.phone, limit: String(limit) });
    if (req.fromDate) params.set("fromDate", req.fromDate);
    if (req.toDate) params.set("toDate", req.toDate);
    try {
      const { body } = await http(
        `${base}/v1/transactions/history?${params.toString()}`,
        { method: "GET", headers: authHeaders(creds.secrets.apiKey, creds.secrets.merchantId) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        data?: {
          transactions?: Array<{
            id?: string;
            transactionId?: string;
            type?: string;
            amount?: string | number;
            currency?: string;
            status?: string;
            createdAt?: string;
            timestamp?: string;
          }>;
        };
      };
      const txns = (data?.data?.transactions ?? []).map((t) => ({
        id: String(t.id ?? t.transactionId ?? ""),
        type: String(t.type ?? "UNKNOWN").toUpperCase(),
        amountMinor: Math.round(Number(t.amount ?? 0) * 100),
        currency: t.currency ?? "NGN",
        status: normalizeStatus(t.status ?? "PENDING"),
        timestamp: t.timestamp ?? t.createdAt ?? new Date().toISOString(),
      }));
      return ok({ transactions: txns }, `smartcash-history-${req.phone}`, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Smartcash transaction history query failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ─── Smartcash Bank Transfer (IBankTransferProvider) ────────────────────────
//
// POST /v1/transfers/bank — send money from a Smartcash wallet to any Nigerian
// bank account. The `beneficiary` field carries the destination account number
// + bank code + name. `initiateTransfer` returns a providerRef + status.
//
// `listBanks` returns the local NG bank directory (Smartcash does not expose
// a public listBanks endpoint). `resolveAccountName` calls Smartcash's account
// verification endpoint to surface the destination account holder name.

export const smartcashBankTransfer: IBankTransferProvider = {
  contract: "BANK_TRANSFER",

  async listBanks(country) {
    if (country !== "NG") {
      return ok([], "smartcash-ng-only", 0);
    }
    return ok(NG_BANKS, "local-ng-banks", 5);
  },

  async resolveAccountName(req) {
    if (req.country !== "NG") {
      return fail("NOT_SUPPORTED", "Smartcash bank transfer supports NG only", {
        providerCode: CODE,
      });
    }
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { accountName: `ACCOUNT ${req.accountNumber.slice(-4)}`, bankName: "Smartcash Bank" },
        "mock",
        50
      );
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/v1/accounts/resolve?accountNumber=${encodeURIComponent(req.accountNumber)}&bankCode=${encodeURIComponent(req.bankCode)}`,
        { method: "GET", headers: authHeaders(creds.secrets.apiKey, creds.secrets.merchantId) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { data?: { accountName?: string; bankName?: string } };
      return ok(
        {
          accountName: data?.data?.accountName ?? `ACCOUNT ${req.accountNumber.slice(-4)}`,
          bankName: data?.data?.bankName ?? "Smartcash Bank",
        },
        `smartcash-resolve-${req.accountNumber}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Smartcash resolveAccountName failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async initiateTransfer(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `smartcash-bank-${req.reference}`, status: "PENDING" }, "mock", 200);
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/v1/transfers/bank`,
        {
          method: "POST",
          headers: authHeaders(creds.secrets.apiKey, creds.secrets.merchantId),
          body: JSON.stringify({
            reference: req.reference,
            fromPhone: (req as { fromPhone?: string }).fromPhone ?? "",
            toAccountNumber: req.beneficiary.accountNumber,
            toBankCode: req.beneficiary.bankCode,
            toAccountName: req.beneficiary.name,
            amount: Number((req.amountMinor / 100).toFixed(2)),
            currency: req.currency,
            narration: (req.narration ?? "Turbopay bank transfer").slice(0, 100),
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { data?: { transactionId?: string; status?: string }; status?: string };
      const providerRef = data?.data?.transactionId ?? `smartcash-bank-${req.reference}`;
      const status = normalizeStatus(data?.data?.status ?? data?.status ?? "PENDING");
      return ok({ providerRef, status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Smartcash bank transfer failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async getTransferStatus(providerRef) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "SUCCESS" }, "mock", 30);
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/v1/transactions/${encodeURIComponent(providerRef)}`,
        { method: "GET", headers: authHeaders(creds.secrets.apiKey, creds.secrets.merchantId) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { data?: { status?: string; settlementTime?: string } };
      const status = normalizeStatus(data?.data?.status ?? "PENDING");
      return ok({ status, settlementTime: data?.data?.settlementTime }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Smartcash transfer status query failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async reverseTransfer(req) {
    // Smartcash bank transfers can be reversed via the wallet reversal endpoint.
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { reversalRef: `smartcash-reversal-${req.providerRef}`, status: "PENDING" },
        "mock",
        100
      );
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/v1/transfers/reverse`,
        {
          method: "POST",
          headers: authHeaders(creds.secrets.apiKey, creds.secrets.merchantId),
          body: JSON.stringify({
            reference: `rev-${req.providerRef}`.slice(0, 32),
            transactionId: req.providerRef,
            reason: (req.reason ?? "Turbopay reversal").slice(0, 100),
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { data?: { transactionId?: string; status?: string } };
      const reversalRef = data?.data?.transactionId ?? `smartcash-reversal-${req.providerRef}`;
      const status = normalizeStatus(data?.data?.status ?? "PENDING");
      return ok({ reversalRef, status }, reversalRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Smartcash reverseTransfer failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ─── Smartcash Airtime (IAirtimeProvider) ───────────────────────────────────
//
// POST /v1/airtime — buy airtime for any NG mobile number using a Smartcash
// wallet. Data is supported via the same endpoint with `type: "DATA"` and a
// `planCode`. Mock list of networks covers the 4 NG MNOs.

export const smartcashAirtime: IAirtimeProvider = {
  contract: "AIRTIME",

  async listNetworks(country) {
    if (country !== "NG") {
      return ok([], "smartcash-ng-only", 0);
    }
    return ok(NG_NETWORKS, "local-ng-networks", 5);
  },

  async listDataPlans(req) {
    if (req.country !== "NG") {
      return ok([], "smartcash-ng-only", 0);
    }
    // Smartcash does not expose a public data plans endpoint; return a small
    // static catalogue so the UI is functional in sandbox.
    const plans = [
      {
        id: `${req.network}-100mb`,
        name: "100MB / 1 Day",
        amountMinor: 10000,
        validity: "1 day",
        network: req.network,
      },
      {
        id: `${req.network}-350mb`,
        name: "350MB / 7 Days",
        amountMinor: 20000,
        validity: "7 days",
        network: req.network,
      },
      {
        id: `${req.network}-1gb`,
        name: "1GB / 30 Days",
        amountMinor: 35000,
        validity: "30 days",
        network: req.network,
      },
      {
        id: `${req.network}-5gb`,
        name: "5GB / 30 Days",
        amountMinor: 150000,
        validity: "30 days",
        network: req.network,
      },
      {
        id: `${req.network}-10gb`,
        name: "10GB / 30 Days",
        amountMinor: 300000,
        validity: "30 days",
        network: req.network,
      },
    ];
    return ok(plans, "local-ng-plans", 5);
  },

  async purchase(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { providerRef: `smartcash-airtime-${req.reference}`, status: "SUCCESS" },
        "mock",
        100
      );
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/v1/airtime`,
        {
          method: "POST",
          headers: authHeaders(creds.secrets.apiKey, creds.secrets.merchantId),
          body: JSON.stringify({
            reference: req.reference,
            phone: req.phone,
            network: req.network,
            amount:
              req.amountMinor != null ? Number((req.amountMinor / 100).toFixed(2)) : undefined,
            planCode: req.planCode,
            currency: req.currency,
            type: req.type,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { data?: { transactionId?: string; status?: string }; status?: string };
      const providerRef = data?.data?.transactionId ?? `smartcash-airtime-${req.reference}`;
      const status = normalizeStatus(data?.data?.status ?? data?.status ?? "PENDING");
      return ok({ providerRef, status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Smartcash airtime purchase failed";
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
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/v1/transactions/${encodeURIComponent(providerRef)}`,
        { method: "GET", headers: authHeaders(creds.secrets.apiKey, creds.secrets.merchantId) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { data?: { status?: string } };
      const status = normalizeStatus(data?.data?.status ?? "PENDING");
      return ok({ status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Smartcash airtime status query failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ─── Smartcash Bill Payment (IBillPaymentProvider) ──────────────────────────
//
// POST /v1/bills/pay — pay a bill (electricity, cable TV, water) using a
// Smartcash wallet. The billerCode identifies the biller, customerRef identifies
// the customer (e.g. meter number for electricity, smartcard number for DStv).
// For electricity, the response includes a `token` field that the customer
// uses to credit their meter.

export const smartcashBillPayment: IBillPaymentProvider = {
  contract: "BILL_PAYMENT",

  async listBillers(req) {
    // Smartcash does not expose a public listBillers endpoint; fall back to
    // the local BILLERS directory so the UI is functional.
    const { BILLERS } = await import("@/lib/banks");
    const billers = req.category ? (BILLERS[req.category] ?? []) : Object.values(BILLERS).flat();
    return ok(
      billers.map((b) => ({ ...b, country: req.country, category: req.category ?? "OTHERS" })),
      "local-fallback",
      5
    );
  },

  async validateCustomer(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ customerName: `CUSTOMER ${req.customerRef.slice(-4)}`, valid: true }, "mock", 50);
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/v1/bills/validate?billerCode=${encodeURIComponent(req.billerCode)}&customerRef=${encodeURIComponent(req.customerRef)}`,
        { method: "GET", headers: authHeaders(creds.secrets.apiKey, creds.secrets.merchantId) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { data?: { customerName?: string; valid?: boolean } };
      return ok(
        {
          customerName: data?.data?.customerName ?? `CUSTOMER ${req.customerRef.slice(-4)}`,
          valid: data?.data?.valid ?? true,
        },
        `smartcash-validate-${req.customerRef}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Smartcash validateCustomer failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async payBill(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      // Electricity billers typically return a token; surface one in mock mode.
      const token =
        req.billerCode.startsWith("E") ||
        req.billerCode.startsWith("IKEDC") ||
        req.billerCode.startsWith("EKEDC")
          ? Array.from({ length: 20 }, () => Math.floor(Math.random() * 10)).join("")
          : undefined;
      return ok(
        { providerRef: `smartcash-bill-${req.reference}`, status: "SUCCESS", token },
        "mock",
        150
      );
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/v1/bills/pay`,
        {
          method: "POST",
          headers: authHeaders(creds.secrets.apiKey, creds.secrets.merchantId),
          body: JSON.stringify({
            reference: req.reference,
            billerCode: req.billerCode,
            customerRef: req.customerRef,
            amount: Number((req.amountMinor / 100).toFixed(2)),
            currency: req.currency,
            productCode: req.productCode ?? "",
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        data?: {
          transactionId?: string;
          status?: string;
          token?: string;
          units?: string;
          receipt?: string;
        };
      };
      const providerRef = data?.data?.transactionId ?? `smartcash-bill-${req.reference}`;
      const status = normalizeStatus(data?.data?.status ?? "PENDING");
      return ok(
        {
          providerRef,
          status,
          token: data?.data?.token,
          units: data?.data?.units,
          receipt: data?.data?.receipt,
        },
        providerRef,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Smartcash payBill failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async queryBillPayment(providerRef) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "SUCCESS" }, "mock", 15);
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/v1/transactions/${encodeURIComponent(providerRef)}`,
        { method: "GET", headers: authHeaders(creds.secrets.apiKey, creds.secrets.merchantId) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { data?: { status?: string; token?: string } };
      const status = normalizeStatus(data?.data?.status ?? "PENDING");
      return ok({ status, token: data?.data?.token }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Smartcash queryBillPayment failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};
