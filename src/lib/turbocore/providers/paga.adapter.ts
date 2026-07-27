// TurboCore — Paga adapter.
//
// Paga is a Nigerian mobile payment platform offering:
//   - Mobile money transfers (wallet-to-wallet, bank account)
//   - Airtime & data top-up
//   - Bill payments (electricity, cable TV, water, etc.)
//   - Merchant collections
//
// Implements 7 contracts:
//   - pagaMobileMoney         (IMobileMoneyProvider)   — wallet collections + disbursements
//   - pagaBillPayment         (IBillPaymentProvider)    — billers + meter validation + payment
//   - pagaBankTransfer        (IBankTransferProvider)    — transfer to Nigerian bank accounts
//   - pagaAirtime             (IAirtimeProvider)         — airtime purchase
//   - pagaMerchantPayment     (standalone)               — pay a Paga merchant
//   - pagaAccountBalance      (standalone)               — improved account balance with accountNumber
//   - pagaTransactionStatus   (standalone)               — improved transaction status with reference
//
// Base URLs:
//   live:    https://www.mypaga.com/pagawebservices/rest/paga/servlets/transaction
//   staging: https://qa1.mypaga.com/pagawebservices/rest/paga/servlets/transaction
//
// Auth: HMAC-SHA512 signature over the request body + API key in header.
// Paga's API uses a "merchant key" + "merchant public key" + HMAC signing.
//
// Secrets expected:
//   { "apiKey": "...", "publicKey": "...", "secretKey": "...",
//     "callbackUrl": "https://yourapp/api/webhooks/turbocore/paga" }

import { ok, fail } from "../result";
import type {
  IMobileMoneyProvider,
  IBillPaymentProvider,
  IBankTransferProvider,
  IAirtimeProvider,
  ProviderResult,
} from "../contracts";
import { requireCreds, loadCreds, http, defaultHttpError, sanitize, mockWarnOnce } from "./_shared";
import { createHmac } from "crypto";
import { UNIQUE_BANKS, NIGERIAN_BANKS, DATA_PLANS } from "@/lib/banks";
import { NETWORKS } from "@/lib/constants";

const CODE = "paga";
const LIVE_BASE = "https://www.mypaga.com/pagawebservices/rest/paga/servlets/transaction";
const STAGING_BASE = "https://qa1.mypaga.com/pagawebservices/rest/paga/servlets/transaction";

function signPayload(body: string, secretKey: string): string {
  return createHmac("sha512", secretKey).update(body).digest("hex");
}

function authHeaders(
  creds: { secrets: Record<string, string> },
  body: string
): Record<string, string> {
  const signature = signPayload(body, creds.secrets.secretKey);
  return {
    "Content-Type": "application/json",
    apiKey: creds.secrets.apiKey,
    "X-Paga-Auth": signature,
  };
}

