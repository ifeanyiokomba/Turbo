// TurboCore — Remita adapter (RRR flow).
//
// Implements 1 contract:
//   - remitaBillPayment (IBillPaymentProvider)
//
// Base URL: https://remita.net/api/v1 (sandbox: https://remita-demo.net/api/v1).
// Auth: merchantId + apiKey + apiToken as request headers.
//
// RRR (Remita Retrieval Reference) flow:
//   1. Caller invokes payBill → POST /payments/rrr/generate returns an `rrr`.
//   2. Customer pays via Remita checkout / bank channel.
//   3. queryBillPayment → POST /payments/rrr/status to confirm payment.
//
// Secrets expected: { "merchantId": "...", "apiKey": "...", "apiToken": "..." }

import { ok, fail } from "../result";
import type { IBillPaymentProvider } from "../contracts";
import { requireCreds, loadCreds, http, defaultHttpError, sanitize, mockWarnOnce } from "./_shared";
import { BILLERS } from "@/lib/banks";

const CODE = "remita";
const LIVE_BASE = "https://remita.net/api/v1";
const SANDBOX_BASE = "https://remita-demo.net/api/v1";

function authHeaders(creds: { secrets: Record<string, string> }): Record<string, string> {
  return {
    MerchantId: creds.secrets.merchantId ?? "",
    "API-KEY": creds.secrets.apiKey ?? "",
    "API-TOKEN": creds.secrets.apiToken ?? "",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export const remitaBillPayment: IBillPaymentProvider = {
  contract: "BILL_PAYMENT",

  async listBillers(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const cats = Object.keys(BILLERS);
      const billers = req.category ? BILLERS[req.category] ?? [] : cats.flatMap((c) => BILLERS[c] ?? []);
      return ok(billers.map((b) => ({ ...b, category: req.category ?? "BILL", country: req.country })), "mock", 20);
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/billers/categories`,
        { method: "GET", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const cats = (body as { categories?: Array<{ code?: string; name?: string; billers?: Array<{ code?: string; name?: string; refLabel?: string; refType?: string }> }> }).categories ?? [];
      const out: { code: string; name: string; category: string; country: string; refLabel: string; refType: string }[] = [];
      for (const c of cats) {
        const catName = String(c.name ?? c.code ?? "BILL");
        for (const b of c.billers ?? []) {
          if (b.code && b.name) {
            out.push({
              code: String(b.code),
              name: String(b.name),
              category: catName,
              country: req.country,
              refLabel: b.refLabel ?? "Account Number",
              refType: b.refType ?? "account",
            });
          }
        }
      }
      if (!out.length) {
        const allCats = Object.keys(BILLERS);
        const billers = req.category ? BILLERS[req.category] ?? [] : allCats.flatMap((c) => BILLERS[c] ?? []);
        return ok(billers.map((b) => ({ ...b, category: req.category ?? "BILL", country: req.country })), "remita-fallback", 0);
      }
      return ok(out, "remita-billers", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Remita listBillers failed";
      void msg;
      const allCats = Object.keys(BILLERS);
      const billers = req.category ? BILLERS[req.category] ?? [] : allCats.flatMap((c) => BILLERS[c] ?? []);
      return ok(billers.map((b) => ({ ...b, category: req.category ?? "BILL", country: req.country })), "remita-fallback", 0);
    }
  },

  async validateCustomer(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ customerName: `CUSTOMER ${req.customerRef.slice(-4)}`, valid: true }, "mock", 40);
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/payments/validate/customer`,
        {
          method: "POST",
          headers: authHeaders(creds),
          body: JSON.stringify({ billerCode: req.billerCode, customerRef: req.customerRef }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { customerName?: string; valid?: boolean; name?: string; account_name?: string });
      const name = data.customerName ?? data.name ?? data.account_name ?? "";
      if (!name) {
        return fail("BENEFICIARY_INVALID", "Remita could not validate customer", { providerCode: CODE, raw: sanitize(body) });
      }
      return ok({ customerName: name, valid: true }, "remita-validate", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Remita validateCustomer failed";
      const code: "UPSTREAM_ERROR" | "BENEFICIARY_INVALID" = /404|not found|invalid/i.test(msg) ? "BENEFICIARY_INVALID" : "UPSTREAM_ERROR";
      return fail(code, msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async payBill(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      // Mock RRR is a 12-digit numeric string.
      const rrr = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join("");
      return ok({ providerRef: rrr, status: "PENDING" }, "mock", 150);
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/payments/rrr/generate`,
        {
          method: "POST",
          headers: authHeaders(creds),
          body: JSON.stringify({
            serviceTypeId: req.billerCode,
            amount: req.amountMinor / 100, // Remita expects major units
            orderId: req.reference,
            payerName: "Turbopay Customer",
            payerEmail: "customer@turbopay.ng",
            payerPhone: "08000000000",
            description: `Turbopay bill payment ${req.billerCode}`,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { rrr?: string; status?: string; statuscode?: string });
      if (!data.rrr) {
        return fail("UPSTREAM_ERROR", "Remita RRR generation returned no RRR", { providerCode: CODE, raw: sanitize(body) });
      }
      return ok({ providerRef: data.rrr, status: "PENDING" }, data.rrr, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Remita payBill failed";
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
        `${base}/payments/rrr/status`,
        {
          method: "POST",
          headers: authHeaders(creds),
          body: JSON.stringify({ rrr: providerRef }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { status?: string; statuscode?: string; message?: string });
      const code = String(data.statuscode ?? data.status ?? "").toLowerCase();
      let status = "PENDING";
      if (code === "00" || code === "success" || code === "paid") status = "SUCCESS";
      else if (code === "01" || code === "failed" || code === "cancelled") status = "FAILED";
      return ok({ status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Remita queryBillPayment failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};
