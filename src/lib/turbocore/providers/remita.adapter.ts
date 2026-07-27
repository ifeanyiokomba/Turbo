// TurboCore — Remita adapter (RRR flow).
//
// Implements 4 contracts:
//   - remitaBillPayment          (IBillPaymentProvider)    — basic bill payment via RRR
//   - remitaRRR                   (extended IBillPaymentProvider) — direct RRR generate/status/details
//   - remitaMandate               (IDirectDebitProvider)     — mandate setup + status + stop
//   - remitaPaymentNotification   (standalone)               — payment notification by channel
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
import type { IBillPaymentProvider, IDirectDebitProvider, ProviderResult } from "../contracts";
import { requireCreds, loadCreds, http, defaultHttpError, sanitize, mockWarnOnce } from "./_shared";
import { BILLERS } from "@/lib/banks";
import { generateReference } from "@/lib/money";

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

// ---------------------------------------------------------------------------
// 2. RRR direct (extended IBillPaymentProvider)
//    POST /payments/v1/rrr/generate
//    GET  /payments/v1/rrr/:rrr/status
//    GET  /payments/v1/rrr/:rrr/details
// ---------------------------------------------------------------------------

export interface RemitaRRRProvider extends IBillPaymentProvider {
  generateRRR(req: {
    serviceTypeId: string;
    amountMinor: number;
    orderId?: string;
    payerName: string;
    payerEmail?: string;
    payerPhone?: string;
    description?: string;
    currency?: string;
  }): Promise<ProviderResult<{ rrr: string; status: string; amountMinor: number }>>;
  getRRRStatus(rrr: string): Promise<ProviderResult<{ status: string; rrr: string }>>;
  getRRRDetails(rrr: string): Promise<ProviderResult<{ rrr: string; amountMinor: number; payerName: string; payerEmail: string; status: string; description?: string }>>;
}

