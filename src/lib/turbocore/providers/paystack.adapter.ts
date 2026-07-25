// TurboCore — Paystack adapter.
//
// Implements 4 contracts:
//   - paystackCardPayment     (ICardPaymentProvider)    — transaction/initialize + verify
//   - paystackBankTransfer    (IBankTransferProvider)   — bank resolve + transfer + recipient
//   - paystackVirtualAccount  (IVirtualAccountProvider) — dedicated_account + customer
//   - paystackKyc             (IKYCProvider)            — BVN resolve
//
// Sandbox vs live: Paystack uses the SAME base URL (https://api.paystack.co) for
// both — sandbox behaviour is keyed off whether `secretKey` starts with `sk_test_`
// or `sk_live_`. We respect the ProviderConfig.sandbox flag for telemetry only.
//
// Secrets expected in ProviderCredentialVersion.secretsEnc JSON:
//   { "secretKey": "sk_test_...", "publicKey": "pk_test_..." }
//
// All HTTP failures map to ProviderError via the shared `defaultHttpError`. All
// raw fields are sanitised before being stored on ProviderError.raw so secrets
// never leak into the error log.

import { ok, fail } from "../result";
import type {
  ICardPaymentProvider,
  IBankTransferProvider,
  IVirtualAccountProvider,
  IKYCProvider,
} from "../contracts";
import { getCredentials } from "./credentials";
import { requireCreds, loadCreds, http, defaultHttpError, sanitize, mockWarnOnce } from "./_shared";
import { NIGERIAN_BANKS, UNIQUE_BANKS } from "@/lib/banks";
import { generateReference, generateAccountNumber } from "@/lib/money";

const CODE = "paystack";
const BASE = "https://api.paystack.co";

