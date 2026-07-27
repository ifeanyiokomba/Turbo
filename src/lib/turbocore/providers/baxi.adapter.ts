// TurboCore — Baxi (Interswitch) adapter.
//
// Implements 6 contracts:
//   - baxiBillPayment       (IBillPaymentProvider)        — basic bill payment
//   - baxiAirtime           (IAirtimeProvider)             — airtime + data
//   - baxiBillers           (extended IBillPaymentProvider) — categories / billers / products / validate
//   - baxiDataBundles       (extended IAirtimeProvider)     — list bundles + buy data
//   - baxiCableTV           (standalone)                    — list providers / validate / pay
//   - baxiElectricity       (standalone)                    — list discos / validate meter / pay
//
// Base URL: https://api.baxibox.com/v1 (sandbox: same host with a test Bearer
// token). Auth: Bearer ${secretKey}.
//
// Secrets expected: { "secretKey": "...", "agentId": "..." }

import { ok, fail } from "../result";
import type { IBillPaymentProvider, IAirtimeProvider, ProviderResult } from "../contracts";
import { requireCreds, loadCreds, http, defaultHttpError, sanitize, mockWarnOnce } from "./_shared";
import { BILLERS, DATA_PLANS } from "@/lib/banks";
import { NETWORKS } from "@/lib/constants";
import { generateReference } from "@/lib/money";

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
      const billers = req.category
        ? (BILLERS[req.category] ?? [])
        : cats.flatMap((c) => BILLERS[c] ?? []);
      return ok(
        billers.map((b) => ({ ...b, category: req.category ?? "BILL", country: req.country })),
        "mock",
        20
      );
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Baxi secretKey missing", { providerCode: CODE });
    const service = mapCategoryToBaxiService(req.category);
    try {
      const { body } = await http(
        `${BASE}/services/${encodeURIComponent(service)}/billers`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const list =
        (
          body as {
            providers?: Array<{
              id?: string;
              name?: string;
              service_type?: string;
              refLabel?: string;
              refType?: string;
            }>;
          }
        ).providers ?? [];
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
        const billers = req.category
          ? (BILLERS[req.category] ?? [])
          : cats.flatMap((c) => BILLERS[c] ?? []);
        return ok(
          billers.map((b) => ({ ...b, category: req.category ?? "BILL", country: req.country })),
          "baxi-fallback",
          0
        );
      }
      return ok(out, "baxi-billers", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi listBillers failed";
      // Degrade to local directory on upstream error so the UI stays functional
      const cats = Object.keys(BILLERS);
      const billers = req.category
        ? (BILLERS[req.category] ?? [])
        : cats.flatMap((c) => BILLERS[c] ?? []);
      void msg;
      return ok(
        billers.map((b) => ({ ...b, category: req.category ?? "BILL", country: req.country })),
        "baxi-fallback",
        0
      );
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
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        customer_name?: string;
        valid?: boolean;
        name?: string;
        account_name?: string;
      };
      const name = data.customer_name ?? data.name ?? data.account_name ?? "";
      if (!name) {
        return fail("BENEFICIARY_INVALID", "Baxi could not validate customer", {
          providerCode: CODE,
          raw: sanitize(body),
        });
      }
      return ok({ customerName: name, valid: true }, "baxi-validate", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi validateCustomer failed";
      const code: "UPSTREAM_ERROR" | "BENEFICIARY_INVALID" = /404|not found|invalid/i.test(msg)
        ? "BENEFICIARY_INVALID"
        : "UPSTREAM_ERROR";
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
      return ok(
        { providerRef: `baxi-bill-${req.reference}`, status: "SUCCESS", token },
        "mock",
        150
      );
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
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        transactionReference?: string;
        status?: string;
        token?: string;
        units?: string;
        receipt_no?: string;
        transaction_id?: string;
      };
      return ok(
        {
          providerRef:
            data.transactionReference ?? data.transaction_id ?? `baxi-bill-${req.reference}`,
          status: (data.status ?? "SUCCESS").toUpperCase(),
          token: data.token,
          units: data.units,
          receipt: data.receipt_no,
        },
        data.transactionReference ?? req.reference,
        0
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
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { status?: string; token?: string };
      return ok(
        { status: (data.status ?? "PENDING").toUpperCase(), token: data.token },
        providerRef,
        0
      );
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
      return ok(
        NETWORKS.map((n) => ({ id: n.id, name: n.name, country, color: n.color })),
        "mock",
        10
      );
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Baxi secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/airtime/networks`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const list = (body as { networks?: Array<{ id?: string; name?: string }> }).networks ?? [];
      const out = list
        .filter((n) => n.id && n.name)
        .map((n) => ({ id: String(n.id), name: String(n.name), country }));
      return ok(
        out.length
          ? out
          : NETWORKS.map((n) => ({ id: n.id, name: n.name, country, color: n.color })),
        "baxi-networks",
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi listNetworks failed";
      void msg;
      return ok(
        NETWORKS.map((n) => ({ id: n.id, name: n.name, country, color: n.color })),
        "baxi-fallback",
        0
      );
    }
  },

  async listDataPlans(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        (DATA_PLANS[req.network] ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          amountMinor: p.amountKobo,
          validity: p.validity,
          network: req.network,
        })),
        "mock",
        12
      );
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Baxi secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/data/plans/${encodeURIComponent(req.network)}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const list =
        (
          body as {
            plans?: Array<{ id?: string; name?: string; amount?: number; validity?: string }>;
          }
        ).plans ?? [];
      const out = list
        .filter((p) => p.id && p.name)
        .map((p) => ({
          id: String(p.id),
          name: String(p.name),
          amountMinor: typeof p.amount === "number" ? Math.round(p.amount * 100) : 0,
          validity: p.validity ?? "",
          network: req.network,
        }));
      return ok(
        out.length
          ? out
          : (DATA_PLANS[req.network] ?? []).map((p) => ({
              id: p.id,
              name: p.name,
              amountMinor: p.amountKobo,
              validity: p.validity,
              network: req.network,
            })),
        "baxi-plans",
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi listDataPlans failed";
      void msg;
      return ok(
        (DATA_PLANS[req.network] ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          amountMinor: p.amountKobo,
          validity: p.validity,
          network: req.network,
        })),
        "baxi-fallback",
        0
      );
    }
  },

  async purchase(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { providerRef: `baxi-${req.type.toLowerCase()}-${req.reference}`, status: "SUCCESS" },
        "mock",
        120
      );
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
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        transactionReference?: string;
        transaction_id?: string;
        status?: string;
      };
      return ok(
        {
          providerRef:
            data.transactionReference ??
            data.transaction_id ??
            `baxi-${req.type.toLowerCase()}-${req.reference}`,
          status: (data.status ?? "SUCCESS").toUpperCase(),
        },
        data.transactionReference ?? req.reference,
        0
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
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as { status?: string };
      return ok({ status: (data.status ?? "PENDING").toUpperCase() }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi getStatus failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 3. Billers catalog (extended IBillPaymentProvider)
//    GET  /billers/categories       — list biller categories from Baxi
//    GET  /billers/:category        — list billers by category
//    GET  /billers/:billerId/products — get biller products
//    POST /billers/validate         — validate a bill account
// ---------------------------------------------------------------------------

export interface BaxiBillerCategory {
  id: string;
  name: string;
  description?: string;
}

export interface BaxiProduct {
  id: string;
  name: string;
  amountMinor?: number;
  validity?: string;
  description?: string;
}

export interface BaxiBillersProvider extends IBillPaymentProvider {
  listBillerCategories(): Promise<ProviderResult<BaxiBillerCategory[]>>;
  listBillersByCategory(
    category: string
  ): Promise<
    ProviderResult<
      Array<{ id: string; name: string; category: string; refLabel?: string; refType?: string }>
    >
  >;
  getBillerProducts(billerId: string): Promise<ProviderResult<BaxiProduct[]>>;
  validateBill(req: {
    service_type: string;
    account_number: string;
  }): Promise<
    ProviderResult<{ customerName: string; valid: boolean; metadata?: Record<string, unknown> }>
  >;
}

export const baxiBillers: BaxiBillersProvider = {
  ...baxiBillPayment,
  contract: "BILL_PAYMENT",

  async listBillerCategories() {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const cats = Object.keys(BILLERS).map((id) => ({
        id,
        name: id.charAt(0) + id.slice(1).toLowerCase(),
      }));
      return ok(cats, "mock", 25);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Baxi secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/billers/categories`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const list =
        (
          body as {
            categories?: Array<{
              id?: string;
              categoryId?: string;
              name?: string;
              categoryName?: string;
              description?: string;
            }>;
          }
        ).categories ?? [];
      const out = list
        .filter((c) => c.id || c.categoryId)
        .map((c) => ({
          id: String(c.id ?? c.categoryId),
          name: String(c.name ?? c.categoryName ?? "Unknown"),
          description: c.description,
        }));
      if (!out.length) {
        const cats = Object.keys(BILLERS).map((id) => ({
          id,
          name: id.charAt(0) + id.slice(1).toLowerCase(),
        }));
        return ok(cats, "baxi-fallback", 0);
      }
      return ok(out, "baxi-categories", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi listBillerCategories failed";
      void msg;
      const cats = Object.keys(BILLERS).map((id) => ({
        id,
        name: id.charAt(0) + id.slice(1).toLowerCase(),
      }));
      return ok(cats, "baxi-fallback", 0);
    }
  },

  async listBillersByCategory(category) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const billers = (BILLERS[category.toUpperCase()] ?? []).map((b) => ({
        id: b.code,
        name: b.name,
        category,
        refLabel: b.refLabel,
        refType: b.refType,
      }));
      return ok(billers, "mock", 25);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Baxi secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/billers/${encodeURIComponent(category)}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const list =
        (
          body as {
            providers?: Array<{
              id?: string;
              name?: string;
              service_type?: string;
              refLabel?: string;
              refType?: string;
            }>;
          }
        ).providers ?? [];
      const out = list
        .filter((b) => b.id && b.name)
        .map((b) => ({
          id: String(b.id),
          name: String(b.name),
          category,
          refLabel: b.refLabel,
          refType: b.refType,
        }));
      if (!out.length) {
        const billers = (BILLERS[category.toUpperCase()] ?? []).map((b) => ({
          id: b.code,
          name: b.name,
          category,
          refLabel: b.refLabel,
          refType: b.refType,
        }));
        return ok(billers, "baxi-fallback", 0);
      }
      return ok(out, "baxi-billers-by-cat", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi listBillersByCategory failed";
      void msg;
      const billers = (BILLERS[category.toUpperCase()] ?? []).map((b) => ({
        id: b.code,
        name: b.name,
        category,
        refLabel: b.refLabel,
        refType: b.refType,
      }));
      return ok(billers, "baxi-fallback", 0);
    }
  },

  async getBillerProducts(billerId) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        [
          { id: `${billerId}-POSTPAID`, name: "Postpaid Plan" },
          { id: `${billerId}-PREPAID`, name: "Prepaid Plan" },
        ],
        "mock",
        30
      );
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Baxi secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/billers/${encodeURIComponent(billerId)}/products`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const list =
        (
          body as {
            products?: Array<{
              id?: string;
              productId?: string;
              name?: string;
              productName?: string;
              amount?: number;
              validity?: string;
              description?: string;
            }>;
          }
        ).products ?? [];
      const out = list
        .filter((p) => p.id || p.productId || p.name || p.productName)
        .map((p) => ({
          id: String(p.id ?? p.productId ?? ""),
          name: String(p.name ?? p.productName ?? ""),
          amountMinor: typeof p.amount === "number" ? Math.round(p.amount * 100) : undefined,
          validity: p.validity,
          description: p.description,
        }));
      return ok(out, "baxi-products", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi getBillerProducts failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async validateBill(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { customerName: `CUSTOMER ${req.account_number.slice(-4)}`, valid: true },
        "mock",
        40
      );
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Baxi secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/billers/validate`,
        {
          method: "POST",
          headers: authHeaders(secretKey),
          body: JSON.stringify({
            service_type: req.service_type,
            account_number: req.account_number,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        customer_name?: string;
        name?: string;
        account_name?: string;
        valid?: boolean;
        metadata?: Record<string, unknown>;
      };
      const name = data.customer_name ?? data.name ?? data.account_name ?? "";
      if (!name) {
        return fail("BENEFICIARY_INVALID", "Baxi could not validate bill account", {
          providerCode: CODE,
          raw: sanitize(body),
        });
      }
      return ok(
        { customerName: name, valid: true, metadata: data.metadata },
        "baxi-validate-bill",
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi validateBill failed";
      const code: "UPSTREAM_ERROR" | "BENEFICIARY_INVALID" = /404|not found|invalid/i.test(msg)
        ? "BENEFICIARY_INVALID"
        : "UPSTREAM_ERROR";
      return fail(code, msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 4. Data bundles (extended IAirtimeProvider)
//    GET  /data/bundles/:network — list data bundles for a network
//    POST /data/request          — buy a data bundle
// ---------------------------------------------------------------------------

export interface BaxiDataBundle {
  id: string;
  name: string;
  amountMinor: number;
  validity: string;
  network: string;
  description?: string;
}

export interface BaxiDataBundlesProvider extends IAirtimeProvider {
  listDataBundles(network: string): Promise<ProviderResult<BaxiDataBundle[]>>;
  buyData(req: {
    network: string;
    phone: string;
    planId: string;
    amountMinor: number;
    reference?: string;
  }): Promise<ProviderResult<{ providerRef: string; status: string }>>;
}

export const baxiDataBundles: BaxiDataBundlesProvider = {
  ...baxiAirtime,
  contract: "AIRTIME",

  async listDataBundles(network) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        (DATA_PLANS[network] ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          amountMinor: p.amountKobo,
          validity: p.validity,
          network,
        })),
        "mock",
        15
      );
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Baxi secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/data/bundles/${encodeURIComponent(network)}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const list =
        (
          body as {
            bundles?: Array<{
              id?: string;
              plan_id?: string;
              name?: string;
              planName?: string;
              amount?: number;
              validity?: string;
              description?: string;
            }>;
          }
        ).bundles ?? [];
      const out = list
        .filter((p) => p.id || p.plan_id || p.name || p.planName)
        .map((p) => ({
          id: String(p.id ?? p.plan_id ?? ""),
          name: String(p.name ?? p.planName ?? ""),
          amountMinor: typeof p.amount === "number" ? Math.round(p.amount * 100) : 0,
          validity: p.validity ?? "",
          network,
          description: p.description,
        }));
      return ok(
        out.length
          ? out
          : (DATA_PLANS[network] ?? []).map((p) => ({
              id: p.id,
              name: p.name,
              amountMinor: p.amountKobo,
              validity: p.validity,
              network,
            })),
        "baxi-data-bundles",
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi listDataBundles failed";
      void msg;
      return ok(
        (DATA_PLANS[network] ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          amountMinor: p.amountKobo,
          validity: p.validity,
          network,
        })),
        "baxi-fallback",
        0
      );
    }
  },

  async buyData(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const ref = req.reference ?? generateReference("BAXI");
      return ok({ providerRef: `baxi-data-${ref}`, status: "SUCCESS" }, "mock", 150);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Baxi secretKey missing", { providerCode: CODE });
    try {
      const ref = req.reference ?? generateReference("BAXI");
      const { body } = await http(
        `${BASE}/data/request`,
        {
          method: "POST",
          headers: authHeaders(secretKey),
          body: JSON.stringify({
            network: req.network,
            phone: req.phone,
            plan_id: req.planId,
            amount: req.amountMinor / 100, // major units
            reference: ref,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        transactionReference?: string;
        transaction_id?: string;
        status?: string;
      };
      return ok(
        {
          providerRef: data.transactionReference ?? data.transaction_id ?? `baxi-data-${ref}`,
          status: (data.status ?? "SUCCESS").toUpperCase(),
        },
        data.transactionReference ?? ref,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi buyData failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 5. Cable TV
//    GET  /cable-tv/providers
//    POST /cable-tv/validate
//    POST /cable-tv/pay
// ---------------------------------------------------------------------------

export interface BaxiCableProvider {
  id: string;
  name: string;
  refLabel?: string;
}

export const baxiCableTV = {
  async listCableTVProviders(): Promise<ProviderResult<BaxiCableProvider[]>> {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        [
          { id: "dstv", name: "DStv", refLabel: "Smartcard Number" },
          { id: "gotv", name: "GOtv", refLabel: "IUC Number" },
          { id: "startimes", name: "StarTimes", refLabel: "Smartcard Number" },
          { id: "showmax", name: "Showmax", refLabel: "Customer ID" },
        ],
        "mock",
        25
      );
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Baxi secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/cable-tv/providers`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const list =
        (
          body as {
            providers?: Array<{
              id?: string;
              name?: string;
              service_type?: string;
              refLabel?: string;
            }>;
          }
        ).providers ?? [];
      const out = list
        .filter((p) => p.id && p.name)
        .map((p) => ({ id: String(p.id), name: String(p.name), refLabel: p.refLabel }));
      return ok(
        out.length
          ? out
          : [
              { id: "dstv", name: "DStv", refLabel: "Smartcard Number" },
              { id: "gotv", name: "GOtv", refLabel: "IUC Number" },
              { id: "startimes", name: "StarTimes", refLabel: "Smartcard Number" },
            ],
        "baxi-cable-providers",
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi listCableTVProviders failed";
      void msg;
      return ok(
        [
          { id: "dstv", name: "DStv", refLabel: "Smartcard Number" },
          { id: "gotv", name: "GOtv", refLabel: "IUC Number" },
          { id: "startimes", name: "StarTimes", refLabel: "Smartcard Number" },
        ],
        "baxi-fallback",
        0
      );
    }
  },

  async validateCableTV(req: {
    service_type: string;
    smartcard_number: string;
  }): Promise<
    ProviderResult<{ customerName: string; valid: boolean; metadata?: Record<string, unknown> }>
  > {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        { customerName: `CUSTOMER ${req.smartcard_number.slice(-4)}`, valid: true },
        "mock",
        40
      );
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Baxi secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/cable-tv/validate`,
        {
          method: "POST",
          headers: authHeaders(secretKey),
          body: JSON.stringify({
            service_type: req.service_type,
            smartcard_number: req.smartcard_number,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        customer_name?: string;
        name?: string;
        account_name?: string;
        valid?: boolean;
        metadata?: Record<string, unknown>;
      };
      const name = data.customer_name ?? data.name ?? data.account_name ?? "";
      if (!name) {
        return fail("BENEFICIARY_INVALID", "Baxi could not validate smartcard", {
          providerCode: CODE,
          raw: sanitize(body),
        });
      }
      return ok(
        { customerName: name, valid: true, metadata: data.metadata },
        "baxi-cable-validate",
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi validateCableTV failed";
      const code: "UPSTREAM_ERROR" | "BENEFICIARY_INVALID" = /404|not found|invalid/i.test(msg)
        ? "BENEFICIARY_INVALID"
        : "UPSTREAM_ERROR";
      return fail(code, msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async payCableTV(req: {
    service_type: string;
    smartcard_number: string;
    plan_id: string;
    amountMinor: number;
    reference?: string;
  }): Promise<ProviderResult<{ providerRef: string; status: string; receipt?: string }>> {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const ref = req.reference ?? generateReference("BAXI");
      return ok({ providerRef: `baxi-cable-${ref}`, status: "SUCCESS" }, "mock", 150);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Baxi secretKey missing", { providerCode: CODE });
    try {
      const ref = req.reference ?? generateReference("BAXI");
      const { body } = await http(
        `${BASE}/cable-tv/pay`,
        {
          method: "POST",
          headers: authHeaders(secretKey),
          body: JSON.stringify({
            service_type: req.service_type,
            smartcard_number: req.smartcard_number,
            plan_id: req.plan_id,
            amount: req.amountMinor / 100, // major units
            reference: ref,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        transactionReference?: string;
        transaction_id?: string;
        status?: string;
        receipt_no?: string;
      };
      return ok(
        {
          providerRef: data.transactionReference ?? data.transaction_id ?? `baxi-cable-${ref}`,
          status: (data.status ?? "SUCCESS").toUpperCase(),
          receipt: data.receipt_no,
        },
        data.transactionReference ?? ref,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi payCableTV failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 6. Electricity
//    GET  /electricity/discos
//    POST /electricity/validate
//    POST /electricity/pay
// ---------------------------------------------------------------------------

export interface BaxiDisco {
  id: string;
  name: string;
}

export const baxiElectricity = {
  async listElectricityDiscos(): Promise<ProviderResult<BaxiDisco[]>> {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        [
          { id: "ikedc", name: "Ikeja Electric" },
          { id: "ekedc", name: "Eko Electric" },
          { id: "aedc", name: "Abuja Electric" },
          { id: "phed", name: "Port Harcourt Electric" },
          { id: "ibedc", name: "Ibadan Electric" },
          { id: "kaedco", name: "Kano Electric" },
          { id: "jed", name: "Jos Electric" },
        ],
        "mock",
        25
      );
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Baxi secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/electricity/discos`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const list =
        (body as { discos?: Array<{ id?: string; name?: string; service_type?: string }> })
          .discos ?? [];
      const out = list
        .filter((d) => d.id && d.name)
        .map((d) => ({ id: String(d.id), name: String(d.name) }));
      return ok(
        out.length
          ? out
          : [
              { id: "ikedc", name: "Ikeja Electric" },
              { id: "ekedc", name: "Eko Electric" },
              { id: "aedc", name: "Abuja Electric" },
              { id: "phed", name: "Port Harcourt Electric" },
              { id: "ibedc", name: "Ibadan Electric" },
            ],
        "baxi-discos",
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi listElectricityDiscos failed";
      void msg;
      return ok(
        [
          { id: "ikedc", name: "Ikeja Electric" },
          { id: "ekedc", name: "Eko Electric" },
          { id: "aedc", name: "Abuja Electric" },
          { id: "phed", name: "Port Harcourt Electric" },
          { id: "ibedc", name: "Ibadan Electric" },
        ],
        "baxi-fallback",
        0
      );
    }
  },

  async validateMeter(req: {
    disco: string;
    meter_number: string;
    meter_type: "PREPAID" | "POSTPAID";
  }): Promise<
    ProviderResult<{
      customerName: string;
      valid: boolean;
      meterType?: string;
      metadata?: Record<string, unknown>;
    }>
  > {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        {
          customerName: `CUSTOMER ${req.meter_number.slice(-4)}`,
          valid: true,
          meterType: req.meter_type,
        },
        "mock",
        40
      );
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Baxi secretKey missing", { providerCode: CODE });
    try {
      const { body } = await http(
        `${BASE}/electricity/validate`,
        {
          method: "POST",
          headers: authHeaders(secretKey),
          body: JSON.stringify({
            disco: req.disco,
            meter_number: req.meter_number,
            meter_type: req.meter_type,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        customer_name?: string;
        name?: string;
        account_name?: string;
        valid?: boolean;
        meter_type?: string;
        metadata?: Record<string, unknown>;
      };
      const name = data.customer_name ?? data.name ?? data.account_name ?? "";
      if (!name) {
        return fail("BENEFICIARY_INVALID", "Baxi could not validate meter", {
          providerCode: CODE,
          raw: sanitize(body),
        });
      }
      return ok(
        {
          customerName: name,
          valid: true,
          meterType: data.meter_type ?? req.meter_type,
          metadata: data.metadata,
        },
        "baxi-meter-validate",
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi validateMeter failed";
      const code: "UPSTREAM_ERROR" | "BENEFICIARY_INVALID" = /404|not found|invalid/i.test(msg)
        ? "BENEFICIARY_INVALID"
        : "UPSTREAM_ERROR";
      return fail(code, msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async payElectricity(req: {
    disco: string;
    meter_number: string;
    meter_type: "PREPAID" | "POSTPAID";
    amountMinor: number;
    reference?: string;
  }): Promise<
    ProviderResult<{
      providerRef: string;
      status: string;
      token?: string;
      units?: string;
      receipt?: string;
    }>
  > {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const ref = req.reference ?? generateReference("BAXI");
      // For prepaid, generate a 20-digit token; for postpaid, no token
      const token =
        req.meter_type === "PREPAID"
          ? Array.from({ length: 20 }, () => Math.floor(Math.random() * 10)).join("")
          : undefined;
      return ok({ providerRef: `baxi-electricity-${ref}`, status: "SUCCESS", token }, "mock", 150);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Baxi secretKey missing", { providerCode: CODE });
    try {
      const ref = req.reference ?? generateReference("BAXI");
      const { body } = await http(
        `${BASE}/electricity/pay`,
        {
          method: "POST",
          headers: authHeaders(secretKey),
          body: JSON.stringify({
            disco: req.disco,
            meter_number: req.meter_number,
            meter_type: req.meter_type,
            amount: req.amountMinor / 100, // major units
            reference: ref,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = body as {
        transactionReference?: string;
        transaction_id?: string;
        status?: string;
        token?: string;
        units?: string;
        receipt_no?: string;
      };
      return ok(
        {
          providerRef:
            data.transactionReference ?? data.transaction_id ?? `baxi-electricity-${ref}`,
          status: (data.status ?? "SUCCESS").toUpperCase(),
          token: data.token,
          units: data.units,
          receipt: data.receipt_no,
        },
        data.transactionReference ?? ref,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Baxi payElectricity failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};
