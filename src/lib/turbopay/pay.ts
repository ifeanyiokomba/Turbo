// TurboPay Unified Payment API — TurboPay.pay()
//
// This is the heart of the platform. Instead of Paystack.pay() or
// Flutterwave.pay(), everything becomes TurboPay.pay().
//
// The orchestrator decides:
//   - Provider (routing engine)
//   - Retry (failover chain)
//   - Fallback (alternative providers)
//   - Routing (geo-aware, capability-filtered)
//   - Pricing (fee calculation)
//   - Currency (multi-currency support)
//   - Compliance (AML, sanctions, KYC tier checks)
//   - Health (circuit breaker, EMA score)
//   - Latency (settle speed scoring)
//   - Risk (fraud screening, step-up auth)
//   - Availability (feature flags, provider enabled)
//
// Exactly like Stripe — one API, the platform handles the rest.

import { db } from "@/lib/db";
import { orchestratePayment, type OrchestrateRequest } from "@/lib/turbocore/orchestrator";
import { ContractName, type ProviderResult } from "@/lib/turbocore/result";
import { transferBetweenWallets } from "@/lib/ledger";
import { generateReference } from "@/lib/money";
import { KYC_TIER_LIMITS } from "@/lib/constants";
import { runAmlRules, screenEntity } from "@/lib/turbocore/compliance/screen";
import { isFeatureEnabled } from "@/lib/turbocore/feature-flags";

// ===== TurboPay.pay() — the unified entry point =====

export interface TurboPayRequest {
  userId: string;
  pin: string;
  type:
    | "TRANSFER"
    | "AIRTIME"
    | "DATA"
    | "BILL"
    | "CARD_FUND"
    | "CARD_WITHDRAW"
    | "MOBILE_MONEY"
    | "INTERNATIONAL"
    | "PAYMENT_LINK"
    | "MERCHANT"
    | "SAVINGS"
    | "INVESTMENT";
  amountKobo: number;
  currency?: string;
  direction: "INBOUND" | "OUTBOUND";
  recipient?: {
    type?: string;
    identifier?: string;
    bankCode?: string;
    bankName?: string;
    name?: string;
    country?: string;
    currency?: string;
  };
  billerCode?: string;
  billerName?: string;
  customerRef?: string;
  network?: string;
  planCode?: string;
  cardId?: string;
  productId?: string;
  note?: string;
  reference?: string;
  metadata?: Record<string, unknown>;
}

export interface TurboPayResult {
  success: boolean;
  reference: string;
  status: "SUCCESS" | "PENDING" | "FAILED" | "REVERSED";
  provider?: string;
  newBalanceKobo?: number;
  transaction?: any;
  error?: { code: string; message: string };
}

export async function pay(req: TurboPayRequest): Promise<TurboPayResult> {
  const reference = req.reference ?? generateReference("TP");
  const contract = mapTypeToContract(req.type);

  // 1. Validate
  const validation = await validateRequest(req);
  if (!validation.ok)
    return { success: false, reference, status: "FAILED", error: validation.error! };
  const user = validation.user!;

  // 2. Sanctions screening
  if (req.direction === "OUTBOUND" && req.recipient?.name) {
    const s = await screenEntity({
      name: req.recipient.name,
      entityType: "TRANSACTION",
      userId: req.userId,
    });
    if (s.hit)
      return {
        success: false,
        reference,
        status: "FAILED",
        error: { code: "COMPLIANCE_REJECT", message: "Recipient flagged on sanctions list" },
      };
  }

  // 3. AML rules
  const aml = await runAmlRules({
    userId: req.userId,
    amountMinor: req.amountKobo,
    direction: req.direction === "OUTBOUND" ? "DEBIT" : "CREDIT",
    kycTier: user.kycTier,
  });
  if (aml.flagged && aml.severity === "HIGH")
    return {
      success: false,
      reference,
      status: "FAILED",
      error: { code: "COMPLIANCE_REJECT", message: `AML: ${aml.description}` },
    };

  // 4. Orchestrate
  const result = await orchestratePayment({
    userId: req.userId,
    contract,
    country: user.country || "NG",
    currency: req.currency ?? "NGN",
    amountMinor: req.amountKobo,
    feeMinor: calculateFee(req),
    direction: req.direction,
    service: req.type,
    description: buildDescription(req),
    counterpartyName: req.recipient?.name,
    counterpartyAccount: req.recipient?.identifier,
    counterpartyBank: req.recipient?.bankName,
    pin: req.pin,
    idempotencyKey: req.reference,
    providerCall: async (adapter: any, providerRef: string) =>
      executeProviderCall(req, adapter, providerRef),
  } as OrchestrateRequest);

  if (result.ok) {
    return {
      success: true,
      reference: result.transaction?.reference ?? reference,
      status: result.transaction?.status ?? "SUCCESS",
      provider: result.providerRef,
      newBalanceKobo: result.newBalanceMinor,
      transaction: result.transaction,
    };
  }
  return {
    success: false,
    reference: result.transaction?.reference ?? reference,
    status: result.transaction?.status ?? "FAILED",
    error: result.error ?? { code: "UNKNOWN", message: "Payment failed" },
  };
}

