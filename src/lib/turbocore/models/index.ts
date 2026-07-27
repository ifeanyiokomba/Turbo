// TurboCore Canonical Domain Model — Chapter 2
//
// The Universal Financial Data Model.
// Every provider is translated into TurboCore's own financial language.
//
// Rule 1: Every provider speaks a different language. TurboCore doesn't care.
//         Everything becomes Payment, Customer, Wallet, Ledger, etc.
// Rule 2: Never store provider-specific objects in the database.
//         Provider-specific data belongs inside providerMetadata.
// Rule 3: No UPDATE. Only INSERT. Financial history must remain immutable.
// Rule 4: Normalize statuses, payment methods, currencies, and events.
// Rule 5: Every provider adapter translates provider objects into TurboCore objects.

import type { ProviderManifest } from "../manifest-registry";

// ===== Universal Object Model =====
// TurboCore owns every object. There is NO Paystack Object, Stripe Object, etc.

// ===== Payment Object =====
// Every provider maps here.

export interface CanonicalPayment {
  id: string;
  reference: string;
  customerId: string;
  walletId?: string;
  merchantId?: string;
  country: string;
  currency: string;

  amount: CanonicalMoney;
  fee: CanonicalMoney;
  providerFee: CanonicalMoney;
  exchangeRate?: number;

  status: PaymentStatus;
  paymentMethod: PaymentMethod;

  provider: ProviderInfo;
  providerMetadata: Record<string, unknown>;

  riskScore: number;

  type: PaymentType;
  direction: "INBOUND" | "OUTBOUND";
  description: string;

