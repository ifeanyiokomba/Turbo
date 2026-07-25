// TurboCore — Smartcash PSB (Airtel Nigeria) adapter.
//
// Implements 1 contract:
//   - smartcashProvider (IMobileMoneyProvider)
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
// Secrets expected:
//   { "apiKey": "...", "merchantId": "...",
//     "callbackUrl": "https://yourapp/api/webhooks/turbocore/smartcash" }

import { ok, fail } from "../result";
import type { IMobileMoneyProvider } from "../contracts";
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
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = body as { data?: { balance?: string | number; currency?: string } };
      const bal = Number(data?.data?.balance ?? 0) * 100;
      return ok({ balanceMinor: Math.round(bal), currency: data?.data?.currency ?? "NGN" }, `smartcash-bal-${Date.now()}`, 0);
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
      return ok({ providerRef: `smartcash-charge-${req.reference}`, status: "PENDING" }, "mock", 200);
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
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = body as { data?: { transactionId?: string; status?: string }; status?: string; message?: string };
      const providerRef = data?.data?.transactionId ?? `smartcash-${req.reference}`;
      const st = String(data?.data?.status ?? data?.status ?? "PENDING").toUpperCase();
      const status = st === "SUCCESS" || st === "SUCCESSFUL" ? "SUCCESS" : st === "FAILED" ? "FAILED" : "PENDING";
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
      return ok({ providerRef: `smartcash-payout-${req.reference}`, status: "PENDING" }, "mock", 200);
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
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = body as { data?: { transactionId?: string; status?: string }; status?: string };
      const providerRef = data?.data?.transactionId ?? `smartcash-payout-${req.reference}`;
      const st = String(data?.data?.status ?? data?.status ?? "PENDING").toUpperCase();
      const status = st === "SUCCESS" || st === "SUCCESSFUL" ? "SUCCESS" : st === "FAILED" ? "FAILED" : "PENDING";
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
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = body as { data?: { status?: string } };
      const st = String(data?.data?.status ?? "PENDING").toUpperCase();
      const status = st === "SUCCESS" || st === "SUCCESSFUL" ? "SUCCESS" : st === "FAILED" ? "FAILED" : "PENDING";
      return ok({ status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Smartcash status query failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};
