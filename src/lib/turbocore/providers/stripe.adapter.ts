// TurboCore — Stripe adapter.
//
// Implements 9 contracts:
//   - stripeCardPayment       (ICardPaymentProvider)              — Payment Intents
//   - stripeIssuing           (IVirtualCardIssuer)                — Issuing Cards
//   - stripeCustomers         (ICustomerProvider)                 — /v1/customers CRUD
//   - stripeSubscriptions     (IRecurringBillingProvider)         — /v1/subscriptions CRUD
//   - stripeProducts          (IProductProvider)                  — /v1/products
//   - stripePrices            (IPriceProvider)                     — /v1/prices
//   - stripePayouts           (IPayoutProvider)                   — /v1/payouts
//   - stripeRefunds           (IRefundProvider)                   — /v1/refunds (list/create)
//   - stripeWebhookEndpoints  (IWebhookEndpointProvider)          — /v1/webhook_endpoints
//
// Uses the Stripe REST API directly via fetch (the `stripe` npm package is not
// in dependencies; using fetch keeps the bundle lean and matches the pattern
// used by the other adapters). Body is form-encoded
// (application/x-www-form-urlencoded) per Stripe's REST contract.
//
// Base URL: https://api.stripe.com/v1 (sandbox: same host with `sk_test_...`).
// Auth: `Authorization: Bearer ${secretKey}`.
//
// Secrets expected: { "secretKey": "sk_test_...", "publishableKey": "pk_..." }

import { ok, fail } from "../result";
import type {
  ICardPaymentProvider,
  IVirtualCardIssuer,
  ICustomerProvider,
  IRecurringBillingProvider,
  IProductProvider,
  IPriceProvider,
  IPayoutProvider,
  IRefundProvider,
  IWebhookEndpointProvider,
} from "../contracts";
import { requireCreds, loadCreds, http, defaultHttpError, sanitize, mockWarnOnce } from "./_shared";
import { encryptSecret } from "@/lib/auth";
import { generatePan, generateExpiry } from "@/lib/money";

const CODE = "stripe";
const BASE = "https://api.stripe.com/v1";

function authHeaders(secretKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
}

