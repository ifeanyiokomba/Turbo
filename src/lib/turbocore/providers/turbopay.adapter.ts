// TurboCore mock "turbopay" provider — implements all 11 contracts in sandbox/demo mode.
// Used as fallback when no real provider is configured, and for development.

import { ok, fail, type ProviderResult } from "../result";
import type {
  IVirtualAccountProvider,
  ICardPaymentProvider,
  IBankTransferProvider,
  IBillPaymentProvider,
  IAirtimeProvider,
  IKYCProvider,
  INotificationProvider,
  IInternationalTransferProvider,
  IMobileMoneyProvider,
  IExchangeRateProvider,
  IVirtualCardIssuer,
} from "../contracts";
import { generateAccountNumber, generatePan, generateExpiry } from "@/lib/money";
import { encryptSecret } from "@/lib/auth";
import { NIGERIAN_BANKS, BILLERS, DATA_PLANS, UNIQUE_BANKS } from "@/lib/banks";
import { NETWORKS } from "@/lib/constants";

const PROVIDER = "turbopay";

export const turbopayVirtualAccount: IVirtualAccountProvider = {
  contract: "VIRTUAL_ACCOUNT",
  async listSupportedBanks(country) {
    return ok(
      UNIQUE_BANKS.map((b) => ({ ...b, country })),
      "mock",
      12
    );
  },
  async createVirtualAccount(req) {
    const acc = generateAccountNumber();
    return ok(
      {
        accountNumber: acc,
        bankCode: "000",
        bankName: "Turbopay MFB",
        providerRef: `tp-va-${acc}`,
      },
      "mock",
      50
    );
  },
  async getAccountStatus(ref) {
    return ok({ status: "ACTIVE", accountNumber: ref.split("-").pop() ?? "" }, "mock", 10);
  },
  async deactivateVirtualAccount() {
    return ok({ deactivated: true }, "mock", 10);
  },
  async resolveAccountName(req) {
    const names = ["JOHN DOE", "JANE SMITH", "ADEKUNLE CIROMA", "FUNMILAYO OGUNDIPE", "CHIDI EZE"];
    const idx = parseInt(req.accountNumber.slice(-1)) % names.length;
    return ok({ accountName: names[idx], bankName: "Turbopay MFB" }, "mock", 30);
  },
};

export const turbopayCardPayment: ICardPaymentProvider = {
  contract: "CARD_PAYMENT",
  async initializeCharge(req) {
    return ok({ providerRef: `tp-card-${req.reference}`, status: "SUCCESS" }, "mock", 200);
  },
  async verifyCharge(ref) {
    return ok({ status: "success", amountSettledMinor: 0, currency: "NGN" }, "mock", 50);
  },
  async refund(req) {
    return ok({ refundRef: `tp-refund-${req.providerRef}`, status: "success" }, "mock", 80);
  },
};

export const turbopayBankTransfer: IBankTransferProvider = {
  contract: "BANK_TRANSFER",
  async listBanks(country) {
    return ok(
      UNIQUE_BANKS.map((b) => ({ ...b, country })),
      "mock",
      15
    );
  },
  async resolveAccountName(req) {
    return turbopayVirtualAccount.resolveAccountName(req);
  },
  async initiateTransfer(req) {
    return ok({ providerRef: `tp-trf-${req.reference}`, status: "SUCCESS" }, "mock", 250);
  },
  async getTransferStatus(ref) {
    return ok({ status: "SUCCESS", settlementTime: new Date().toISOString() }, "mock", 20);
  },
  async reverseTransfer(req) {
    return ok({ reversalRef: `tp-rev-${req.providerRef}`, status: "SUCCESS" }, "mock", 60);
  },
};

export const turbopayBillPayment: IBillPaymentProvider = {
  contract: "BILL_PAYMENT",
  async listBillers(req) {
    const cats = Object.keys(BILLERS);
    const billers = req.category
      ? (BILLERS[req.category] ?? []).map((b) => ({ ...b, category: req.category! }))
      : cats.flatMap((c) => (BILLERS[c] ?? []).map((b) => ({ ...b, category: c })));
    return ok(
      billers.map((b) => ({ ...b, country: req.country })),
      "mock",
      20
    );
  },
  async validateCustomer(req) {
    return ok({ customerName: `CUSTOMER ${req.customerRef.slice(-4)}`, valid: true }, "mock", 40);
  },
  async payBill(req) {
    const token =
      req.billerCode.startsWith("E") ||
      req.billerCode.includes("EKO") ||
      req.billerCode.includes("EKEDC")
        ? Array.from({ length: 20 }, () => Math.floor(Math.random() * 10)).join("")
        : undefined;
    return ok({ providerRef: `tp-bill-${req.reference}`, status: "SUCCESS", token }, "mock", 150);
  },
  async queryBillPayment(ref) {
    return ok({ status: "SUCCESS" }, "mock", 15);
  },
};

