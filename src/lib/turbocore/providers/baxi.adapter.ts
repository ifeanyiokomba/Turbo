// TurboCore — Baxi (Interswitch) adapter.
//
// Implements 2 contracts:
//   - baxiBillPayment (IBillPaymentProvider)
//   - baxiAirtime     (IAirtimeProvider)
//
// Base URL: https://api.baxibox.com/v1 (sandbox: same host with a test Bearer
// token). Auth: Bearer ${secretKey}.
//
// Secrets expected: { "secretKey": "...", "agentId": "..." }

import { ok, fail } from "../result";
import type { IBillPaymentProvider, IAirtimeProvider } from "../contracts";
import { requireCreds, loadCreds, http, defaultHttpError, sanitize, mockWarnOnce } from "./_shared";
import { BILLERS, DATA_PLANS } from "@/lib/banks";
import { NETWORKS } from "@/lib/constants";

const CODE = "baxi";
const BASE = "https://api.baxibox.com/v1";

function authHeaders(secretKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function mapCategoryToBaxiService(category: string | undefined): string {
  if (!category) return "electricity";
  const c = category.toLowerCase();
  if (c.includes("electric")) return "electricity";
  if (c.includes("cable")) return "cable";
  if (c.includes("internet")) return "internet";
  if (c.includes("water")) return "water";
  if (c.includes("betting")) return "betting";
  if (c.includes("insurance")) return "insurance";
  return c.toLowerCase();
}

// ---------------------------------------------------------------------------
// 1. Bill payment
// ---------------------------------------------------------------------------

export const baxiBillPayment: IBillPaymentProvider = {
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
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Baxi secretKey missing", { providerCode: CODE });
    const service = mapCategoryToBaxiService(req.category);
    try {
      const { body } = await http(
        `${BASE}/services/${encodeURIComponent(service)}/billers`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const list = (body as { providers?: Array<{ id?: string; name?: string; service_type?: string; refLabel?: string; refType?: string }> }).providers ?? [];
      const out = list
        .filter((b) => b.id && b.name)
        .map((b) => ({
          code: String(b.id),
          name: String(b.name),
          category: req.category ?? "BILL",
          country: req.country,
          refLabel: b.refLabel ?? "Account Number",
          refType: b.refType ?? "account",
        }));
      // Fall back to local directory if upstream is empty
      if (!out.length) {
        const cats = Object.keys(BILLERS);
        const billers = req.category ? BILLERS[req.category] ?? [] : cats.flatMap((c) => BILLERS[c] ?? []);
        return ok(billers.map((b) => ({ ...b, category: req.category ?? "BILL", country: req.country })), "baxi-fallback", 0);
      }
      return ok(out, "baxi-billers", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi listBillers failed";
      // Degrade to local directory on upstream error so the UI stays functional
      const cats = Object.keys(BILLERS);
      const billers = req.category ? BILLERS[req.category] ?? [] : cats.flatMap((c) => BILLERS[c] ?? []);
      void msg;
      return ok(billers.map((b) => ({ ...b, category: req.category ?? "BILL", country: req.country })), "baxi-fallback", 0);
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
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Baxi secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/services/${encodeURIComponent(req.billerCode)}/customers/validate`,
        {
          method: "POST",
          headers: authHeaders(secretKey),
          body: JSON.stringify({ account_number: req.customerRef }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { customer_name?: string; valid?: boolean; name?: string; account_name?: string });
      const name = data.customer_name ?? data.name ?? data.account_name ?? "";
      if (!name) {
        return fail("BENEFICIARY_INVALID", "Baxi could not validate customer", { providerCode: CODE, raw: sanitize(body) });
      }
      return ok({ customerName: name, valid: true }, "baxi-validate", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi validateCustomer failed";
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
      return ok({ providerRef: `baxi-bill-${req.reference}`, status: "SUCCESS", token }, "mock", 150);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Baxi secretKey missing", { providerCode: CODE });
    try {
      const payload: Record<string, unknown> = {
        service_type: req.billerCode,
        biller_name: req.billerCode,
        account_number: req.customerRef,
        amount: req.amountMinor / 100, // Baxi uses major units
        phone: undefined,
        plan: req.productCode,
        reference: req.reference,
      };
      const { body } = await http(
        `${BASE}/bills/pay`,
        { method: "POST", headers: authHeaders(secretKey), body: JSON.stringify(payload) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as {
        transactionReference?: string;
        status?: string;
        token?: string;
        units?: string;
        receipt_no?: string;
        transaction_id?: string;
      });
      return ok(
        {
          providerRef: data.transactionReference ?? data.transaction_id ?? `baxi-bill-${req.reference}`,
          status: (data.status ?? "SUCCESS").toUpperCase(),
          token: data.token,
          units: data.units,
          receipt: data.receipt_no,
        },
        data.transactionReference ?? req.reference,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi payBill failed";
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
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Baxi secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/transactions/${encodeURIComponent(providerRef)}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { status?: string; token?: string });
      return ok({ status: (data.status ?? "PENDING").toUpperCase(), token: data.token }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi queryBillPayment failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 2. Airtime & data
// ---------------------------------------------------------------------------

export const baxiAirtime: IAirtimeProvider = {
  contract: "AIRTIME",

  async listNetworks(country) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(NETWORKS.map((n) => ({ id: n.id, name: n.name, country, color: n.color })), "mock", 10);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Baxi secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(`${BASE}/airtime/networks`, { method: "GET", headers: authHeaders(secretKey) }, (s, b) =>
        defaultHttpError(CODE, s, b),
      );
      const list = (body as { networks?: Array<{ id?: string; name?: string }> }).networks ?? [];
      const out = list
        .filter((n) => n.id && n.name)
        .map((n) => ({ id: String(n.id), name: String(n.name), country }));
      return ok(out.length ? out : NETWORKS.map((n) => ({ id: n.id, name: n.name, country, color: n.color })), "baxi-networks", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi listNetworks failed";
      void msg;
      return ok(NETWORKS.map((n) => ({ id: n.id, name: n.name, country, color: n.color })), "baxi-fallback", 0);
    }
  },

  async listDataPlans(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok((DATA_PLANS[req.network] ?? []).map((p) => ({ id: p.id, name: p.name, amountMinor: p.amountKobo, validity: p.validity, network: req.network })), "mock", 12);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Baxi secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/data/plans/${encodeURIComponent(req.network)}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const list = (body as { plans?: Array<{ id?: string; name?: string; amount?: number; validity?: string }> }).plans ?? [];
      const out = list
        .filter((p) => p.id && p.name)
        .map((p) => ({
          id: String(p.id),
          name: String(p.name),
          amountMinor: typeof p.amount === "number" ? Math.round(p.amount * 100) : 0,
          validity: p.validity ?? "",
          network: req.network,
        }));
      return ok(out.length ? out : (DATA_PLANS[req.network] ?? []).map((p) => ({ id: p.id, name: p.name, amountMinor: p.amountKobo, validity: p.validity, network: req.network })), "baxi-plans", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi listDataPlans failed";
      void msg;
      return ok((DATA_PLANS[req.network] ?? []).map((p) => ({ id: p.id, name: p.name, amountMinor: p.amountKobo, validity: p.validity, network: req.network })), "baxi-fallback", 0);
    }
  },

  async purchase(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `baxi-${req.type.toLowerCase()}-${req.reference}`, status: "SUCCESS" }, "mock", 120);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Baxi secretKey missing", { providerCode: CODE });
    try {
      const endpoint = req.type === "DATA" ? "data/request" : "airtime/request";
      const payload: Record<string, unknown> = {
        network: req.network,
        phone: req.phone,
        reference: req.reference,
      };
      if (req.type === "AIRTIME") {
        payload.amount = (req.amountMinor ?? 0) / 100;
      } else {
        payload.plan = req.planCode;
      }
      const { body } = await http(
        `${BASE}/${endpoint}`,
        { method: "POST", headers: authHeaders(secretKey), body: JSON.stringify(payload) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { transactionReference?: string; transaction_id?: string; status?: string });
      return ok(
        {
          providerRef: data.transactionReference ?? data.transaction_id ?? `baxi-${req.type.toLowerCase()}-${req.reference}`,
          status: (data.status ?? "SUCCESS").toUpperCase(),
        },
        data.transactionReference ?? req.reference,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi purchase failed";
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
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Baxi secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/transactions/${encodeURIComponent(providerRef)}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { status?: string });
      return ok({ status: (data.status ?? "PENDING").toUpperCase() }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi getStatus failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};