/** Stripe form encoding — nested objects become `a[b][c]=v`, arrays become `a[0]=v`. */
function encodeForm(obj: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value == null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (v == null) return;
        if (typeof v === "object") {
          parts.push(encodeForm(v as Record<string, unknown>, `${name}[${i}]`));
        } else {
          parts.push(`${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(String(v))}`);
        }
      });
    } else if (typeof value === "object") {
      parts.push(encodeForm(value as Record<string, unknown>, name));
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

// ---------------------------------------------------------------------------
// 1. Card payment (Payment Intents)
// ---------------------------------------------------------------------------

export const stripeCardPayment: ICardPaymentProvider = {
  contract: "CARD_PAYMENT",

  async initializeCharge(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `stripe-mock-${req.reference}`, status: "PENDING" }, "mock", 50);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const form = encodeForm({
        amount: req.amountMinor, // Stripe expects minor units (cents)
        currency: (req.currency ?? "NGN").toLowerCase(),
        "automatic_payment_methods[enabled]": true,
        description: `Turbopay charge ${req.reference}`,
        metadata: {
          reference: req.reference,
          email: req.customer.email ?? "",
          name: req.customer.name ?? "",
          phone: req.customer.phone ?? "",
        },
      });
      const { body } = await http(
        `${BASE}/payment_intents`,
        { method: "POST", headers: authHeaders(secretKey), body: form },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string; status?: string; client_secret?: string; next_action?: { redirect_to_url?: { url?: string } } });
      if (!data.id) {
        return fail("UPSTREAM_ERROR", "Stripe returned no payment intent id", { providerCode: CODE, raw: sanitize(body) });
      }
      const status: "PENDING" | "SUCCESS" | "3DS_REQUIRED" =
        data.status === "succeeded" ? "SUCCESS" : data.next_action?.redirect_to_url?.url ? "3DS_REQUIRED" : "PENDING";
      const authUrl = data.next_action?.redirect_to_url?.url;
      return ok({ providerRef: data.id, status, authUrl }, data.id, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe initializeCharge failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async verifyCharge(providerRef) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "succeeded", amountSettledMinor: 0, currency: "NGN" }, "mock", 30);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/payment_intents/${encodeURIComponent(providerRef)}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { status?: string; amount?: number; amount_received?: number; currency?: string });
      const status = data.status ?? "pending";
      const amountSettledMinor = typeof data.amount_received === "number" ? data.amount_received : data.amount ?? 0;
      return ok({ status, amountSettledMinor, currency: (data.currency ?? "NGN").toUpperCase() }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe verifyCharge failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async refund(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ refundRef: `stripe-refund-${req.providerRef}`, status: "pending" }, "mock", 60);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const form = encodeForm({
        payment_intent: req.providerRef,
        amount: req.amountMinor,
        reason: req.reason ? "requested_by_customer" : undefined,
        metadata: { reason: req.reason ?? "" },
      });
      const { body } = await http(
        `${BASE}/refunds`,
        { method: "POST", headers: authHeaders(secretKey), body: form },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string; status?: string });
      return ok(
        { refundRef: data.id ?? `stripe-refund-${req.providerRef}`, status: data.status ?? "pending" },
        data.id ?? "stripe-refund",
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe refund failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 2. Virtual card issuer (Stripe Issuing)
// ---------------------------------------------------------------------------

export const stripeIssuing: IVirtualCardIssuer = {
  contract: "VIRTUAL_CARD_ISSUER",

  async issueCard(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const { pan, last4 } = generatePan();
      return ok(
        {
          providerRef: `stripe-mock-${req.userId}`,
          panEnc: encryptSecret(pan),
          cvvEnc: encryptSecret(String(Math.floor(100 + Math.random() * 900))),
          last4,
          expiry: generateExpiry(),
        },
        "mock",
        80,
      );
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      // Step 1 — create (or reuse) a cardholder. The caller passes a Wise/Stripe
      // cardholder id in `req.cardholder` if they already have one; otherwise
      // we create a new cardholder for this user.
      let cardholderId = req.cardholder;
      if (!cardholderId || !cardholderId.startsWith("ich_")) {
        const chForm = encodeForm({
          name: req.cardholder,
          email: `${req.userId}@turbopay.ng`,
          type: "individual",
          "billing[address][country]": "US",
          "billing[address][line1]": "Unknown",
          "billing[address][postal_code]": "00000",
        });
        const { body: chBody } = await http(
          `${BASE}/issuing/cardholders`,
          { method: "POST", headers: authHeaders(secretKey), body: chForm },
          (s, b) => defaultHttpError(CODE, s, b),
        );
        cardholderId = (chBody as { id?: string }).id ?? "";
        if (!cardholderId) {
          return fail("UPSTREAM_ERROR", "Stripe cardholder creation failed", { providerCode: CODE, raw: sanitize(chBody) });
        }
      }

      // Step 2 — issue the virtual card.
      const form = encodeForm({
        cardholder: cardholderId,
        currency: (req.currency ?? "USD").toLowerCase(),
        type: "virtual",
        "spending_controls[amount_spent]": req.spendingLimitMinor,
        "spending_controls[interval]": "all_time",
        "spending_controls[allowed_categories][]": [],
        "spending_controls[blocked_categories][]": [],
        metadata: { userId: req.userId, type: req.type },
      });
      const { body } = await http(
        `${BASE}/issuing/cards`,
        { method: "POST", headers: authHeaders(secretKey), body: form },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string; last4?: string; exp_month?: number; exp_year?: number; currency?: string });
      if (!data.id) {
        return fail("UPSTREAM_ERROR", "Stripe returned no card id", { providerCode: CODE, raw: sanitize(body) });
      }
      // Stripe does NOT return the full PAN/CVV — only the last4 and a
      // card fingerprint. We store a placeholder encrypted token so the
      // schema's `panEnc`/`cvvEnc` columns stay non-null; the only way to
      // retrieve a real PAN is via Stripe's /issuing/cards/:id/number
      // sensitive endpoint, which is gated and not safe for this flow.
      const expiry = data.exp_month && data.exp_year ? `${String(data.exp_month).padStart(2, "0")}/${String(data.exp_year).slice(-2)}` : generateExpiry();
      return ok(
        {
          providerRef: data.id,
          panEnc: encryptSecret(`stripe-issuing:${data.id}:pan-not-retrieved`),
          cvvEnc: encryptSecret(`stripe-issuing:${data.id}:cvv-not-retrieved`),
          last4: data.last4 ?? "0000",
          expiry,
        },
        data.id,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe issueCard failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async fundCard(req) {
    // Stripe Issuing cards draw from the Issuing balance — top up via
    // POST /topups or /issuing/funding_requests (private). For the public
    // API we record a funding intent via the card's spending_controls.
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "SUCCESS" }, "mock", 30);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });
    try {
      const form = encodeForm({
        "spending_controls[amount_spent]": req.amountMinor,
        "spending_controls[interval]": "all_time",
      });
      const { body } = await http(
        `${BASE}/issuing/cards/${encodeURIComponent(req.providerRef)}`,
        { method: "POST", headers: authHeaders(secretKey), body: form },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string; spending_controls?: { amount_spent?: number } });
      return ok({ status: data.id ? "SUCCESS" : "PENDING" }, req.providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe fundCard failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async withdrawCard(req) {
    // Withdraw = lower the card's spending limit to recover unused balance.
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "SUCCESS" }, "mock", 30);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });
    try {
      const form = encodeForm({
        "spending_controls[amount_spent]": 0,
        "spending_controls[interval]": "all_time",
      });
      const { body } = await http(
        `${BASE}/issuing/cards/${encodeURIComponent(req.providerRef)}`,
        { method: "POST", headers: authHeaders(secretKey), body: form },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string });
      return ok({ status: data.id ? "SUCCESS" : "PENDING" }, req.providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe withdrawCard failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async freezeCard(providerRef) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "FROZEN" }, "mock", 20);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });
    try {
      const form = encodeForm({ status: "inactive" });
      const { body } = await http(
        `${BASE}/issuing/cards/${encodeURIComponent(providerRef)}`,
        { method: "POST", headers: authHeaders(secretKey), body: form },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { status?: string });
      return ok({ status: (data.status ?? "inactive").toUpperCase() }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe freezeCard failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async unfreezeCard(providerRef) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "ACTIVE" }, "mock", 20);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });
    try {
      const form = encodeForm({ status: "active" });
      const { body } = await http(
        `${BASE}/issuing/cards/${encodeURIComponent(providerRef)}`,
        { method: "POST", headers: authHeaders(secretKey), body: form },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { status?: string });
      return ok({ status: (data.status ?? "active").toUpperCase() }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe unfreezeCard failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async terminateCard(providerRef) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "TERMINATED", refundedMinor: 0 }, "mock", 20);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });
    try {
      const form = encodeForm({ status: "canceled" });
      const { body } = await http(
        `${BASE}/issuing/cards/${encodeURIComponent(providerRef)}`,
        { method: "POST", headers: authHeaders(secretKey), body: form },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string; status?: string; spending_controls?: { amount_spent?: number } });
      const refunded = data.spending_controls?.amount_spent ?? 0;
      return ok({ status: "TERMINATED", refundedMinor: refunded }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe terminateCard failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 3. Customers — POST/GET/POST/DELETE /v1/customers(/:id)
// ---------------------------------------------------------------------------

function mapStripeCustomer(d: Record<string, unknown>): import("../contracts").ICustomer {
  return {
    id: String(d.id ?? ""),
    email: String(d.email ?? ""),
    name: typeof d.name === "string" ? d.name : undefined,
    phone: typeof d.phone === "string" ? d.phone : undefined,
    metadata: (d.metadata ?? undefined) as Record<string, unknown> | undefined,
    createdAt: typeof d.created === "number" ? new Date(d.created * 1000).toISOString() : undefined,
  };
}

export const stripeCustomers: ICustomerProvider = {
  contract: "CUSTOMER",

  async createCustomer(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const id = `cus_mock_${Math.random().toString(36).slice(2, 12)}`;
      return ok({ id, email: req.email, name: req.name, phone: req.phone, metadata: req.metadata, createdAt: new Date().toISOString() }, "mock", 60);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const form = encodeForm({
        email: req.email,
        name: req.name,
        phone: req.phone,
        metadata: req.metadata ?? {},
      });
      const { body } = await http(
        `${BASE}/customers`,
        { method: "POST", headers: authHeaders(secretKey), body: form },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string }).id ? (body as Record<string, unknown>) : null;
      if (!data) return fail("UPSTREAM_ERROR", "Stripe createCustomer returned no data", { providerCode: CODE, raw: sanitize(body) });
      return ok(mapStripeCustomer(data), String(data.id), 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe createCustomer failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async listCustomers(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ customers: [], total: 0, hasMore: false }, "mock", 30);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const params = new URLSearchParams();
      if (req?.perPage) params.set("limit", String(req.perPage));
      if (req?.page && req.page > 1) {
        // Stripe uses cursor-based pagination via `starting_after`. Without a
        // cursor we can only fetch the first page; we leave the param unset for
        // page 1 and let callers chase `hasMore` with starting_after.
      }
      const qs = params.toString() ? `?${params.toString()}` : "";
      const { body } = await http(
        `${BASE}/customers${qs}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: Record<string, unknown>[]; has_more?: boolean }).data ?? [];
      const hasMore = (body as { has_more?: boolean }).has_more ?? false;
      return ok({ customers: data.map(mapStripeCustomer), hasMore }, "stripe-cust-list", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe listCustomers failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async fetchCustomer(id) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ id, email: "demo@turbopay.ng", createdAt: new Date().toISOString() }, "mock", 20);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/customers/${encodeURIComponent(id)}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string }).id ? (body as Record<string, unknown>) : null;
      if (!data) return fail("UPSTREAM_ERROR", "Stripe fetchCustomer returned no data", { providerCode: CODE, raw: sanitize(body) });
      return ok(mapStripeCustomer(data), id, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe fetchCustomer failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async updateCustomer(id, req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ id, email: req.email ?? "demo@turbopay.ng", name: req.name, phone: req.phone, metadata: req.metadata }, "mock", 30);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const form = encodeForm({
        email: req.email,
        name: req.name,
        phone: req.phone,
        metadata: req.metadata,
      });
      const { body } = await http(
        `${BASE}/customers/${encodeURIComponent(id)}`,
        { method: "POST", headers: authHeaders(secretKey), body: form },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string }).id ? (body as Record<string, unknown>) : null;
      if (!data) return fail("UPSTREAM_ERROR", "Stripe updateCustomer returned no data", { providerCode: CODE, raw: sanitize(body) });
      return ok(mapStripeCustomer(data), id, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe updateCustomer failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async deleteCustomer(id) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ deleted: true }, "mock", 20);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      await http(
        `${BASE}/customers/${encodeURIComponent(id)}`,
        { method: "DELETE", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      return ok({ deleted: true }, id, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe deleteCustomer failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 4. Products — POST/GET /v1/products
// ---------------------------------------------------------------------------

function mapStripeProduct(d: Record<string, unknown>): import("../contracts").IProduct {
  return {
    id: String(d.id ?? ""),
    name: String(d.name ?? ""),
    description: typeof d.description === "string" ? d.description : undefined,
    active: typeof d.active === "boolean" ? d.active : undefined,
    createdAt: typeof d.created === "number" ? new Date(d.created * 1000).toISOString() : undefined,
  };
}

export const stripeProducts: IProductProvider = {
  contract: "PRODUCT",

  async createProduct(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const id = `prod_mock_${Math.random().toString(36).slice(2, 12)}`;
      return ok({ id, name: req.name, description: req.description, active: true, createdAt: new Date().toISOString() }, "mock", 60);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const form = encodeForm({
        name: req.name,
        description: req.description,
        metadata: req.metadata ?? {},
      });
      const { body } = await http(
        `${BASE}/products`,
        { method: "POST", headers: authHeaders(secretKey), body: form },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string }).id ? (body as Record<string, unknown>) : null;
      if (!data) return fail("UPSTREAM_ERROR", "Stripe createProduct returned no data", { providerCode: CODE, raw: sanitize(body) });
      return ok(mapStripeProduct(data), String(data.id), 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe createProduct failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async listProducts(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ products: [], hasMore: false }, "mock", 30);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const params = new URLSearchParams();
      if (req?.perPage) params.set("limit", String(req.perPage));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const { body } = await http(
        `${BASE}/products${qs}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: Record<string, unknown>[]; has_more?: boolean }).data ?? [];
      const hasMore = (body as { has_more?: boolean }).has_more ?? false;
      return ok({ products: data.map(mapStripeProduct), hasMore }, "stripe-prod-list", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe listProducts failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 5. Prices — POST/GET /v1/prices
// ---------------------------------------------------------------------------

function mapStripePrice(d: Record<string, unknown>): import("../contracts").IPrice {
  const recurring = (d.recurring ?? undefined) as { interval?: string; interval_count?: number } | undefined;
  return {
    id: String(d.id ?? ""),
    currency: String(d.currency ?? "usd"),
    amountMinor: typeof d.unit_amount === "number" ? d.unit_amount : 0,
    recurring: recurring
      ? { interval: String(recurring.interval ?? "month"), intervalCount: recurring.interval_count }
      : undefined,
    product: String(d.product ?? ""),
    active: typeof d.active === "boolean" ? d.active : undefined,
  };
}

export const stripePrices: IPriceProvider = {
  contract: "PRICE",

  async createPrice(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const id = `price_mock_${Math.random().toString(36).slice(2, 12)}`;
      return ok(
        {
          id,
          currency: req.currency,
          amountMinor: req.amountMinor,
          recurring: req.recurring,
          product: req.product,
          active: true,
        },
        "mock",
        60,
      );
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const formObj: Record<string, unknown> = {
        currency: req.currency,
        unit_amount: req.amountMinor,
        product: req.product,
        nickname: req.nickname,
      };
      if (req.recurring) {
        formObj["recurring[interval]"] = req.recurring.interval;
        if (req.recurring.intervalCount) {
          formObj["recurring[interval_count]"] = req.recurring.intervalCount;
        }
      }
      const form = encodeForm(formObj);
      const { body } = await http(
        `${BASE}/prices`,
        { method: "POST", headers: authHeaders(secretKey), body: form },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string }).id ? (body as Record<string, unknown>) : null;
      if (!data) return fail("UPSTREAM_ERROR", "Stripe createPrice returned no data", { providerCode: CODE, raw: sanitize(body) });
      return ok(mapStripePrice(data), String(data.id), 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe createPrice failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async listPrices(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ prices: [], hasMore: false }, "mock", 30);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const params = new URLSearchParams();
      if (req?.perPage) params.set("limit", String(req.perPage));
      if (req?.product) params.set("product", req.product);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const { body } = await http(
        `${BASE}/prices${qs}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: Record<string, unknown>[]; has_more?: boolean }).data ?? [];
      const hasMore = (body as { has_more?: boolean }).has_more ?? false;
      return ok({ prices: data.map(mapStripePrice), hasMore }, "stripe-price-list", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe listPrices failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 6. Subscriptions — POST/GET/DELETE/POST /v1/subscriptions(/:id)
// ---------------------------------------------------------------------------

function mapStripeSubscription(d: Record<string, unknown>): import("../contracts").ISubscription {
  const items = Array.isArray(d.items)
    ? (d.items as Record<string, unknown>[])
    : (d.items as { data?: Record<string, unknown>[] })?.data;
  return {
    code: String(d.id ?? ""),
    customer: String(d.customer ?? ""),
    plan: String((d.items as { data?: { price?: { id?: string } }[] } | undefined)?.data?.[0]?.price?.id ?? ""),
    status: String(d.status ?? "incomplete"),
    startDate: typeof d.start_date === "number" ? new Date(d.start_date * 1000).toISOString() : typeof d.current_period_start === "number" ? new Date(d.current_period_start * 1000).toISOString() : undefined,
    items: Array.isArray(items)
      ? items.map((it) => ({
          price: String((it as { price?: { id?: string } | string })?.price && typeof (it as { price: { id?: string } }).price === "object"
            ? ((it as { price: { id?: string } }).price.id ?? "")
            : (it as { price?: string }).price ?? ""),
          quantity: typeof (it as { quantity?: number }).quantity === "number" ? (it as { quantity: number }).quantity : 1,
        }))
      : undefined,
  };
}

export const stripeSubscriptions: IRecurringBillingProvider = {
  contract: "RECURRING_BILLING",

  async createSubscription(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const id = `sub_mock_${Math.random().toString(36).slice(2, 12)}`;
      return ok(
        {
          code: id,
          customer: req.customer,
          plan: req.plan ?? "",
          status: "active",
          items: req.items ?? [],
          startDate: new Date().toISOString(),
        },
        "mock",
        70,
      );
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const formObj: Record<string, unknown> = {
        customer: req.customer,
      };
      if (req.items && req.items.length > 0) {
        req.items.forEach((it, i) => {
          formObj[`items[${i}][price]`] = it.price;
          if (it.quantity) formObj[`items[${i}][quantity]`] = it.quantity;
        });
      } else if (req.plan) {
        formObj["items[0][price]"] = req.plan;
        formObj["items[0][quantity]"] = 1;
      }
      if (req.start_date) formObj.start_date = req.start_date;
      if (req.metadata) formObj.metadata = req.metadata;
      const form = encodeForm(formObj);
      const { body } = await http(
        `${BASE}/subscriptions`,
        { method: "POST", headers: authHeaders(secretKey), body: form },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string }).id ? (body as Record<string, unknown>) : null;
      if (!data) return fail("UPSTREAM_ERROR", "Stripe createSubscription returned no data", { providerCode: CODE, raw: sanitize(body) });
      return ok(mapStripeSubscription(data), String(data.id), 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe createSubscription failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async listSubscriptions(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ subscriptions: [], total: 0 }, "mock", 30);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const params = new URLSearchParams();
      if (req?.perPage) params.set("limit", String(req.perPage));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const { body } = await http(
        `${BASE}/subscriptions${qs}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: Record<string, unknown>[]; has_more?: boolean }).data ?? [];
      return ok({ subscriptions: data.map(mapStripeSubscription), total: data.length }, "stripe-sub-list", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe listSubscriptions failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async fetchSubscription(id) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ code: id, customer: "cus_demo", plan: "price_demo", status: "active" }, "mock", 20);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/subscriptions/${encodeURIComponent(id)}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string }).id ? (body as Record<string, unknown>) : null;
      if (!data) return fail("UPSTREAM_ERROR", "Stripe fetchSubscription returned no data", { providerCode: CODE, raw: sanitize(body) });
      return ok(mapStripeSubscription(data), id, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe fetchSubscription failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async cancelSubscription(id) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "canceled" }, "mock", 30);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/subscriptions/${encodeURIComponent(id)}`,
        { method: "DELETE", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { status?: string }).status ?? "canceled";
      return ok({ status: data }, id, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe cancelSubscription failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async updateSubscription(id, req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ code: id, customer: "cus_demo", plan: "price_demo", status: "active" }, "mock", 30);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const form = encodeForm(req);
      const { body } = await http(
        `${BASE}/subscriptions/${encodeURIComponent(id)}`,
        { method: "POST", headers: authHeaders(secretKey), body: form },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string }).id ? (body as Record<string, unknown>) : null;
      if (!data) return fail("UPSTREAM_ERROR", "Stripe updateSubscription returned no data", { providerCode: CODE, raw: sanitize(body) });
      return ok(mapStripeSubscription(data), id, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe updateSubscription failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 7. Payouts — POST/GET /v1/payouts, POST /v1/payouts/:id/cancel
// ---------------------------------------------------------------------------

function mapStripePayout(d: Record<string, unknown>): import("../contracts").IPayout {
  return {
    id: String(d.id ?? ""),
    amountMinor: typeof d.amount === "number" ? d.amount : 0,
    currency: String(d.currency ?? "usd"),
    status: String(d.status ?? "pending"),
    destination: typeof d.destination === "string" ? d.destination : undefined,
    method: typeof d.method === "string" ? d.method : undefined,
    arrivalDate: typeof d.arrival_date === "number" ? new Date(d.arrival_date * 1000).toISOString() : undefined,
  };
}

export const stripePayouts: IPayoutProvider = {
  contract: "PAYOUT",

  async createPayout(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const id = `po_mock_${Math.random().toString(36).slice(2, 12)}`;
      return ok(
        {
          id,
          amountMinor: req.amountMinor,
          currency: req.currency,
          status: "pending",
          destination: req.destination,
          method: req.method ?? "STANDARD",
        },
        "mock",
        80,
      );
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const formObj: Record<string, unknown> = {
        amount: req.amountMinor,
        currency: req.currency,
      };
      if (req.destination) formObj.destination = req.destination;
      if (req.method) formObj.method = String(req.method).toLowerCase();
      if (req.metadata) formObj.metadata = req.metadata;
      const form = encodeForm(formObj);
      const { body } = await http(
        `${BASE}/payouts`,
        { method: "POST", headers: authHeaders(secretKey), body: form },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string }).id ? (body as Record<string, unknown>) : null;
      if (!data) return fail("UPSTREAM_ERROR", "Stripe createPayout returned no data", { providerCode: CODE, raw: sanitize(body) });
      return ok(mapStripePayout(data), String(data.id), 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe createPayout failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async listPayouts(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ payouts: [], total: 0, hasMore: false }, "mock", 30);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const params = new URLSearchParams();
      if (req?.perPage) params.set("limit", String(req.perPage));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const { body } = await http(
        `${BASE}/payouts${qs}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: Record<string, unknown>[]; has_more?: boolean }).data ?? [];
      const hasMore = (body as { has_more?: boolean }).has_more ?? false;
      return ok({ payouts: data.map(mapStripePayout), hasMore }, "stripe-payout-list", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe listPayouts failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async cancelPayout(id) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "canceled" }, "mock", 25);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/payouts/${encodeURIComponent(id)}/cancel`,
        { method: "POST", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { status?: string }).status ?? "canceled";
      return ok({ status: data }, id, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe cancelPayout failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 8. Refunds — POST/GET /v1/refunds(/:id) (extends single-refund on stripeCardPayment)
// ---------------------------------------------------------------------------

function mapStripeRefund(d: Record<string, unknown>): import("../contracts").IRefundRecord {
  return {
    id: String(d.id ?? ""),
    reference: typeof d.payment_intent === "string" ? d.payment_intent : undefined,
    amountMinor: typeof d.amount === "number" ? d.amount : undefined,
    currency: typeof d.currency === "string" ? d.currency : undefined,
    status: String(d.status ?? "pending"),
    reason: typeof d.reason === "string" ? d.reason : undefined,
    createdAt: typeof d.created === "number" ? new Date(d.created * 1000).toISOString() : undefined,
  };
}

export const stripeRefunds: IRefundProvider = {
  contract: "REFUND",

  async listRefunds(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ refunds: [], total: 0 }, "mock", 30);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const params = new URLSearchParams();
      if (req?.perPage) params.set("limit", String(req.perPage));
      if (req?.paymentIntent) params.set("payment_intent", req.paymentIntent);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const { body } = await http(
        `${BASE}/refunds${qs}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: Record<string, unknown>[]; has_more?: boolean }).data ?? [];
      return ok({ refunds: data.map(mapStripeRefund), total: data.length }, "stripe-refund-list", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe listRefunds failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async fetchRefund(id) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ id, status: "pending" }, "mock", 20);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/refunds/${encodeURIComponent(id)}`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string }).id ? (body as Record<string, unknown>) : null;
      if (!data) return fail("UPSTREAM_ERROR", "Stripe fetchRefund returned no data", { providerCode: CODE, raw: sanitize(body) });
      return ok(mapStripeRefund(data), id, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe fetchRefund failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async createRefund(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const id = `re_mock_${Math.random().toString(36).slice(2, 12)}`;
      return ok({ id, reference: req.paymentIntent, amountMinor: req.amountMinor, status: "pending", reason: req.reason, createdAt: new Date().toISOString() }, "mock", 60);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const formObj: Record<string, unknown> = {
        payment_intent: req.paymentIntent,
        amount: req.amountMinor,
        reason: req.reason,
        metadata: req.metadata ?? {},
      };
      const form = encodeForm(formObj);
      const { body } = await http(
        `${BASE}/refunds`,
        { method: "POST", headers: authHeaders(secretKey), body: form },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string }).id ? (body as Record<string, unknown>) : null;
      if (!data) return fail("UPSTREAM_ERROR", "Stripe createRefund returned no data", { providerCode: CODE, raw: sanitize(body) });
      return ok(mapStripeRefund(data), String(data.id), 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe createRefund failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 9. Webhook endpoints — POST/GET /v1/webhook_endpoints
// ---------------------------------------------------------------------------

function mapStripeWebhook(d: Record<string, unknown>): import("../contracts").IWebhookEndpoint {
  return {
    id: String(d.id ?? ""),
    url: String(d.url ?? ""),
    enabledEvents: Array.isArray(d.enabled_events) ? (d.enabled_events as string[]) : [],
    status: typeof d.status === "string" ? d.status : undefined,
    secret: typeof d.secret === "string" ? d.secret : undefined,
  };
}

export const stripeWebhookEndpoints: IWebhookEndpointProvider = {
  contract: "WEBHOOK_ENDPOINT",

  async createWebhookEndpoint(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const id = `we_mock_${Math.random().toString(36).slice(2, 12)}`;
      return ok({ id, url: req.url, enabledEvents: req.events, status: "enabled" }, "mock", 70);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const formObj: Record<string, unknown> = {
        url: req.url,
        description: req.description,
      };
      if (req.events.length > 0) {
        req.events.forEach((ev, i) => {
          formObj[`enabled_events[${i}]`] = ev;
        });
      }
      const form = encodeForm(formObj);
      const { body } = await http(
        `${BASE}/webhook_endpoints`,
        { method: "POST", headers: authHeaders(secretKey), body: form },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { id?: string }).id ? (body as Record<string, unknown>) : null;
      if (!data) return fail("UPSTREAM_ERROR", "Stripe createWebhookEndpoint returned no data", { providerCode: CODE, raw: sanitize(body) });
      return ok(mapStripeWebhook(data), String(data.id), 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe createWebhookEndpoint failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async listWebhookEndpoints() {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ endpoints: [], hasMore: false }, "mock", 30);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Stripe secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/webhook_endpoints?limit=100`,
        { method: "GET", headers: authHeaders(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: Record<string, unknown>[]; has_more?: boolean }).data ?? [];
      const hasMore = (body as { has_more?: boolean }).has_more ?? false;
      return ok({ endpoints: data.map(mapStripeWebhook), hasMore }, "stripe-webhook-list", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stripe listWebhookEndpoints failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};