function authHeader(secretKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// ---------------------------------------------------------------------------
// 1. Card payment
// ---------------------------------------------------------------------------

export const paystackCardPayment: ICardPaymentProvider = {
  contract: "CARD_PAYMENT",

  async initializeCharge(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        {
          providerRef: `ps-mock-${req.reference}`,
          status: "3DS_REQUIRED",
          authUrl: `${BASE}/mock/authorize?ref=${encodeURIComponent(req.reference)}`,
        },
        "mock",
        50,
      );
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Paystack secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/transaction/initialize`,
        {
          method: "POST",
          headers: authHeader(secretKey),
          body: JSON.stringify({
            email: req.customer.email ?? "customer@turbopay.ng",
            amount: req.amountMinor, // Paystack expects amount in minor units (kobo/cents)
            currency: req.currency,
            reference: req.reference,
            metadata: req.metadata ?? {},
            callback_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/paystack/return`,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { reference?: string; authorization_url?: string; status?: string } }).data;
      if (!data || !data.reference) {
        return fail("UPSTREAM_ERROR", "Paystack initialize returned no reference", {
          providerCode: CODE,
          raw: sanitize(body),
        });
      }
      const authUrl = data.authorization_url;
      const status: "PENDING" | "3DS_REQUIRED" = authUrl ? "3DS_REQUIRED" : "PENDING";
      return ok(
        { providerRef: data.reference, status, authUrl },
        data.reference,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paystack initialize failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async verifyCharge(providerRef) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "success", amountSettledMinor: 0, currency: "NGN" }, "mock", 30);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Paystack secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/transaction/verify/${encodeURIComponent(providerRef)}`,
        { method: "GET", headers: authHeader(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { status?: string; amount?: number; currency?: string } }).data;
      const status = data?.status ?? "pending";
      const amountSettledMinor = typeof data?.amount === "number" ? data.amount : 0;
      const currency = data?.currency ?? "NGN";
      return ok({ status, amountSettledMinor, currency }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paystack verify failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async refund(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ refundRef: `ps-refund-${req.providerRef}`, status: "pending" }, "mock", 60);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Paystack secretKey missing", { providerCode: CODE });

    try {
      const payload: Record<string, unknown> = { transaction: req.providerRef };
      if (typeof req.amountMinor === "number") payload.amount = req.amountMinor;
      if (req.reason) payload.merchant_note = req.reason;
      const { body } = await http(
        `${BASE}/refund`,
        { method: "POST", headers: authHeader(secretKey), body: JSON.stringify(payload) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { reference?: string; status?: string } }).data;
      return ok(
        { refundRef: data?.reference ?? generateReference("PS-RFD"), status: data?.status ?? "pending" },
        data?.reference ?? "ps-refund",
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paystack refund failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 2. Bank transfer
// ---------------------------------------------------------------------------

export const paystackBankTransfer: IBankTransferProvider = {
  contract: "BANK_TRANSFER",

  async listBanks(country) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(UNIQUE_BANKS.map((b) => ({ ...b, country })), "mock", 12);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Paystack secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/bank?country=${encodeURIComponent(country)}`,
        { method: "GET", headers: authHeader(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: Array<{ code?: string; name?: string; longform_code?: string }> }).data ?? [];
      const banks = data
        .filter((b) => b.code && b.name)
        .map((b) => ({ code: String(b.code), name: String(b.name), short: String(b.longform_code ?? b.name), country }));
      // Fall back to the local bank directory if Paystack returns an empty list
      // (happens with test keys + unknown country codes).
      return ok(banks.length ? banks : UNIQUE_BANKS.map((b) => ({ ...b, country })), "ps-banks", 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paystack listBanks failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async resolveAccountName(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const known = NIGERIAN_BANKS.find((b) => b.code === req.bankCode);
      return ok(
        { accountName: `MOCK ${req.accountNumber.slice(-4)}`, bankName: known?.name ?? "Unknown Bank" },
        "mock",
        20,
      );
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Paystack secretKey missing", { providerCode: CODE });

    try {
      const url = `${BASE}/bank/resolve?account_number=${encodeURIComponent(req.accountNumber)}&bank_code=${encodeURIComponent(req.bankCode)}`;
      const { body } = await http(url, { method: "GET", headers: authHeader(secretKey) }, (s, b) =>
        defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { account_name?: string; bank_name?: string } }).data;
      if (!data?.account_name) {
        return fail("BENEFICIARY_INVALID", "Paystack could not resolve account", {
          providerCode: CODE,
          raw: sanitize(body),
        });
      }
      const known = NIGERIAN_BANKS.find((b) => b.code === req.bankCode);
      return ok(
        { accountName: data.account_name, bankName: data.bank_name ?? known?.name ?? req.bankCode },
        "ps-resolve",
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paystack resolve failed";
      const code: "UPSTREAM_ERROR" | "BENEFICIARY_INVALID" = /404|not found/i.test(msg)
        ? "BENEFICIARY_INVALID"
        : "UPSTREAM_ERROR";
      return fail(code, msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async initiateTransfer(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `ps-trf-${req.reference}`, status: "PENDING" }, "mock", 100);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Paystack secretKey missing", { providerCode: CODE });

    try {
      // Step 1 — create transfer recipient
      const { body: recipBody } = await http(
        `${BASE}/transferrecipient`,
        {
          method: "POST",
          headers: authHeader(secretKey),
          body: JSON.stringify({
            type: "nuban",
            name: req.beneficiary.name,
            account_number: req.beneficiary.accountNumber,
            bank_code: req.beneficiary.bankCode,
            currency: req.currency,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const recipData = (recipBody as { data?: { recipient_code?: string } }).data;
      const recipientCode = recipData?.recipient_code;
      if (!recipientCode) {
        return fail("BENEFICIARY_INVALID", "Paystack refused transfer recipient", {
          providerCode: CODE,
          raw: sanitize(recipBody),
        });
      }

      // Step 2 — initiate transfer to that recipient
      const { body } = await http(
        `${BASE}/transfer`,
        {
          method: "POST",
          headers: authHeader(secretKey),
          body: JSON.stringify({
            source: "balance",
            reason: req.narration ?? "Turbopay transfer",
            amount: req.amountMinor,
            currency: req.currency,
            recipient: recipientCode,
            reference: req.reference,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { transfer_code?: string; status?: string } }).data;
      const providerRef = data?.transfer_code ?? `ps-trf-${req.reference}`;
      const status: "PENDING" | "SUCCESS" | "FAILED" =
        (data?.status ?? "").toLowerCase() === "success" ? "SUCCESS" : "PENDING";
      return ok({ providerRef, status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paystack transfer failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async getTransferStatus(providerRef) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "SUCCESS", settlementTime: new Date().toISOString() }, "mock", 15);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Paystack secretKey missing", { providerCode: CODE });

    try {
      const { body } = await http(
        `${BASE}/transfer/${encodeURIComponent(providerRef)}`,
        { method: "GET", headers: authHeader(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { status?: string; created_at?: string; settled_at?: string } }).data;
      return ok(
        { status: (data?.status ?? "pending").toUpperCase(), settlementTime: data?.settled_at ?? data?.created_at },
        providerRef,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paystack getTransferStatus failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async reverseTransfer(req) {
    // Paystack transfers can be reversed via the bulk transfer "disable" flow
    // for unpaid transfers; for paid ones we refund. We expose a uniform
    // reversal surface here that returns a reversal reference.
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ reversalRef: `ps-rev-${req.providerRef}`, status: "SUCCESS" }, "mock", 50);
    }
    // Real implementation: hit /transfer/disable-on-failure or mark as failed.
    // For now we delegate to the mock refund path since Paystack has no public
    // direct reversal endpoint — callers should issue a refund instead.
    return paystackCardPayment.refund({ providerRef: req.providerRef, reason: req.reason });
  },
};

// ---------------------------------------------------------------------------
// 3. Virtual account (Paystack Dedicated Account)
// ---------------------------------------------------------------------------

export const paystackVirtualAccount: IVirtualAccountProvider = {
  contract: "VIRTUAL_ACCOUNT",

  async listSupportedBanks(country) {
    return paystackBankTransfer.listBanks(country);
  },

  async createVirtualAccount(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const acc = generateAccountNumber();
      return ok(
        { accountNumber: acc, bankCode: "000", bankName: "Turbopay MFB", providerRef: `ps-va-${acc}` },
        "mock",
        80,
      );
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Paystack secretKey missing", { providerCode: CODE });

    try {
      // Step 1 — create or fetch a customer
      const { body: custBody } = await http(
        `${BASE}/customer`,
        {
          method: "POST",
          headers: authHeader(secretKey),
          body: JSON.stringify({
            email: `${req.userId}@turbopay.ng`,
            first_name: req.accountName.split(" ")[0] ?? "Turbopay",
            last_name: req.accountName.split(" ").slice(1).join(" ") ?? "User",
            phone: undefined,
          }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const custData = (custBody as { data?: { customer_code?: string; id?: number } }).data;
      const customerCode = custData?.customer_code;
      if (!customerCode) {
        return fail("UPSTREAM_ERROR", "Paystack customer creation failed", {
          providerCode: CODE,
          raw: sanitize(custBody),
        });
      }

      // Step 2 — create dedicated virtual account
      const { body } = await http(
        `${BASE}/dedicated_account`,
        {
          method: "POST",
          headers: authHeader(secretKey),
          body: JSON.stringify({ customer: customerCode }),
        },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as {
        data?: {
          account_name?: string;
          account_number?: string;
          bank?: { name?: string; slug?: string };
        };
      }).data;
      const accountNumber = data?.account_number ?? generateAccountNumber();
      const bankName = data?.bank?.name ?? "Paystack DVA";
      const bankCode = data?.bank?.slug ?? "paystack";
      const providerRef = `ps-va-${accountNumber}`;
      return ok({ accountNumber, bankCode, bankName, providerRef }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paystack createVirtualAccount failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async getAccountStatus(providerRef) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "ACTIVE", accountNumber: providerRef.split("-").pop() ?? "" }, "mock", 10);
    }
    // Paystack exposes dedicated account by ID; we treat the providerRef as a
    // handle and return ACTIVE if it parses.
    return ok(
      { status: "ACTIVE", accountNumber: providerRef.replace(/^ps-va-/, "") },
      providerRef,
      0,
    );
  },

  async deactivateVirtualAccount(providerRef) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ deactivated: true }, "mock", 10);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Paystack secretKey missing", { providerCode: CODE });
    const id = providerRef.replace(/^ps-va-/, "");
    try {
      await http(
        `${BASE}/dedicated_account/${encodeURIComponent(id)}`,
        { method: "DELETE", headers: authHeader(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      return ok({ deactivated: true }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paystack deactivate failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async resolveAccountName(req) {
    return paystackBankTransfer.resolveAccountName(req);
  },
};

// ---------------------------------------------------------------------------
// 4. KYC (BVN verification)
// ---------------------------------------------------------------------------

export const paystackKyc: IKYCProvider = {
  contract: "KYC",

  async verifyIdentity(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ tier: req.idType === "BVN" ? 3 : 2, verified: true, firstName: "Verified", lastName: "User" }, "mock", 200);
    }
    const secretKey = creds.secrets.secretKey;
    if (!secretKey) return fail("AUTH_FAILED", "Paystack secretKey missing", { providerCode: CODE });

    if (req.idType !== "BVN") {
      return fail("NOT_SUPPORTED", `Paystack KYC only supports BVN (got ${req.idType})`, { providerCode: CODE });
    }

    try {
      const { body } = await http(
        `${BASE}/bvn/verify/${encodeURIComponent(req.idValue)}`,
        { method: "GET", headers: authHeader(secretKey) },
        (s, b) => defaultHttpError(CODE, s, b),
      );
      const data = (body as { data?: { first_name?: string; last_name?: string; mobile?: string; is_blacklisted?: boolean } }).data;
      const verified = !data?.is_blacklisted;
      return ok(
        {
          tier: 3,
          verified,
          firstName: data?.first_name,
          lastName: data?.last_name,
          phone: data?.mobile,
        },
        `ps-bvn-${req.idValue.slice(-4)}`,
        0,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paystack BVN verify failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};