function mapTypeToContract(type: TurboPayRequest["type"]): ContractName {
  const map: Record<string, ContractName> = {
    TRANSFER: "BANK_TRANSFER" as ContractName,
    AIRTIME: "AIRTIME" as ContractName,
    DATA: "AIRTIME" as ContractName,
    BILL: "BILL_PAYMENT" as ContractName,
    CARD_FUND: "VIRTUAL_CARD_ISSUER" as ContractName,
    CARD_WITHDRAW: "VIRTUAL_CARD_ISSUER" as ContractName,
    MOBILE_MONEY: "MOBILE_MONEY" as ContractName,
    INTERNATIONAL: "INTERNATIONAL_TRANSFER" as ContractName,
    PAYMENT_LINK: "CARD_PAYMENT" as ContractName,
    MERCHANT: "BANK_TRANSFER" as ContractName,
    SAVINGS: "BANK_TRANSFER" as ContractName,
    INVESTMENT: "BANK_TRANSFER" as ContractName,
  };
  return map[type];
}

async function validateRequest(
  req: TurboPayRequest
): Promise<{ ok: boolean; error?: { code: string; message: string }; user?: any }> {
  if (req.amountKobo <= 0)
    return { ok: false, error: { code: "INVALID_REQUEST", message: "Amount must be positive" } };
  const user = await db.user.findUnique({ where: { id: req.userId } });
  if (!user) return { ok: false, error: { code: "INVALID_REQUEST", message: "User not found" } };
  if (user.status !== "ACTIVE")
    return {
      ok: false,
      error: { code: "INVALID_REQUEST", message: `Account is ${user.status.toLowerCase()}` },
    };
  const tierLimits = KYC_TIER_LIMITS[user.kycTier] ?? KYC_TIER_LIMITS[1];
  if (req.amountKobo > tierLimits.singleTxLimitKobo)
    return {
      ok: false,
      error: {
        code: "KYC_LIMIT",
        message: `Exceeds Tier ${user.kycTier} limit of ₦${tierLimits.singleTxLimitKobo / 100}`,
      },
    };
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todaySpent = await db.transaction.aggregate({
    where: {
      userId: req.userId,
      direction: "DEBIT",
      status: "SUCCESS",
      createdAt: { gte: todayStart },
    },
    _sum: { amountKobo: true },
  });
  if ((todaySpent._sum.amountKobo ?? 0) + req.amountKobo > tierLimits.dailyLimitKobo)
    return { ok: false, error: { code: "KYC_LIMIT", message: "Daily limit exceeded" } };
  if (req.type === "INTERNATIONAL") {
    const e = await isFeatureEnabled("international_transfers_enabled");
    if (!e)
      return {
        ok: false,
        error: { code: "NOT_SUPPORTED", message: "International transfers disabled" },
      };
  }
  return { ok: true, user };
}

function calculateFee(req: TurboPayRequest): number {
  switch (req.type) {
    case "TRANSFER":
      return req.recipient?.type === "TURBOPAY" ? 0 : 5250;
    case "AIRTIME":
    case "DATA":
      return 0;
    case "BILL":
      return 1000;
    case "CARD_FUND":
    case "CARD_WITHDRAW":
      return 0;
    case "MOBILE_MONEY":
      return 0;
    case "INTERNATIONAL":
      return Math.round(req.amountKobo * 0.01);
    case "PAYMENT_LINK":
      return Math.round(req.amountKobo * 0.018);
    case "MERCHANT":
      return Math.round(req.amountKobo * 0.015);
    default:
      return 0;
  }
}

