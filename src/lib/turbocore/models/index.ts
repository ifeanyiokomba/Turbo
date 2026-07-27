// TurboCore Canonical Models
//
// Rule 2: Never store provider-specific objects in the database.
// Create canonical TurboCore entities and map provider responses to them.

export interface CanonicalPayment {
  id: string;
  reference: string;
  type: PaymentType;
  direction: "INBOUND" | "OUTBOUND";
  status: PaymentStatus;
  state: PaymentState;
  amount: CanonicalMoney;
  fee: CanonicalMoney;
  total: CanonicalMoney;
  customer: CanonicalCustomer;
  recipient?: CanonicalRecipient;
  provider: ProviderInfo;
  method: PaymentMethod;
  description: string;
  metadata: Record<string, unknown>;
  events: CanonicalEvent[];
  createdAt: string;
  updatedAt: string;
  settledAt?: string;
}

export interface CanonicalMoney {
  amount: number;
  currency: string;
}

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
export type PaymentStatus =
  | "PENDING"
  | "AUTHORIZED"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "REVERSED"
  | "REFUNDED"
  | "CANCELLED";
export type PaymentState =
  | "INITIATED"
  | "PIN_VERIFIED"
  | "AML_CHECKED"
  | "HOLD_POSTED"
  | "PROVIDER_CALLED"
  | "SETTLED"
  | "REVERSED"
  | "FAILED";
export type PaymentMethod =
  | "CARD"
  | "BANK_TRANSFER"
  | "MOBILE_MONEY"
  | "WALLET"
  | "QR"
  | "USSD"
  | "VIRTUAL_ACCOUNT"
  | "CRYPTO"
  | "APPLE_PAY"
  | "GOOGLE_PAY";

export interface CanonicalCustomer {
  id: string;
  reference: string;
  type: "INDIVIDUAL" | "BUSINESS";
  firstName?: string;
  lastName?: string;
  fullName: string;
  email?: string;
  phone?: string;
  country: string;
  kycTier: number;
  kycStatus: "UNVERIFIED" | "PENDING" | "VERIFIED";
  status: "ACTIVE" | "FROZEN" | "SUSPENDED" | "CLOSED";
  walletId?: string;
  createdAt: string;
  updatedAt: string;
}

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

export interface ProviderInfo {
  code: string;
  name: string;
  reference?: string;
  method?: string;
  responseCode?: string;
  responseMessage?: string;
}
export interface CanonicalEvent {
  id: string;
  type: string;
  status: "PENDING" | "SUCCESS" | "FAILED";
  actor: "SYSTEM" | "USER" | "ADMIN" | "PROVIDER";
  actorId?: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  timestamp: string;
}
export interface CanonicalWebhook {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  reference: string;
  status: string;
  amount?: CanonicalMoney;
  customer?: { email?: string; phone?: string; name?: string };
  raw: unknown;
  signatureValid: boolean;
  processedAt?: string;
  receivedAt: string;
}
export interface CanonicalWallet {
  id: string;
  customerId: string;
  currency: string;
  available: number;
  pending: number;
  reserved: number;
  frozen: number;
  status: "ACTIVE" | "FROZEN" | "CLOSED";
  version: number;
}
export interface CanonicalLedgerEntry {
  id: string;
  walletId: string;
  entryType: "DEBIT" | "CREDIT";
  amount: CanonicalMoney;
  refType: string;
  refId?: string;
  pairId?: string;
  balanceAfter: number;
  description: string;
  immutable: boolean;
  createdAt: string;
}
export interface CanonicalKycVerification {
  id: string;
  customerId: string;
  tier: number;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  idType: string;
  idValue: string;
  provider: string;
  verifiedAt?: string;
  details?: { firstName?: string; lastName?: string; phone?: string; email?: string; dob?: string };
  createdAt: string;
}
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

// ===== Mapping Helpers =====
export function mapToCanonicalPayment(tx: any, events: any[] = []): CanonicalPayment {
  return {
    id: tx.id,
    reference: tx.reference,
    type: mapTxType(tx.type),
    direction: tx.direction === "CREDIT" ? "INBOUND" : "OUTBOUND",
    status: mapTxStatus(tx.status),
    state: mapTxState(tx.state),
    amount: { amount: tx.amountKobo, currency: "NGN" },
    fee: { amount: tx.feeKobo ?? 0, currency: "NGN" },
    total: { amount: tx.amountKobo + (tx.feeKobo ?? 0), currency: "NGN" },
    customer: {
      id: tx.userId,
      reference: tx.userId,
      type: "INDIVIDUAL",
      fullName: "",
      country: "NG",
      kycTier: 1,
      kycStatus: "UNVERIFIED",
      status: "ACTIVE",
      createdAt: String(tx.createdAt),
      updatedAt: String(tx.updatedAt),
    },
    recipient: tx.counterpartyName
      ? {
          type: "BANK",
          name: tx.counterpartyName,
          accountNumber: tx.counterpartyAccount,
          bankName: tx.counterpartyBank,
        }
      : undefined,
    provider: {
      code: tx.provider ?? "turbopay",
      name: tx.provider ?? "turbopay",
      reference: tx.providerRef,
    },
    method: "BANK_TRANSFER",
    description: tx.description ?? "",
    metadata: tx.metadata
      ? typeof tx.metadata === "string"
        ? JSON.parse(tx.metadata)
        : tx.metadata
      : {},
    events: events.map(mapToCanonicalEvent),
    createdAt: String(tx.createdAt),
    updatedAt: String(tx.updatedAt),
    settledAt: tx.state === "SETTLED" ? String(tx.updatedAt) : undefined,
  };
}

export function mapToCanonicalEvent(e: any): CanonicalEvent {
  return {
    id: e.id,
    type: e.eventType ?? e.step ?? e.action ?? "UNKNOWN",
    status: e.status ?? "SUCCESS",
    actor: (e.actor ?? "SYSTEM") as any,
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
function mapTxStatus(s: string): PaymentStatus {
  return (
    (
      { PENDING: "PENDING", SUCCESS: "SUCCESS", FAILED: "FAILED", REVERSED: "REVERSED" } as Record<
        string,
        PaymentStatus
      >
    )[s] ?? "PENDING"
  );
}
function mapTxState(s: string): PaymentState {
  return (
    (
      {
        INITIATED: "INITIATED",
        PIN_VERIFIED: "PIN_VERIFIED",
        AML_CHECKED: "AML_CHECKED",
        HOLD_POSTED: "HOLD_POSTED",
        PROVIDER_CALLED: "PROVIDER_CALLED",
        SETTLED: "SETTLED",
        REVERSED: "REVERSED",
        FAILED: "FAILED",
      } as Record<string, PaymentState>
    )[s] ?? "INITIATED"
  );
}