  events: CanonicalEvent[];
  metadata: Record<string, unknown>;

  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// ===== Payment Status Dictionary =====
// Every provider maps into one standard.
//
// | TurboCore    | Example Provider Statuses        |
// |--------------|----------------------------------|
// | CREATED      | initialized                      |
// | PENDING      | pending                          |
// | PROCESSING   | processing                       |
// | AUTHORIZED   | authorized                       |
// | COMPLETED    | success / succeeded / successful |
// | FAILED       | failed                           |
// | CANCELLED    | cancelled                        |
// | EXPIRED      | expired                          |
// | REVERSED     | reversed                         |
// | REFUNDED     | refunded                         |
// | DISPUTED     | chargeback/dispute               |

export type PaymentStatus =
  | "CREATED"
  | "PENDING"
  | "PROCESSING"
  | "AUTHORIZED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED"
  | "REVERSED"
  | "REFUNDED"
  | "DISPUTED";

// ===== Payment Methods =====
// TurboCore owns payment methods. Providers simply advertise which they support.

export type PaymentMethod =
  | "CARD"
  | "BANK_TRANSFER"
  | "MOBILE_MONEY"
  | "VIRTUAL_ACCOUNT"
  | "USSD"
  | "QR"
  | "APPLE_PAY"
  | "GOOGLE_PAY"
  | "CRYPTO"
  | "STABLECOIN"
  | "WALLET"
  | "PAYMENT_LINK"
  | "INVOICE"
  | "POS"
  | "CASH_PICKUP";

export type PaymentType =
  | "COLLECTION"
  | "DISBURSEMENT"
  | "TRANSFER"
  | "REFUND"
  | "REVERSAL"
  | "SETTLEMENT"
  | "FUNDING"
  | "AIRTIME"
  | "DATA"
  | "BILL"
  | "CARD_FUND"
  | "CARD_WITHDRAW"
  | "MOBILE_MONEY"
  | "INTERNATIONAL"
  | "SAVINGS"
  | "INVESTMENT";

export type PaymentState =
  | "INITIATED"
  | "PIN_VERIFIED"
  | "AML_CHECKED"
  | "HOLD_POSTED"
  | "PROVIDER_CALLED"
  | "SETTLED"
  | "REVERSED"
  | "FAILED";

// ===== Canonical Money =====

export interface CanonicalMoney {
  amount: number; // minor units (kobo, cents)
  currency: string; // ISO 4217
}

// ===== Customer Model =====
// The customer exists independently of any payment provider.

export interface CanonicalCustomer {
  id: string;
  type: "INDIVIDUAL" | "BUSINESS";
  firstName?: string;
  lastName?: string;
  businessName?: string;
  email?: string;
  phone?: string;
  country: string;
  defaultCurrency: string;
  status: "ACTIVE" | "FROZEN" | "SUSPENDED" | "CLOSED";
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  kycLevel: number;
  identityStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  walletIds: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ===== Wallet Model =====
// Every customer may own multiple wallets (NGN, USD, KES, etc.).
// Never store balances as a single value — financial systems need
// separate available, pending, reserved, and ledger balances.

export interface CanonicalWallet {
  id: string;
  customerId: string;
  currency: string;
  type: "FIAT" | "STABLECOIN" | "CRYPTO";
  status: "ACTIVE" | "FROZEN" | "CLOSED";
  availableBalance: number;
  pendingBalance: number;
  reservedBalance: number;
  ledgerBalance: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ===== Ledger =====
// Every financial movement creates immutable ledger entries.
// Double-entry accounting is essential. No UPDATE. Only INSERT.

export interface CanonicalLedgerEntry {
  id: string;
  account: string;
  walletId: string;
  entryType: "DEBIT" | "CREDIT";
  amount: CanonicalMoney;
  reference: string;
  paymentId?: string;
  provider?: string;
  pairId?: string;
  balanceAfter: number;
  description: string;
  immutable: boolean;
  timestamp: string;
}

// ===== Provider Object =====
// TurboCore knows providers. The routing engine doesn't guess.

export interface CanonicalProvider {
  id: string;
  name: string;
  version: string;
  status: "ACTIVE" | "INACTIVE" | "DEGRADED" | "DOWN";
  countries: string[];
  currencies: string[];
  healthScore: number;
  successRate: number;
  averageLatency: number;
  feeModel: {
    percentageBps: number;
    fixedFee: Record<string, number>;
    crossBorderBps: number;
  };
  supportsRealtime: boolean;
  supportsRefunds: boolean;
  supportsDisputes: boolean;
  supportsSubscriptions: boolean;
  supportsVirtualAccounts: boolean;
  supportsIdentity: boolean;
  supportsSplitPayments: boolean;
  supportsRecurringBilling: boolean;
  supportsUSSD: boolean;
  supportsQR: boolean;
  supportsApplePay: boolean;
  supportsGooglePay: boolean;
}

// ===== Country Object =====
// Every country becomes configuration. Nothing hardcoded.

export interface CanonicalCountry {
  code: string;
  name: string;
  currency: string;
  timezone: string;
  supportedProviders: string[];
  supportedPaymentMethods: string[];
  kycRules: {
    tier2: { idTypes: string[]; label: string };
    tier3: { idTypes: string[]; label: string };
  };
  taxRules: { rateBps: number; notes?: string };
  fxRules: { spreadBps: number; markupBps: number };
  settlementRules: { cycle: "INSTANT" | "T_PLUS_1" | "T_PLUS_2"; currency: string };
  locale: string;
  rtl: boolean;
}

// ===== Currency Object =====

export interface CanonicalCurrency {
  code: string;
  symbol: string;
  decimals: number;
  country: string;
  exchangeRate: number;
  precision: number;
}

// ===== Merchant Object =====
// Merchants are first-class citizens, not attached to providers.

export interface CanonicalMerchant {
  id: string;
  businessName: string;
  country: string;
  industry: string;
  walletId: string;
  settlementSchedule: "INSTANT" | "DAILY" | "WEEKLY" | "MONTHLY";
  feePlan: { percentageBps: number; fixedFee: number };
  riskProfile: "LOW" | "MEDIUM" | "HIGH";
  kycLevel: number;
  status: "ACTIVE" | "SUSPENDED" | "CLOSED";
  createdAt: string;
}

// ===== Identity Object =====
// TurboCore normalizes KYC across providers.

export interface CanonicalIdentity {
  id: string;
  customerId: string;
  country: string;
  verificationLevel: number;
  documents: IdentityDocument[];
  faceMatch: boolean;
  liveness: boolean;
  amlStatus: "CLEAR" | "FLAGGED" | "UNDER_REVIEW";
  pepStatus: "CLEAR" | "PEP";
  sanctionsStatus: "CLEAR" | "HIT";
  status: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  verifiedAt?: string;
  createdAt: string;
}

export interface IdentityDocument {
  type: string;
  value: string;
  verified: boolean;
  provider: string;
}

// ===== FX Object =====
// Never hardcode exchange rates.

export interface CanonicalExchangeRate {
  base: string;
  quote: string;
  provider: string;
  rate: number;
  markup: number;
  retrievedAt: string;
  expiresAt: string;
}

// ===== Risk Object =====
// Multiple fraud engines contribute to one unified risk model.

export interface CanonicalRiskEvent {
  id: string;
  customerId: string;
  paymentId?: string;
  score: number;
  reason: string;
  action: "ALLOW" | "REVIEW" | "BLOCK" | "FREEZE";
  provider?: string;
  createdAt: string;
}

// ===== Webhook Object =====
// Providers send different payloads. TurboCore converts them.

export interface CanonicalWebhook {
  id: string;
  provider: string;
  event: string;
  reference: string;
  signatureStatus: "VALID" | "INVALID" | "NONE";
  payload: Record<string, unknown>;
  processed: boolean;
  receivedAt: string;
  processedAt?: string;
}

// ===== Canonical Event =====
// Every provider event becomes one internal event.

export interface CanonicalEvent {
  id: string;
  type: TurboCoreEventType;
  status: "PENDING" | "SUCCESS" | "FAILED";
  actor: "SYSTEM" | "USER" | "ADMIN" | "PROVIDER";
  actorId?: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  timestamp: string;
}

// ===== Canonical Event Types =====
// Internal services never subscribe to Paystack or Stripe event names.
// They subscribe only to TurboCore events.

export type TurboCoreEventType =
  | "PAYMENT.CREATED"
  | "PAYMENT.PENDING"
  | "PAYMENT.PROCESSING"
  | "PAYMENT.AUTHORIZED"
  | "PAYMENT.COMPLETED"
  | "PAYMENT.FAILED"
  | "PAYMENT.CANCELLED"
  | "PAYMENT.EXPIRED"
  | "PAYMENT.REVERSED"
  | "PAYMENT.REFUNDED"
  | "PAYMENT.DISPUTED"
  | "TRANSFER.CREATED"
  | "TRANSFER.COMPLETED"
  | "TRANSFER.FAILED"
  | "KYC.APPROVED"
  | "KYC.REJECTED"
  | "KYC.PENDING"
  | "SETTLEMENT.COMPLETED"
  | "SETTLEMENT.PENDING"
  | "PROVIDER.DOWN"
  | "PROVIDER.DEGRADED"
  | "PROVIDER.RECOVERED"
  | "WALLET.FUNDED"
  | "WALLET.DEBITED"
  | "WALLET.FROZEN"
  | "RISK.FLAGGED"
  | "RISK.BLOCKED"
  | "WEBHOOK.RECEIVED"
  | "WEBHOOK.PROCESSED";

// ===== Settlement Object =====

export interface CanonicalSettlement {
  id: string;
  provider: string;
  periodStart: string;
  periodEnd: string;
  expected: CanonicalMoney;
  settled: CanonicalMoney;
  status: "PENDING" | "CONFIRMED" | "RECONCILED";
  settledAt?: string;
}

// ===== Recipient Object (for transfers) =====

export interface CanonicalRecipient {
  type: "TURBOPAY" | "BANK" | "MOBILE_MONEY" | "INTERNATIONAL" | "WALLET";
  name: string;
  accountNumber?: string;
  bankCode?: string;
  bankName?: string;
  phone?: string;
  walletProvider?: string;
  country?: string;
  currency?: string;
  iban?: string;
  swiftCode?: string;
  routingNumber?: string;
}

// ===== Provider Info (embedded in Payment) =====

export interface ProviderInfo {
  code: string;
  name: string;
  reference?: string;
  transactionId?: string;
  method?: string;
  responseCode?: string;
  responseMessage?: string;
}

// ===== Status Mapping Functions =====
// Normalize provider statuses to TurboCore statuses.

const STATUS_MAP: Record<string, PaymentStatus> = {
  // Paystack
  success: "COMPLETED",
  abandoned: "EXPIRED",
  failed: "FAILED",
  pending: "PENDING",
  reversed: "REVERSED",
  // Flutterwave
  successful: "COMPLETED",
  "charge-backed": "DISPUTED",
  // Stripe
  succeeded: "COMPLETED",
  requires_payment_method: "PENDING",
  requires_confirmation: "PENDING",
  requires_action: "PROCESSING",
  canceled: "CANCELLED",
  // M-Pesa
  "0": "COMPLETED", // ResultCode 0 = success
  "1032": "CANCELLED",
  "1037": "EXPIRED",
  // MTN MoMo
  SUCCESSFUL: "COMPLETED",
  FAILED: "FAILED",
  TIMEOUT: "EXPIRED",
  PENDING: "PENDING",
  // Airtel Money
  SUCCESS: "COMPLETED",
  // Generic
  initiated: "CREATED",
  processing: "PROCESSING",
  authorized: "AUTHORIZED",
  cancelled: "CANCELLED",
  expired: "EXPIRED",
  refunded: "REFUNDED",
  disputed: "DISPUTED",
  chargeback: "DISPUTED",
  // TurboCore internal
  CREATED: "CREATED",
  COMPLETED: "COMPLETED",
};

export function normalizeStatus(providerStatus: string): PaymentStatus {
  return STATUS_MAP[providerStatus] ?? "PENDING";
}

// ===== Payment Method Mapping =====

const METHOD_MAP: Record<string, PaymentMethod> = {
  card: "CARD",
  bank_transfer: "BANK_TRANSFER",
  bank: "BANK_TRANSFER",
  mobile_money: "MOBILE_MONEY",
  momo: "MOBILE_MONEY",
  "mobile money": "MOBILE_MONEY",
  virtual_account: "VIRTUAL_ACCOUNT",
  dedicated_account: "VIRTUAL_ACCOUNT",
  "dedicated account": "VIRTUAL_ACCOUNT",
  ussd: "USSD",
  qr: "QR",
  apple_pay: "APPLE_PAY",
  google_pay: "GOOGLE_PAY",
  crypto: "CRYPTO",
  stablecoin: "STABLECOIN",
  wallet: "WALLET",
  payment_link: "PAYMENT_LINK",
  invoice: "INVOICE",
  pos: "POS",
  cash_pickup: "CASH_PICKUP",
};

export function normalizePaymentMethod(providerMethod: string): PaymentMethod {
  return METHOD_MAP[providerMethod.toLowerCase()] ?? "CARD";
}

// ===== Event Type Mapping =====
// Provider event names → TurboCore event types

const EVENT_MAP: Record<string, TurboCoreEventType> = {
  // Paystack
  "charge.success": "PAYMENT.COMPLETED",
  "charge.failed": "PAYMENT.FAILED",
  "transfer.success": "TRANSFER.COMPLETED",
  "transfer.failed": "TRANSFER.FAILED",
  "transfer.reversed": "PAYMENT.REVERSED",
  "refund.processed": "PAYMENT.REFUNDED",
  "dispute.create": "PAYMENT.DISPUTED",
  // Flutterwave
  "charge.completed": "PAYMENT.COMPLETED",
  "charge.failed": "PAYMENT.FAILED",
  "transfer.completed": "TRANSFER.COMPLETED",
  "transfer.failed": "TRANSFER.FAILED",
  // Stripe
  "payment_intent.succeeded": "PAYMENT.COMPLETED",
  "payment_intent.payment_failed": "PAYMENT.FAILED",
  "payment_intent.created": "PAYMENT.CREATED",
  "payment_intent.processing": "PAYMENT.PROCESSING",
  "payment_intent.canceled": "PAYMENT.CANCELLED",
  "charge.refunded": "PAYMENT.REFUNDED",
  "charge.dispute.created": "PAYMENT.DISPUTED",
  // M-Pesa
  "stkCallback.success": "PAYMENT.COMPLETED",
  "stkCallback.failed": "PAYMENT.FAILED",
  "b2c.success": "TRANSFER.COMPLETED",
  "b2c.failed": "TRANSFER.FAILED",
  // MTN MoMo
  "collection.success": "PAYMENT.COMPLETED",
  "collection.failed": "PAYMENT.FAILED",
  "disbursement.success": "TRANSFER.COMPLETED",
  "disbursement.failed": "TRANSFER.FAILED",
};

export function normalizeEventType(providerEvent: string): TurboCoreEventType {
  return EVENT_MAP[providerEvent] ?? "WEBHOOK.RECEIVED";
}

// ===== Manifest → Canonical Provider Mapping =====

export function manifestToProvider(manifest: ProviderManifest): CanonicalProvider {
  return {
    id: manifest.provider,
    name: manifest.displayName,
    version: manifest.version,
    status: "ACTIVE",
    countries: manifest.countries,
    currencies: manifest.currencies,
    healthScore: 100,
    successRate: 100,
    averageLatency: 0,
    feeModel: manifest.fees,
    supportsRealtime: manifest.settlementCycle === "INSTANT",
    supportsRefunds: manifest.supportsRefunds,
    supportsDisputes: manifest.supportsChargebacks,
    supportsSubscriptions: manifest.supportsRecurringBilling,
    supportsVirtualAccounts: manifest.supportsVirtualAccounts,
    supportsIdentity: manifest.capabilities.some((c) => c.name === "KYC"),
    supportsSplitPayments: manifest.supportsSplitPayments,
    supportsRecurringBilling: manifest.supportsRecurringBilling,
    supportsUSSD: manifest.supportsUSSD,
    supportsQR: manifest.supportsQR,
    supportsApplePay: manifest.supportsApplePay,
    supportsGooglePay: manifest.supportsGooglePay,
  };
}

// ===== Transaction → Canonical Payment Mapping =====

export function mapToCanonicalPayment(tx: any, events: any[] = []): CanonicalPayment {
  return {
    id: tx.id,
    reference: tx.reference,
    customerId: tx.userId,
    walletId: tx.walletId,
    country: "NG",
    currency: "NGN",
    amount: { amount: tx.amountKobo, currency: "NGN" },
    fee: { amount: tx.feeKobo ?? 0, currency: "NGN" },
    providerFee: { amount: 0, currency: "NGN" },
    status: normalizeStatus(tx.status),
    paymentMethod: normalizePaymentMethod(
      tx.type === "AIRTIME" || tx.type === "DATA" ? "mobile_money" : "bank_transfer"
    ),
    provider: {
      code: tx.provider ?? "turbopay",
      name: tx.provider ?? "turbopay",
      reference: tx.providerRef,
      transactionId: tx.providerRef,
    },
    providerMetadata: tx.metadata
      ? typeof tx.metadata === "string"
        ? JSON.parse(tx.metadata)
        : tx.metadata
      : {},
    riskScore: 0,
    type: mapTxType(tx.type),
    direction: tx.direction === "CREDIT" ? "INBOUND" : "OUTBOUND",
    description: tx.description ?? "",
    events: events.map(mapToCanonicalEvent),
    metadata: {},
    createdAt: String(tx.createdAt),
    updatedAt: String(tx.updatedAt),
    completedAt: tx.state === "SETTLED" ? String(tx.updatedAt) : undefined,
  };
}

export function mapToCanonicalEvent(e: any): CanonicalEvent {
  return {
    id: e.id,
    type: (e.eventType ?? e.step ?? "UNKNOWN") as TurboCoreEventType,
    status: e.status ?? "SUCCESS",
    actor: (e.actor ?? "SYSTEM") as "SYSTEM" | "USER" | "ADMIN" | "PROVIDER",
    actorId: e.actorId,
    payload: e.payload ? (typeof e.payload === "string" ? JSON.parse(e.payload) : e.payload) : {},
    metadata: e.metadata
      ? typeof e.metadata === "string"
        ? JSON.parse(e.metadata)
        : e.metadata
      : {},
    timestamp: String(e.createdAt ?? e.at ?? new Date()),
  };
}

function mapTxType(t: string): PaymentType {
  return (
    (
      {
        FUNDING: "FUNDING",
        TRANSFER: "TRANSFER",
        AIRTIME: "AIRTIME",
        DATA: "DATA",
        BILL: "BILL",
        CARD_FUND: "CARD_FUND",
        CARD_WITHDRAW: "CARD_WITHDRAW",
        SAVINGS_DEPOSIT: "SAVINGS",
        SAVINGS_WITHDRAW: "SAVINGS",
        INVESTMENT: "INVESTMENT",
        CELO_DEPOSIT: "FUNDING",
        CELO_WITHDRAW: "DISBURSEMENT",
      } as Record<string, PaymentType>
    )[t] ?? "COLLECTION"
  );
}

// ===== Currency Registry =====

export const CURRENCY_REGISTRY: Record<string, CanonicalCurrency> = {
  NGN: { code: "NGN", symbol: "₦", decimals: 2, country: "NG", exchangeRate: 1, precision: 100 },
  KES: {
    code: "KES",
    symbol: "KSh",
    decimals: 2,
    country: "KE",
    exchangeRate: 0.087,
    precision: 100,
  },
  GHS: {
    code: "GHS",
    symbol: "GH₵",
    decimals: 2,
    country: "GH",
    exchangeRate: 0.012,
    precision: 100,
  },
  UGX: { code: "UGX", symbol: "USh", decimals: 0, country: "UG", exchangeRate: 0.27, precision: 1 },
  ZAR: {
    code: "ZAR",
    symbol: "R",
    decimals: 2,
    country: "ZA",
    exchangeRate: 0.054,
    precision: 100,
  },
  USD: {
    code: "USD",
    symbol: "$",
    decimals: 2,
    country: "US",
    exchangeRate: 0.00068,
    precision: 100,
  },
  GBP: {
    code: "GBP",
    symbol: "£",
    decimals: 2,
    country: "GB",
    exchangeRate: 0.00053,
    precision: 100,
  },
  EUR: {
    code: "EUR",
    symbol: "€",
    decimals: 2,
    country: "EU",
    exchangeRate: 0.00062,
    precision: 100,
  },
  TZS: { code: "TZS", symbol: "TSh", decimals: 0, country: "TZ", exchangeRate: 1.58, precision: 1 },
  RWF: { code: "RWF", symbol: "FRw", decimals: 0, country: "RW", exchangeRate: 0.87, precision: 1 },
  USDC: {
    code: "USDC",
    symbol: "USDC",
    decimals: 6,
    country: "ALL",
    exchangeRate: 0.00068,
    precision: 1000000,
  },
  cUSD: {
    code: "cUSD",
    symbol: "cUSD",
    decimals: 18,
    country: "ALL",
    exchangeRate: 0.00068,
    precision: 1000000000000000000,
  },
};

export function getCurrency(code: string): CanonicalCurrency | null {
  return CURRENCY_REGISTRY[code] ?? null;
}

export function getAllCurrencies(): CanonicalCurrency[] {
  return Object.values(CURRENCY_REGISTRY);
}