export const turbopayAirtime: IAirtimeProvider = {
  contract: "AIRTIME",
  async listNetworks(country) {
    return ok(
      NETWORKS.map((n) => ({ id: n.id, name: n.name, country })),
      "mock",
      10
    );
  },
  async listDataPlans(req) {
    return ok(
      (DATA_PLANS[req.network] ?? []).map((p) => ({
        ...p,
        network: req.network,
        amountMinor: p.amountKobo,
      })),
      "mock",
      12
    );
  },
  async purchase(req) {
    return ok({ providerRef: `tp-air-${req.reference}`, status: "SUCCESS" }, "mock", 120);
  },
  async getStatus() {
    return ok({ status: "SUCCESS" }, "mock", 10);
  },
};

export const turbopayKyc: IKYCProvider = {
  contract: "KYC",
  async verifyIdentity(req) {
    return ok(
      {
        tier: req.idType === "BVN" ? 3 : 2,
        verified: true,
        firstName: "Verified",
        lastName: "User",
      },
      "mock",
      300
    );
  },
};

export const turbopayNotification: INotificationProvider = {
  contract: "NOTIFICATION",
  async send(req) {
    return ok({ messageId: `tp-msg-${Date.now()}`, status: "sent" }, "mock", 30);
  },
  async getDeliveryStatus() {
    return ok({ status: "delivered" }, "mock", 10);
  },
};

export const turbopayIntl: IInternationalTransferProvider = {
  contract: "INTERNATIONAL_TRANSFER",
  async getQuote(req) {
    const rate = req.sourceCurrency === "NGN" && req.targetCurrency === "USD" ? 1 / 1480 : 1;
    return ok(
      {
        rate,
        feeMinor: 500,
        totalMinor: req.amountMinor + 500,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      "mock",
      80
    );
  },
  async sendTransfer(req) {
    return ok(
      {
        providerRef: `tp-intl-${req.reference}`,
        status: "PENDING",
        estimatedDelivery: new Date(Date.now() + 24 * 3600_000).toISOString(),
      },
      "mock",
      200
    );
  },
  async getTransferStatus(ref) {
    return ok(
      { status: "PENDING", timeline: [{ status: "initiated", at: new Date().toISOString() }] },
      "mock",
      20
    );
  },
  async cancelTransfer() {
    return ok({ status: "CANCELLED" }, "mock", 30);
  },
};

export const turbopayMobileMoney: IMobileMoneyProvider = {
  contract: "MOBILE_MONEY",
  async getBalance() {
    return ok({ balanceMinor: 0, currency: "KES" }, "mock", 50);
  },
  async collect(req) {
    return ok({ providerRef: `tp-momo-${req.reference}`, status: "SUCCESS" }, "mock", 200);
  },
  async disburse(req) {
    return ok({ providerRef: `tp-momo-${req.reference}`, status: "SUCCESS" }, "mock", 200);
  },
  async getStatus() {
    return ok({ status: "SUCCESS" }, "mock", 10);
  },
};

export const turbopayExchangeRate: IExchangeRateProvider = {
  contract: "EXCHANGE_RATE",
  async getRate(req) {
    const rates: Record<string, number> = {
      "NGN-USD": 1 / 1480,
      "USD-NGN": 1480,
      "NGN-KES": 11.4,
      "USD-KES": 168,
    };
    return ok(
      {
        rate: rates[`${req.base}-${req.quote}`] ?? 1,
        source: "mock",
        timestamp: new Date().toISOString(),
      },
      "mock",
      20
    );
  },
  async listSupported() {
    return ok(
      {
        pairs: [
          { base: "NGN", quote: "USD" },
          { base: "USD", quote: "KES" },
        ],
      },
      "mock",
      10
    );
  },
};

export const turbopayCardIssuer: IVirtualCardIssuer = {
  contract: "VIRTUAL_CARD_ISSUER",
  async issueCard(req) {
    const { pan, last4 } = generatePan();
    return ok(
      {
        providerRef: `tp-card-issue-${req.userId}`,
        panEnc: encryptSecret(pan),
        cvvEnc: encryptSecret(String(Math.floor(100 + Math.random() * 900))),
        last4,
        expiry: generateExpiry(),
      },
      "mock",
      80
    );
  },
  async fundCard() {
    return ok({ status: "SUCCESS" }, "mock", 30);
  },
  async withdrawCard() {
    return ok({ status: "SUCCESS" }, "mock", 30);
  },
  async freezeCard() {
    return ok({ status: "FROZEN" }, "mock", 20);
  },
  async unfreezeCard() {
    return ok({ status: "ACTIVE" }, "mock", 20);
  },
  async terminateCard() {
    return ok({ status: "TERMINATED", refundedMinor: 0 }, "mock", 20);
  },
};