export const remitaRRR: RemitaRRRProvider = {
  ...remitaBillPayment,
  contract: "BILL_PAYMENT",

  async generateRRR(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const rrr = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join("");
      return ok({ rrr, status: "PENDING", amountMinor: req.amountMinor }, "mock", 150);
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/payments/v1/rrr/generate`,
        {
          method: "POST",
          headers: authHeaders(creds),
          body: JSON.stringify({
            serviceTypeId: req.serviceTypeId,
            amount: req.amountMinor / 100, // Remita expects major units
            orderId: req.orderId ?? generateReference("RMT"),
            payerName: req.payerName,
            payerEmail: req.payerEmail ?? "customer@turbopay.ng",
            payerPhone: req.payerPhone ?? "08000000000",
            description: req.description ?? "TurboPay RRR generation",
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { rrr?: string; status?: string; statuscode?: string });
      if (!data.rrr) {
        return fail("UPSTREAM_ERROR", "Remita generateRRR returned no RRR", { providerCode: CODE, raw: sanitize(body) });
      }
      const st = String(data.status ?? data.statuscode ?? "PENDING").toUpperCase();
      return ok({ rrr: data.rrr, status: st, amountMinor: req.amountMinor }, data.rrr, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Remita generateRRR failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async getRRRStatus(rrr) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "PENDING", rrr }, "mock", 30);
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/payments/v1/rrr/${encodeURIComponent(rrr)}/status`,
        { method: "GET", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { status?: string; statuscode?: string; message?: string });
      const code = String(data.statuscode ?? data.status ?? "").toLowerCase();
      let status = "PENDING";
      if (code === "00" || code === "success" || code === "paid") status = "SUCCESS";
      else if (code === "01" || code === "failed" || code === "cancelled") status = "FAILED";
      return ok({ status, rrr }, rrr, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Remita getRRRStatus failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async getRRRDetails(rrr) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        {
          rrr,
          amountMinor: 0,
          payerName: "Mock Payer",
          payerEmail: "customer@turbopay.ng",
          status: "PENDING",
          description: "Mock RRR",
        },
        "mock",
        30,
      );
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/payments/v1/rrr/${encodeURIComponent(rrr)}/details`,
        { method: "GET", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as {
        rrr?: string;
        amount?: number;
        amountPayable?: number;
        payerName?: string;
        payerEmail?: string;
        status?: string;
        statuscode?: string;
        description?: string;
      });
      const code = String(data.statuscode ?? data.status ?? "").toLowerCase();
      let status = "PENDING";
      if (code === "00" || code === "success" || code === "paid") status = "SUCCESS";
      else if (code === "01" || code === "failed" || code === "cancelled") status = "FAILED";
      const amount = data.amount ?? data.amountPayable ?? 0;
      return ok(
        {
          rrr: data.rrr ?? rrr,
          amountMinor: Math.round(amount * 100),
          payerName: data.payerName ?? "",
          payerEmail: data.payerEmail ?? "",
          status,
          description: data.description,
        },
        rrr,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Remita getRRRDetails failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 3. Direct debit mandate
//    POST /mandate/setup
//    GET  /mandate/:id/status
//    POST /mandate/:id/stop
// ---------------------------------------------------------------------------

export const remitaMandate: IDirectDebitProvider = {
  contract: "DIRECT_DEBIT",

  async createMandate(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const mandateId = `RMTMDT-${generateReference("M")}`;
      return ok({ mandateId, status: "PENDING", authUrl: `${SANDBOX_BASE}/mock/mandate/auth?id=${mandateId}` }, "mock", 150);
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/mandate/setup`,
        {
          method: "POST",
          headers: authHeaders(creds),
          body: JSON.stringify({
            mandateType: req.mandateType ?? "DIRECT_DEBIT",
            payerName: req.payerName,
            payerEmail: req.payerEmail ?? `${req.payerName.replace(/\s+/g, ".").toLowerCase()}@turbopay.ng`,
            payerPhone: req.payerPhone,
            amount: req.amountMinor / 100, // major units
            currency: req.currency ?? "NGN",
            startDate: req.startDate,
            endDate: req.endDate,
            frequency: req.frequency ?? "MONTHLY",
            bankCode: req.bankCode,
            accountNumber: req.accountNumber,
            narration: req.narration ?? "TurboPay Remita mandate",
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { mandateId?: string; mandateReference?: string; reference?: string; status?: string; statuscode?: string; authUrl?: string; authorizationUrl?: string });
      const mandateId = String(data.mandateId ?? data.mandateReference ?? data.reference ?? `RMTMDT-${Date.now()}`);
      const st = String(data.status ?? data.statuscode ?? "PENDING").toUpperCase();
      return ok({ mandateId, status: st, authUrl: data.authUrl ?? data.authorizationUrl }, mandateId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Remita createMandate failed";
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
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/mandate/${encodeURIComponent(mandateId)}/status`,
        { method: "GET", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { mandateId?: string; status?: string; statuscode?: string; mandateStatus?: string });
      const st = String(data.mandateStatus ?? data.status ?? data.statuscode ?? "ACTIVE").toUpperCase();
      return ok({ status: st, mandateId: String(data.mandateId ?? mandateId) }, mandateId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Remita getMandateStatus failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async debitMandate(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const providerRef = `RMTDBT-${generateReference("D")}`;
      return ok({ providerRef, status: "PENDING" }, "mock", 100);
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/mandate/${encodeURIComponent(req.mandateId)}/debit`,
        {
          method: "POST",
          headers: authHeaders(creds),
          body: JSON.stringify({
            mandateId: req.mandateId,
            amount: req.amountMinor / 100, // major units
            narration: req.narration ?? "TurboPay mandate debit",
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { debitReference?: string; transactionReference?: string; reference?: string; status?: string; statuscode?: string });
      const providerRef = String(data.debitReference ?? data.transactionReference ?? data.reference ?? `RMTDBT-${Date.now()}`);
      const st = String(data.status ?? data.statuscode ?? "PENDING").toUpperCase();
      return ok({ providerRef, status: st }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Remita debitMandate failed";
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
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/mandate/${encodeURIComponent(mandateId)}/stop`,
        { method: "POST", headers: authHeaders(creds) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { mandateId?: string; status?: string; statuscode?: string; mandateStatus?: string });
      const st = String(data.mandateStatus ?? data.status ?? data.statuscode ?? "STOPPED").toUpperCase();
      return ok({ status: st, mandateId: String(data.mandateId ?? mandateId) }, mandateId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Remita stopMandate failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 4. Payment notification
//    POST /payments/v1/payment-notification
//    (standalone export — Remita-specific)
// ---------------------------------------------------------------------------

export const remitaPaymentNotification = {
  async sendPaymentNotification(req: { rrr: string; channel?: string }): Promise<ProviderResult<{ sent: boolean; channel: string; rrr: string }>> {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ sent: true, channel: req.channel ?? "EMAIL", rrr: req.rrr }, "mock", 80);
    }
    const base = creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
    try {
      const { body } = await http(
        `${base}/payments/v1/payment-notification`,
        {
          method: "POST",
          headers: authHeaders(creds),
          body: JSON.stringify({
            rrr: req.rrr,
            channel: req.channel ?? "EMAIL",
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { status?: string; statuscode?: string; message?: string });
      const st = String(data.status ?? data.statuscode ?? "SUCCESS").toUpperCase();
      const sent = st === "SUCCESS" || st === "00";
      return ok({ sent, channel: req.channel ?? "EMAIL", rrr: req.rrr }, req.rrr, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Remita sendPaymentNotification failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};
