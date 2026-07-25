// TurboCore — Stripe adapter.
//
// Implements 2 contracts:
//   - stripeCardPayment (ICardPaymentProvider)    — Payment Intents
//   - stripeIssuing     (IVirtualCardIssuer)      — Issuing Cards
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
import type { ICardPaymentProvider, IVirtualCardIssuer } from "../contracts";
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