function buildDescription(req: TurboPayRequest): string {
  const note = req.note ? ` — ${req.note}` : "";
  const map: Record<string, string> = {
    TRANSFER: `Transfer to ${req.recipient?.name ?? req.recipient?.identifier ?? "recipient"}`,
    AIRTIME: `Airtime — ${req.network ?? ""} ${req.recipient?.identifier ?? ""}`,
    DATA: `Data — ${req.network ?? ""} ${req.recipient?.identifier ?? ""}`,
    BILL: `Bill — ${req.billerName ?? ""} (${req.customerRef ?? ""})`,
    CARD_FUND: "Card funding",
    CARD_WITHDRAW: "Card withdrawal",
    MOBILE_MONEY: `Mobile money — ${req.recipient?.identifier ?? ""}`,
    INTERNATIONAL: `International transfer to ${req.recipient?.name ?? ""}`,
    PAYMENT_LINK: "Payment link",
    MERCHANT: "Merchant payment",
    SAVINGS: "Savings deposit",
    INVESTMENT: "Investment",
  };
  return (map[req.type] ?? "Payment") + note;
}

async function executeProviderCall(
  req: TurboPayRequest,
  adapter: any,
  providerRef: string
): Promise<ProviderResult<any>> {
  switch (req.type) {
    case "TRANSFER":
      if (req.recipient?.type === "TURBOPAY") {
        const toUser = await db.user.findFirst({
          where: {
            OR: [
              { username: req.recipient?.identifier?.toLowerCase() },
              { phone: req.recipient?.identifier },
              { email: req.recipient?.identifier },
            ],
          },
        });
        if (!toUser)
          return {
            ok: false,
            error: {
              code: "BENEFICIARY_INVALID",
              message: "Recipient not found",
              retryable: false,
            },
          };
        await transferBetweenWallets({
          fromUserId: req.userId,
          toUserId: toUser.id,
          amountKobo: req.amountKobo,
          description: buildDescription(req),
          refId: providerRef,
        });
        return {
          ok: true,
          data: { status: "SUCCESS", providerRef },
          providerRequestId: providerRef,
          latencyMs: 50,
        };
      }
      return adapter.initiateTransfer({
        reference: providerRef,
        amountMinor: req.amountKobo,
        currency: req.currency ?? "NGN",
        beneficiary: {
          name: req.recipient?.name ?? "",
          accountNumber: req.recipient?.identifier ?? "",
          bankCode: req.recipient?.bankCode ?? "",
        },
        narration: req.note,
      });
    case "AIRTIME":
    case "DATA":
      return adapter.purchase({
        reference: providerRef,
        type: req.type,
        phone: req.recipient?.identifier ?? "",
        network: req.network ?? "",
        amountMinor: req.amountKobo,
        planCode: req.planCode,
        currency: req.currency ?? "NGN",
      });
    case "BILL":
      return adapter.payBill({
        reference: providerRef,
        billerCode: req.billerCode ?? "",
        customerRef: req.customerRef ?? "",
        amountMinor: req.amountKobo,
        currency: req.currency ?? "NGN",
      });
    case "CARD_FUND":
      return adapter.fundCard({
        providerRef: req.cardId ?? "",
        amountMinor: req.amountKobo,
        currency: req.currency ?? "NGN",
      });
    case "CARD_WITHDRAW":
      return adapter.withdrawCard({ providerRef: req.cardId ?? "", amountMinor: req.amountKobo });
    case "MOBILE_MONEY":
      return req.direction === "INBOUND"
        ? adapter.collect({
            reference: providerRef,
            phone: req.recipient?.identifier ?? "",
            walletProvider: req.network ?? "",
            amountMinor: req.amountKobo,
            currency: req.currency ?? "NGN",
            narration: req.note,
          })
        : adapter.disburse({
            reference: providerRef,
            phone: req.recipient?.identifier ?? "",
            walletProvider: req.network ?? "",
            amountMinor: req.amountKobo,
            currency: req.currency ?? "NGN",
          });
    case "INTERNATIONAL":
      return adapter.sendTransfer({
        reference: providerRef,
        beneficiary: {
          name: req.recipient?.name ?? "",
          country: req.recipient?.country ?? "",
          bankName: req.recipient?.bankName ?? "",
          accountNumber: req.recipient?.identifier,
          currency: req.recipient?.currency ?? "USD",
        },
        amountMinor: req.amountKobo,
        currency: req.currency ?? "USD",
        narration: req.note,
      });
    case "PAYMENT_LINK":
    case "MERCHANT":
      return adapter.initializeCharge({
        amountMinor: req.amountKobo,
        currency: req.currency ?? "NGN",
        reference: providerRef,
        customer: { name: req.recipient?.name },
      });
    case "SAVINGS":
    case "INVESTMENT":
      return {
        ok: true,
        data: { status: "SUCCESS", providerRef },
        providerRequestId: providerRef,
        latencyMs: 10,
      };
    default:
      return {
        ok: false,
        error: { code: "NOT_SUPPORTED", message: `Unsupported: ${req.type}`, retryable: false },
      };
  }
}
