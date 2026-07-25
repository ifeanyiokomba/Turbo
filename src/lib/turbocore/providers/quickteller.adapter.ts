// TurboCore — Interswitch Quickteller adapter.
//
// Implements 2 contracts:
//   - quicktellerBillPayment (IBillPaymentProvider)
//   - quicktellerAirtime     (IAirtimeProvider)
//
// Base URL: https://sandbox.interswitchng.com/api/v2/quickteller (live:
// https://saturn.interswitchng.com/api/v2/quickteller — same path).
// Auth: clientId + secret + request-reference + HMAC-SHA-512 signature
// passed as `Signature` header (hex). The signature base string is
// `HTTP_METHOD&url_path&timestamp&nonce&clientId&secret`.
//
// Secrets expected: { "clientId": "...", "secret": "...", "terminalId": "..." }

import { ok, fail } from "../result";
import type { IBillPaymentProvider, IAirtimeProvider } from "../contracts";
import { requireCreds, loadCreds, http, defaultHttpError, sanitize, mockWarnOnce } from "./_shared";
import { BILLERS, DATA_PLANS } from "@/lib/banks";
import { NETWORKS } from "@/lib/constants";

const CODE = "quickteller";
const SANDBOX_BASE = "https://sandbox.interswitchng.com/api/v2/quickteller";
const LIVE_BASE = "https://saturn.interswitchng.com/api/v2/quickteller";

