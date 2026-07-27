// TurboCore Provider SDK — The Unified Plugin Interface
//
// This is the most important component in TurboCore.
// Every provider becomes a plugin. Never hardcode providers.
//
// Every plugin must satisfy this interface. It's far richer than
// basic provider quickstarts because it represents EVERYTHING
// TurboCore expects from a provider — not just payment initiation.
//
// Rule Zero: Never build features around providers.
//            Build features around payment capabilities.

import type { ProviderResult } from "../result";

// ===== The Provider Plugin Interface =====
//
// Every provider (Paystack, Flutterwave, Stripe, MTN, etc.) must
// implement this interface. TurboCore never calls provider-specific
// APIs directly — it always goes through this interface.

export interface IProviderPlugin {
  // ===== Identity =====
  readonly providerCode: string;
  readonly displayName: string;
  readonly version: string;

  // ===== Lifecycle =====
  initialize(): Promise<ProviderResult<boolean>>;
  authenticate(): Promise<ProviderResult<string>>; // returns auth token or session
  health(): Promise<ProviderResult<ProviderHealth>>;

  // ===== Capability Discovery =====
  discoverCapabilities(): ProviderCapability[];
  countries(): string[];
  currencies(): string[];
  paymentMethods(): PaymentMethod[];
  limits(): ProviderLimits;
  fees(): ProviderFeeSchedule;

  // ===== Collection (accept money) =====
  collect(request: CollectRequest): Promise<ProviderResult<CollectResponse>>;
  verify(reference: string): Promise<ProviderResult<VerifyResponse>>;

  // ===== Disbursement (send money) =====
  disburse(request: DisburseRequest): Promise<ProviderResult<DisburseResponse>>;
  getBalance(currency?: string): Promise<ProviderResult<BalanceResponse>>;

  // ===== Post-transaction =====
  refund(request: RefundRequest): Promise<ProviderResult<RefundResponse>>;
  reverse(reference: string, reason?: string): Promise<ProviderResult<ReverseResponse>>;

  // ===== Settlement =====
  settle(request: SettlementRequest): Promise<ProviderResult<SettlementResponse>>;
  reconcile(reference: string): Promise<ProviderResult<ReconcileResponse>>;

  // ===== Sync =====
  sync(reference: string): Promise<ProviderResult<TransactionStatus>>;

  // ===== Webhook =====
  webhook(rawBody: string, headers: Record<string, string>): Promise<ProviderResult<WebhookEvent>>;

  // ===== Status =====
  status(): Promise<ProviderResult<ProviderStatus>>;
}

// ===== Canonical Types =====

export interface ProviderHealth {
  healthy: boolean;
  latencyMs: number;
  uptime: number; // 0-100
  lastCheckedAt: string;
}

export interface ProviderCapability {
  name: string; // "CARD" | "BANK_TRANSFER" | "MOBILE_MONEY" | "QR" | "USSD" | ...
  direction: "INBOUND" | "OUTBOUND" | "BOTH";
  countries: string[];
  currencies: string[];
}

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

export interface ProviderLimits {
  minAmount: Record<string, number>; // per currency
  maxAmount: Record<string, number>;
  dailyVolume: number;
  monthlyVolume: number;
}

export interface ProviderFeeSchedule {
  percentageBps: number; // basis points (e.g., 180 = 1.8%)
  fixedFee: Record<string, number>; // per currency
  crossBorderBps?: number;
}

export interface CollectRequest {
  reference: string;
  amount: number; // minor units
  currency: string;
  method: PaymentMethod;
  customer: { id?: string; email?: string; phone?: string; name?: string };
  metadata?: Record<string, unknown>;
  redirectUrl?: string;
  webhookUrl?: string;
}

export interface CollectResponse {
  providerReference: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "3DS_REQUIRED";
  authUrl?: string;
  authMethod?: string;
}

export interface VerifyResponse {
  status: "SUCCESS" | "FAILED" | "PENDING";
  amount: number;
  currency: string;
  fee?: number;
  settledAt?: string;
  customer?: { email?: string; phone?: string; name?: string };
}

export interface DisburseRequest {
  reference: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  recipient: {
    type: "BANK" | "WALLET" | "MOBILE_MONEY";
    accountNumber?: string;
    bankCode?: string;
    bankName?: string;
    phone?: string;
    walletProvider?: string;
    name: string;
  };
  narration?: string;
}

export interface DisburseResponse {
  providerReference: string;
  status: "PENDING" | "SUCCESS" | "FAILED";
  fee?: number;
}

export interface BalanceResponse {
  available: number;
  pending: number;
  currency: string;
}

export interface RefundRequest {
  reference: string;
  originalReference: string;
  amount?: number; // partial refund if specified
  reason?: string;
}

export interface RefundResponse {
  refundReference: string;
  status: "PENDING" | "SUCCESS" | "FAILED";
  amount: number;
}

export interface ReverseResponse {
  reverseReference: string;
  status: "SUCCESS" | "FAILED";
}

export interface SettlementRequest {
  from: string;
  to: string;
  amount: number;
  currency: string;
  reference: string;
}

export interface SettlementResponse {
  settlementReference: string;
  status: "PENDING" | "SETTLED" | "FAILED";
  settledAt?: string;
}

export interface ReconcileResponse {
  matched: boolean;
  expectedAmount: number;
  actualAmount: number;
  difference: number;
  status: "MATCHED" | "MISMATCH" | "MISSING";
}

export interface TransactionStatus {
  reference: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "REVERSED";
  amount: number;
  currency: string;
  providerReference: string;
  fee?: number;
  settledAt?: string;
}

export interface WebhookEvent {
  eventId: string;
  eventType: string;
  reference: string;
  status: string;
  amount?: number;
  currency?: string;
  raw: unknown;
}

export interface ProviderStatus {
  operational: boolean;
  sandbox: boolean;
  version: string;
  features: string[];
  rateLimitRemaining?: number;
  rateLimitResetAt?: string;
}