export const pagaMobileMoney: IMobileMoneyProvider = {
  contract: "MOBILE_MONEY",

  async getBalance(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ balanceMinor: 0, currency: "NGN" }, "mock", 50);
    }
    const base = creds.sandbox ? STAGING_BASE : LIVE_BASE;
    try {
      const body = JSON.stringify({ accountNumber: req.phone });
      const { body: resp } = await http(
        `${base}/accountbalance`,
        { method: "POST", headers: authHeaders(creds, body), body },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = resp as { balance?: string; currency?: string };
      const bal = Number(data?.balance ?? 0) * 100;
      return ok(
        { balanceMinor: Math.round(bal), currency: data?.currency ?? "NGN" },
        `paga-bal-${Date.now()}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paga getBalance failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async collect(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `paga-deposit-${req.reference}`, status: "PENDING" }, "mock", 200);
    }
    const base = creds.sandbox ? STAGING_BASE : LIVE_BASE;
    const callbackUrl =
      creds.secrets.callbackUrl ??
      `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/turbocore/paga`;
    try {
      const body = JSON.stringify({
        reference: req.reference,
        amount: Number((req.amountMinor / 100).toFixed(2)),
        currency: req.currency,
        customerPhoneNumber: req.phone,
        customerEmail: "",
        callbackUrl,
      });
      const { body: resp } = await http(
        `${base}/deposit`,
        { method: "POST", headers: authHeaders(creds, body), body },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = resp as {
        transactionReference?: string;
        statusCode?: string;
        status?: string;
        message?: string;
      };
      const providerRef = data?.transactionReference ?? `paga-${req.reference}`;
      const st = String(data?.status ?? data?.statusCode ?? "PENDING").toUpperCase();
      const status =
        st === "SUCCESS" || st === "SUCCESSFUL"
          ? "SUCCESS"
          : st === "FAILED"
            ? "FAILED"
            : "PENDING";
      return ok({ providerRef, status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paga collect failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async disburse(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `paga-transfer-${req.reference}`, status: "PENDING" }, "mock", 200);
    }
    const base = creds.sandbox ? STAGING_BASE : LIVE_BASE;
    const callbackUrl =
      creds.secrets.callbackUrl ??
      `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/turbocore/paga`;
    try {
      const body = JSON.stringify({
        reference: req.reference,
        amount: Number((req.amountMinor / 100).toFixed(2)),
        currency: req.currency,
        recipientPhoneNumber: req.phone,
        callbackUrl,
      });
      const { body: resp } = await http(
        `${base}/transfer`,
        { method: "POST", headers: authHeaders(creds, body), body },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = resp as { transactionReference?: string; status?: string; statusCode?: string };
      const providerRef = data?.transactionReference ?? `paga-transfer-${req.reference}`;
      const st = String(data?.status ?? data?.statusCode ?? "PENDING").toUpperCase();
      const status =
        st === "SUCCESS" || st === "SUCCESSFUL"
          ? "SUCCESS"
          : st === "FAILED"
            ? "FAILED"
            : "PENDING";
      return ok({ providerRef, status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paga disburse failed";
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
    const base = creds.sandbox ? STAGING_BASE : LIVE_BASE;
    try {
      const body = JSON.stringify({ transactionReference: providerRef });
      const { body: resp } = await http(
        `${base}/transactionstatus`,
        { method: "POST", headers: authHeaders(creds, body), body },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = resp as { status?: string; statusCode?: string };
      const st = String(data?.status ?? data?.statusCode ?? "PENDING").toUpperCase();
      const status =
        st === "SUCCESS" || st === "SUCCESSFUL"
          ? "SUCCESS"
          : st === "FAILED"
            ? "FAILED"
            : "PENDING";
      return ok({ status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paga status query failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

export const pagaBillPayment: IBillPaymentProvider = {
  contract: "BILL_PAYMENT",

  async listBillers(req) {
    // Paga has a billers catalog endpoint — fall back to the local BILLERS directory
    // to keep the UI functional even without a live API call.
    const blocked = await requireCreds(CODE);
    if (blocked) {
      // Fall back to local directory
      const { BILLERS } = await import("@/lib/banks");
      const billers = req.category ? (BILLERS[req.category] ?? []) : Object.values(BILLERS).flat();
      return ok(
        billers.map((b) => ({ ...b, category: req.category ?? "OTHERS", country: req.country })),
        "local-fallback",
        5
      );
    }
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const { BILLERS } = await import("@/lib/banks");
      const billers = req.category ? (BILLERS[req.category] ?? []) : Object.values(BILLERS).flat();
      return ok(
        billers.map((b) => ({ ...b, category: req.category ?? "OTHERS", country: req.country })),
        "mock",
        10
      );
    }
    const base = creds.sandbox ? STAGING_BASE : LIVE_BASE;
    try {
      const body = JSON.stringify({ category: req.category ?? "ALL" });
      const { body: resp } = await http(
        `${base}/billers`,
        { method: "POST", headers: authHeaders(creds, body), body },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = resp as { billers?: any[] };
      if (data?.billers && data.billers.length > 0) {
        return ok(
          data.billers.map((b: any) => ({
            code: b.code ?? b.billerCode,
            name: b.name ?? b.billerName,
            category: b.category ?? req.category ?? "OTHERS",
            country: req.country,
            refLabel: b.refLabel ?? "Customer Reference",
            refType: b.refType ?? "account",
          })),
          "paga",
          100
        );
      }
      // Fall back to local directory
      const { BILLERS } = await import("@/lib/banks");
      const billers = req.category ? (BILLERS[req.category] ?? []) : Object.values(BILLERS).flat();
      return ok(
        billers.map((b) => ({ ...b, category: req.category ?? "OTHERS", country: req.country })),
        "local-fallback",
        10
      );
    } catch {
      // Fall back to local directory on error
      const { BILLERS } = await import("@/lib/banks");
      const billers = req.category ? (BILLERS[req.category] ?? []) : Object.values(BILLERS).flat();
      return ok(
        billers.map((b) => ({ ...b, category: req.category ?? "OTHERS", country: req.country })),
        "local-fallback",
        10
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
    const base = creds.sandbox ? STAGING_BASE : LIVE_BASE;
    try {
      const body = JSON.stringify({ billerCode: req.billerCode, customerRef: req.customerRef });
      const { body: resp } = await http(
        `${base}/validatecustomer`,
        { method: "POST", headers: authHeaders(creds, body), body },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = resp as { customerName?: string; valid?: boolean };
      return ok(
        { customerName: data?.customerName ?? "VALIDATED", valid: data?.valid ?? true },
        "paga",
        50
      );
    } catch {
      return ok({ customerName: `CUSTOMER ${req.customerRef.slice(-4)}`, valid: true }, "mock", 40);
    }
  },

  async payBill(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const token =
        req.billerCode.startsWith("E") || /^elec/i.test(req.billerCode)
          ? Array.from({ length: 20 }, () => Math.floor(Math.random() * 10)).join("")
          : undefined;
      return ok(
        { providerRef: `paga-bill-${req.reference}`, status: "SUCCESS", token },
        "mock",
        150
      );
    }
    const base = creds.sandbox ? STAGING_BASE : LIVE_BASE;
    const callbackUrl =
      creds.secrets.callbackUrl ??
      `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/turbocore/paga`;
    try {
      const body = JSON.stringify({
        reference: req.reference,
        billerCode: req.billerCode,
        customerRef: req.customerRef,
        amount: Number((req.amountMinor / 100).toFixed(2)),
        currency: req.currency,
        productCode: req.productCode ?? "",
        callbackUrl,
      });
      const { body: resp } = await http(
        `${base}/paybill`,
        { method: "POST", headers: authHeaders(creds, body), body },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = resp as {
        transactionReference?: string;
        status?: string;
        statusCode?: string;
        token?: string;
      };
      const providerRef = data?.transactionReference ?? `paga-bill-${req.reference}`;
      const st = String(data?.status ?? data?.statusCode ?? "SUCCESS").toUpperCase();
      const status =
        st === "SUCCESS" || st === "SUCCESSFUL"
          ? "SUCCESS"
          : st === "FAILED"
            ? "FAILED"
            : "PENDING";
      return ok({ providerRef, status, token: data?.token }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paga payBill failed";
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
    const base = creds.sandbox ? STAGING_BASE : LIVE_BASE;
    try {
      const body = JSON.stringify({ transactionReference: providerRef });
      const { body: resp } = await http(
        `${base}/transactionstatus`,
        { method: "POST", headers: authHeaders(creds, body), body },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = resp as { status?: string; statusCode?: string; token?: string };
      const st = String(data?.status ?? data?.statusCode ?? "PENDING").toUpperCase();
      const status =
        st === "SUCCESS" || st === "SUCCESSFUL"
          ? "SUCCESS"
          : st === "FAILED"
            ? "FAILED"
            : "PENDING";
      return ok({ status, token: data?.token }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paga queryBillPayment failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 3. Bank transfer (full IBankTransferProvider — bank account recipient)
//    POST /transfer with bank account params
// ---------------------------------------------------------------------------

export const pagaBankTransfer: IBankTransferProvider = {
  contract: "BANK_TRANSFER",

  async listBanks(country) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok(
        UNIQUE_BANKS.map((b) => ({ ...b, country })),
        "mock",
        15
      );
    }
    // Paga does not expose a banks list endpoint; reuse the local NG bank
    // directory and tag the result so the UI knows it isn't a live fetch.
    return ok(
      NIGERIAN_BANKS.map((b) => ({ ...b, country })),
      "paga-local-banks",
      0
    );
  },

  async resolveAccountName(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      const known = NIGERIAN_BANKS.find((b) => b.code === req.bankCode);
      return ok(
        { accountName: `MOCK ${req.accountNumber.slice(-4)}`, bankName: known?.name ?? "Unknown" },
        "mock",
        25
      );
    }
    const base = creds.sandbox ? STAGING_BASE : LIVE_BASE;
    try {
      const body = JSON.stringify({
        accountNumber: req.accountNumber,
        bankCode: req.bankCode,
      });
      const { body: resp } = await http(
        `${base}/resolveaccount`,
        { method: "POST", headers: authHeaders(creds, body), body },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = resp as {
        accountName?: string;
        account_name?: string;
        name?: string;
        bankName?: string;
      };
      const accountName = data?.accountName ?? data?.account_name ?? data?.name ?? "";
      if (!accountName) {
        return fail("BENEFICIARY_INVALID", "Paga could not resolve account name", {
          providerCode: CODE,
          raw: sanitize(resp),
        });
      }
      const known = NIGERIAN_BANKS.find((b) => b.code === req.bankCode);
      return ok(
        { accountName, bankName: data?.bankName ?? known?.name ?? req.bankCode },
        "paga-resolve",
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paga resolveAccountName failed";
      const code: "UPSTREAM_ERROR" | "BENEFICIARY_INVALID" = /404|not found|invalid/i.test(msg)
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
      return ok({ providerRef: `paga-btrf-${req.reference}`, status: "PENDING" }, "mock", 200);
    }
    const base = creds.sandbox ? STAGING_BASE : LIVE_BASE;
    const callbackUrl =
      creds.secrets.callbackUrl ??
      `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/turbocore/paga`;
    try {
      const body = JSON.stringify({
        reference: req.reference,
        amount: Number((req.amountMinor / 100).toFixed(2)),
        currency: req.currency,
        recipientBankAccount: req.beneficiary.accountNumber,
        recipientBankCode: req.beneficiary.bankCode,
        recipientName: req.beneficiary.name,
        narration: req.narration ?? "TurboPay bank transfer",
        callbackUrl,
      });
      const { body: resp } = await http(
        `${base}/transfer`,
        { method: "POST", headers: authHeaders(creds, body), body },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = resp as { transactionReference?: string; status?: string; statusCode?: string };
      const providerRef = data?.transactionReference ?? `paga-btrf-${req.reference}`;
      const st = String(data?.status ?? data?.statusCode ?? "PENDING").toUpperCase();
      const status: "PENDING" | "SUCCESS" | "FAILED" =
        st === "SUCCESS" || st === "SUCCESSFUL"
          ? "SUCCESS"
          : st === "FAILED"
            ? "FAILED"
            : "PENDING";
      return ok({ providerRef, status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paga initiateTransfer failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async getTransferStatus(providerRef) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "SUCCESS", settlementTime: new Date().toISOString() }, "mock", 25);
    }
    const base = creds.sandbox ? STAGING_BASE : LIVE_BASE;
    try {
      const body = JSON.stringify({ transactionReference: providerRef });
      const { body: resp } = await http(
        `${base}/transactionstatus`,
        { method: "POST", headers: authHeaders(creds, body), body },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = resp as {
        status?: string;
        statusCode?: string;
        settlementTime?: string;
        completedAt?: string;
      };
      const st = String(data?.status ?? data?.statusCode ?? "PENDING").toUpperCase();
      const status =
        st === "SUCCESS" || st === "SUCCESSFUL"
          ? "SUCCESS"
          : st === "FAILED"
            ? "FAILED"
            : "PENDING";
      return ok(
        { status, settlementTime: data?.settlementTime ?? data?.completedAt },
        providerRef,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paga getTransferStatus failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },

  async reverseTransfer(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ reversalRef: `paga-rev-${req.providerRef}`, status: "PENDING" }, "mock", 80);
    }
    const base = creds.sandbox ? STAGING_BASE : LIVE_BASE;
    try {
      const body = JSON.stringify({
        transactionReference: req.providerRef,
        reason: req.reason,
      });
      const { body: resp } = await http(
        `${base}/reversal`,
        { method: "POST", headers: authHeaders(creds, body), body },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = resp as {
        reversalReference?: string;
        reference?: string;
        status?: string;
        statusCode?: string;
      };
      const reversalRef = String(
        data?.reversalReference ?? data?.reference ?? `paga-rev-${req.providerRef}`
      );
      const st = String(data?.status ?? data?.statusCode ?? "PENDING").toUpperCase();
      const status =
        st === "SUCCESS" || st === "SUCCESSFUL"
          ? "SUCCESS"
          : st === "FAILED"
            ? "FAILED"
            : "PENDING";
      return ok({ reversalRef, status }, reversalRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paga reverseTransfer failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 4. Airtime (full IAirtimeProvider — Paga airtime purchase)
//    POST /airtime
// ---------------------------------------------------------------------------

export const pagaAirtime: IAirtimeProvider = {
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
    // Paga exposes a networks endpoint via the billers API; reuse the local
    // NETWORKS directory for the picker UI.
    return ok(
      NETWORKS.map((n) => ({ id: n.id, name: n.name, country, color: n.color })),
      "paga-networks",
      0
    );
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
    return ok(
      (DATA_PLANS[req.network] ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        amountMinor: p.amountKobo,
        validity: p.validity,
        network: req.network,
      })),
      "paga-plans",
      0
    );
  },

  async purchase(req) {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `paga-airtime-${req.reference}`, status: "SUCCESS" }, "mock", 200);
    }
    const base = creds.sandbox ? STAGING_BASE : LIVE_BASE;
    const callbackUrl =
      creds.secrets.callbackUrl ??
      `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/turbocore/paga`;
    try {
      const body = JSON.stringify({
        reference: req.reference,
        amount: Number(((req.amountMinor ?? 0) / 100).toFixed(2)),
        currency: req.currency,
        phoneNumber: req.phone,
        network: req.network,
        type: req.type,
        planCode: req.planCode,
        callbackUrl,
      });
      const { body: resp } = await http(
        `${base}/airtime`,
        { method: "POST", headers: authHeaders(creds, body), body },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = resp as { transactionReference?: string; status?: string; statusCode?: string };
      const providerRef = data?.transactionReference ?? `paga-airtime-${req.reference}`;
      const st = String(data?.status ?? data?.statusCode ?? "PENDING").toUpperCase();
      const status =
        st === "SUCCESS" || st === "SUCCESSFUL"
          ? "SUCCESS"
          : st === "FAILED"
            ? "FAILED"
            : "PENDING";
      return ok({ providerRef, status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paga airtime purchase failed";
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
    const base = creds.sandbox ? STAGING_BASE : LIVE_BASE;
    try {
      const body = JSON.stringify({ transactionReference: providerRef });
      const { body: resp } = await http(
        `${base}/transactionstatus`,
        { method: "POST", headers: authHeaders(creds, body), body },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = resp as { status?: string; statusCode?: string };
      const st = String(data?.status ?? data?.statusCode ?? "PENDING").toUpperCase();
      const status =
        st === "SUCCESS" || st === "SUCCESSFUL"
          ? "SUCCESS"
          : st === "FAILED"
            ? "FAILED"
            : "PENDING";
      return ok({ status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paga airtime getStatus failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 5. Merchant payment (standalone — pay a Paga merchant)
//    POST /merchant/pay
// ---------------------------------------------------------------------------

export const pagaMerchantPayment = {
  async payMerchant(req: {
    reference: string;
    amountMinor: number;
    currency: string;
    merchantAccount: string;
    merchantPhoneNumber?: string;
  }): Promise<ProviderResult<{ providerRef: string; status: string }>> {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ providerRef: `paga-merchant-${req.reference}`, status: "PENDING" }, "mock", 200);
    }
    const base = creds.sandbox ? STAGING_BASE : LIVE_BASE;
    const callbackUrl =
      creds.secrets.callbackUrl ??
      `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/turbocore/paga`;
    try {
      const body = JSON.stringify({
        reference: req.reference,
        amount: Number((req.amountMinor / 100).toFixed(2)),
        currency: req.currency,
        merchantAccount: req.merchantAccount,
        merchantPhoneNumber: req.merchantPhoneNumber,
        callbackUrl,
      });
      const { body: resp } = await http(
        `${base}/merchant/pay`,
        { method: "POST", headers: authHeaders(creds, body), body },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = resp as { transactionReference?: string; status?: string; statusCode?: string };
      const providerRef = data?.transactionReference ?? `paga-merchant-${req.reference}`;
      const st = String(data?.status ?? data?.statusCode ?? "PENDING").toUpperCase();
      const status =
        st === "SUCCESS" || st === "SUCCESSFUL"
          ? "SUCCESS"
          : st === "FAILED"
            ? "FAILED"
            : "PENDING";
      return ok({ providerRef, status }, providerRef, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paga payMerchant failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 6. Account balance (standalone — explicit accountNumber param)
//    POST /accountbalance
// ---------------------------------------------------------------------------

export const pagaAccountBalance = {
  async getAccountBalance(req: {
    accountNumber: string;
  }): Promise<
    ProviderResult<{ balanceMinor: number; currency: string; availableBalanceMinor?: number }>
  > {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ balanceMinor: 0, currency: "NGN" }, "mock", 50);
    }
    const base = creds.sandbox ? STAGING_BASE : LIVE_BASE;
    try {
      const body = JSON.stringify({ accountNumber: req.accountNumber });
      const { body: resp } = await http(
        `${base}/accountbalance`,
        { method: "POST", headers: authHeaders(creds, body), body },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = resp as {
        balance?: string | number;
        availableBalance?: string | number;
        currency?: string;
      };
      const bal =
        typeof data?.balance === "string" ? parseFloat(data.balance) : (data?.balance ?? 0);
      const avail =
        typeof data?.availableBalance === "string"
          ? parseFloat(data.availableBalance)
          : data?.availableBalance;
      return ok(
        {
          balanceMinor: Math.round((bal ?? 0) * 100),
          currency: data?.currency ?? "NGN",
          availableBalanceMinor: avail != null ? Math.round(avail * 100) : undefined,
        },
        `paga-bal-${Date.now()}`,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paga getAccountBalance failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};

// ---------------------------------------------------------------------------
// 7. Transaction status (standalone — explicit transactionReference param)
//    POST /transactionstatus
// ---------------------------------------------------------------------------

export const pagaTransactionStatus = {
  async getTransactionStatus(req: { transactionReference: string }): Promise<
    ProviderResult<{
      status: string;
      transactionReference: string;
      amountMinor?: number;
      currency?: string;
    }>
  > {
    const blocked = await requireCreds(CODE);
    if (blocked) return blocked;
    const creds = await loadCreds(CODE);
    if (!creds) {
      mockWarnOnce(CODE);
      return ok({ status: "SUCCESS", transactionReference: req.transactionReference }, "mock", 15);
    }
    const base = creds.sandbox ? STAGING_BASE : LIVE_BASE;
    try {
      const body = JSON.stringify({ transactionReference: req.transactionReference });
      const { body: resp } = await http(
        `${base}/transactionstatus`,
        { method: "POST", headers: authHeaders(creds, body), body },
        (s, b) => defaultHttpError(CODE, s, b)
      );
      const data = resp as {
        status?: string;
        statusCode?: string;
        amount?: string | number;
        currency?: string;
      };
      const st = String(data?.status ?? data?.statusCode ?? "PENDING").toUpperCase();
      const status =
        st === "SUCCESS" || st === "SUCCESSFUL"
          ? "SUCCESS"
          : st === "FAILED"
            ? "FAILED"
            : "PENDING";
      const amount = typeof data?.amount === "string" ? parseFloat(data.amount) : data?.amount;
      return ok(
        {
          status,
          transactionReference: req.transactionReference,
          amountMinor: amount != null ? Math.round(amount * 100) : undefined,
          currency: data?.currency,
        },
        req.transactionReference,
        0
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Paga getTransactionStatus failed";
      return fail("UPSTREAM_ERROR", msg, { providerCode: CODE, raw: sanitize({ message: msg }) });
    }
  },
};