async function hmacSha512(key: string, message: string): Promise<string> {
  // Use the Web Crypto API so this works in both Node 18+ (globalThis.crypto) and
  // edge runtimes.
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function authHeaders(
  creds: { secrets: Record<string, string> },
  method: string,
  urlPath: string,
): Promise<Record<string, string>> {
  const clientId = creds.secrets.clientId ?? "";
  const secret = creds.secrets.secret ?? "";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = `${timestamp}-${Math.random().toString(36).slice(2, 10)}`;
  const base = `${method.toUpperCase()}&${urlPath}&${timestamp}&${nonce}&${clientId}&${secret}`;
  return hmacSha512(secret, base).then((signature) => ({
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `InterswitchAuth ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
    "Client-Id": clientId,
    Timestamp: timestamp,
    Nonce: nonce,
    Signature: signature,
    Terminal: creds.secrets.terminalId ?? "",
  }));
}

function pickBase(creds: { sandbox: boolean }): string {
  return creds.sandbox ? SANDBOX_BASE : LIVE_BASE;
}

export const quicktellerBillPayment: IBillPaymentProvider = {
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
    const base = pickBase(creds);
    try {
      const headers = await authHeaders(creds, "GET", "/billers");
      const { body } = await http(`${base}/billers`, { method: "GET", headers }, (s, b) =>
        defaultHttpError(CODE, s, b),
      );
      const list = (body as { billers?: Array<{ billerId?: string; billerName?: string; category?: string; refLabel?: string; refType?: string }> }).billers ?? [];
      const out = list
        .filter((b) => b.billerId && b.billerName)
        .map((b) => ({
          code: String(b.billerId),
          name: String(b.billerName),
          category: String(b.category ?? "BILL"),
          country: req.country,
          refLabel: b.refLabel ?? "Customer ID",
          refType: b.refType ?? "account",
        }));
      if (!out.length) {
        const cats = Object.keys(BILLERS);
        const billers = req.category ? BILLERS[req.category] ?? [] : cats.flatMap((c) => BILLERS[c] ?? []);
        return ok(billers.map((b) => ({ ...b, category: req.category ?? "BILL", country: req.country })), "qt-fallback", 0);
      }
      return ok(out, "qt-billers", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Quickteller listBillers failed";
      void msg;
      const cats = Object.keys(BILLERS);
      const billers = req.category ? BILLERS[req.category] ?? [] : cats.flatMap((c) => BILLERS[c] ?? []);
      return ok(billers.map((b) => ({ ...b, category: req.category ?? "BILL", country: req.country })), "qt-fallback", 0);
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
    const base = pickBase(creds);
    try {
      const headers = await authHeaders(creds, "GET", "/customers/validate");
      const { body } = await http(
        `${base}/customers/validate?billerId=${encodeURIComponent(req.billerCode)}&customerId=${encodeURIComponent(req.customerRef)}`,
        { method: "GET", headers },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { customerName?: string; valid?: boolean; account_name?: string });
      const name = data.customerName ?? data.account_name ?? "";
      if (!name) {
        return fail("BENEFICIARY_INVALID", "Quickteller could not validate customer", { providerCode: CODE, raw: sanitize(body) });
      }
      return ok({ customerName: name, valid: true }, "qt-validate", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Quickteller validateCustomer failed";
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
      const isElectricity = /elec/i.test(req.billerCode) || /elec/i.test(req.productCode ?? "");
      const token = isElectricity
        ? Array.from({ length: 20 }, () => Math.floor(Math.random() * 10)).join("")
        : undefined;
      return ok({ providerRef: `qt-bill-${req.reference}`, status: "SUCCESS", token }, "mock", 150);
    }
    const base = pickBase(creds);
    try {
      const headers = await authHeaders(creds, "POST", "/payments/sendbill");
      const { body } = await http(
        `${base}/payments/sendbill`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            paymentItemId: req.billerCode,
            customerId: req.customerRef,
            amount: req.amountMinor, // Quickteller expects amount in minor (kobo/cents)
            requestReference: req.reference,
            terminalId: creds.secrets.terminalId,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { transactionRef?: string; transactionReference?: string; status?: string; token?: string; receiptNo?: string });
      return ok(
        {
          providerRef: data.transactionRef ?? data.transactionReference ?? `qt-bill-${req.reference}`,
          status: (data.status ?? "SUCCESS").toUpperCase(),
          token: data.token,
          receipt: data.receiptNo,
        },
        data.transactionRef ?? req.reference,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Quickteller payBill failed";
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
    const base = pickBase(creds);
    try {
      const headers = await authHeaders(creds, "GET", "/payments/query");
      const { body } = await http(
        `${base}/payments/query?transactionRef=${encodeURIComponent(providerRef)}`,
        { method: "GET", headers },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { status?: string; token?: string });
      return ok({ status: (data.status ?? "PENDING").toUpperCase(), token: data.token }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Quickteller queryBillPayment failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

export const quicktellerAirtime: IAirtimeProvider = {
  contract: "AIRTIME",

  async listNetworks(country) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(NETWORKS.map((n) => ({ id: n.id, name: n.name, country, color: n.color })), "mock", 10);
    }
    // Quickteller treats airtime as billers under the "Airtime" category; we
    // return the local NETWORKS directory for the picker UI either way.
    return ok(NETWORKS.map((n) => ({ id: n.id, name: n.name, country, color: n.color })), "qt-networks", 0);
  },

  async listDataPlans(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok((DATA_PLANS[req.network] ?? []).map((p) => ({ id: p.id, name: p.name, amountMinor: p.amountKobo, validity: p.validity, network: req.network })), "mock", 12);
    }
    // Same fallback policy — Quickteller exposes data plans per biller, but
    // enumerating them dynamically adds latency without much benefit for the
    // common case. Use the local directory.
    return ok((DATA_PLANS[req.network] ?? []).map((p) => ({ id: p.id, name: p.name, amountMinor: p.amountKobo, validity: p.validity, network: req.network })), "qt-plans", 0);
  },

  async purchase(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `qt-${req.type.toLowerCase()}-${req.reference}`, status: "SUCCESS" }, "mock", 120);
    }
    const base = pickBase(creds);
    try {
      const headers = await authHeaders(creds, "POST", "/payments/sendbill");
      const paymentItemId =
        req.type === "DATA" ? `${req.network}-DATA-${req.planCode ?? ""}` : `${req.network}-AIRTIME`;
      const { body } = await http(
        `${base}/payments/sendbill`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            paymentItemId,
            customerId: req.phone,
            amount: req.amountMinor,
            requestReference: req.reference,
            terminalId: creds.secrets.terminalId,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { transactionRef?: string; transactionReference?: string; status?: string });
      return ok(
        {
          providerRef: data.transactionRef ?? data.transactionReference ?? `qt-${req.type.toLowerCase()}-${req.reference}`,
          status: (data.status ?? "SUCCESS").toUpperCase(),
        },
        data.transactionRef ?? req.reference,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Quickteller purchase failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async getStatus(providerRef) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "SUCCESS" }, "mock", 10);
    }
    const base = pickBase(creds);
    try {
      const headers = await authHeaders(creds, "GET", "/payments/query");
      const { body } = await http(
        `${base}/payments/query?transactionRef=${encodeURIComponent(providerRef)}`,
        { method: "GET", headers },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { status?: string });
      return ok({ status: (data.status ?? "PENDING").toUpperCase() }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Quickteller getStatus failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};
