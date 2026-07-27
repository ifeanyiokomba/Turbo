// TurboCore Provider SDK — The Unified Plugin Interface (Chapter 3)
//
// This is the most important component in TurboCore.
// Every provider becomes a plugin. Never hardcode providers.
//
// Architectural Refinement #2: The SDK is split into capability interfaces
// rather than one enormous interface. A provider implements only the
// interfaces it supports.
//
// Rule Zero: Never build features around providers.
//            Build features around payment capabilities.

import type { ProviderResult } from "./result";

// ===== Capability Interfaces (Refinement #2) =====
// A provider then implements only the interfaces it supports.
// This is cleaner, easier to test, and better reflects how
// current payment providers expose different product sets.

// ----- Lifecycle Provider (required for all) -----
export interface ILifecycleProvider {
  readonly providerCode: string;
  readonly displayName: string;
  readonly version: string;
  initialize(): Promise<ProviderResult<boolean>>;
  authenticate(): Promise<ProviderResult<string>>;
  health(): Promise<ProviderResult<ProviderHealth>>;
  shutdown(): Promise<ProviderResult<boolean>>;
  status(): Promise<ProviderResult<ProviderStatus>>;
}

// ----- Discovery Provider (required for all) -----
export interface IDiscoveryProvider {
  discoverCapabilities(): ProviderCapability[];
  discoverCountries(): string[];
  discoverCurrencies(): string[];
  discoverLimits(): ProviderLimits;
  discoverFees(): ProviderFeeSchedule;
  paymentMethods(): PaymentMethod[];
}

// ----- Collection Provider -----
export interface ICollectionProvider {
  collect(request: CollectRequest): Promise<ProviderResult<CollectResponse>>;
  authorize(reference: string): Promise<ProviderResult<AuthorizeResponse>>;
  capture(reference: string, amount?: number): Promise<ProviderResult<CaptureResponse>>;
  cancel(reference: string): Promise<ProviderResult<CancelResponse>>;
  verify(reference: string): Promise<ProviderResult<VerifyResponse>>;
}

// ----- Payout Provider -----
export interface IPayoutProvider {
  disburse(request: DisburseRequest): Promise<ProviderResult<DisburseResponse>>;
  reverse(reference: string, reason?: string): Promise<ProviderResult<ReverseResponse>>;
  balances(currency?: string): Promise<ProviderResult<BalanceResponse>>;
  transactions(filters?: TransactionFilters): Promise<ProviderResult<TransactionListResponse>>;
}

// ----- Refund Provider -----
export interface IRefundProvider {
  refund(request: RefundRequest): Promise<ProviderResult<RefundResponse>>;
}

// ----- Virtual Account Provider -----
export interface IVirtualAccountProvider {
  createVirtualAccount(
    request: VirtualAccountRequest
  ): Promise<ProviderResult<VirtualAccountResponse>>;
}

// ----- Identity Provider -----
export interface IIdentityProvider {
  verifyIdentity(request: IdentityRequest): Promise<ProviderResult<IdentityResponse>>;
  verifyBusiness(request: BusinessRequest): Promise<ProviderResult<BusinessResponse>>;
}

// ----- Wallet Provider -----
export interface IWalletProvider {
  wallet(request: WalletRequest): Promise<ProviderResult<WalletResponse>>;
}

// ----- FX Provider -----
export interface IFXProvider {
  exchangeRates(request: FXRequest): Promise<ProviderResult<FXResponse>>;
}

// ----- Webhook Provider -----
export interface IWebhookProvider {
  webhook(rawBody: string, headers: Record<string, string>): Promise<ProviderResult<WebhookEvent>>;
}

// ----- Settlement Provider -----
export interface ISettlementProvider {
  settlement(request: SettlementRequest): Promise<ProviderResult<SettlementResponse>>;
  reconcile(reference: string): Promise<ProviderResult<ReconcileResponse>>;
}

// ----- Subscription Provider -----
export interface ISubscriptionProvider {
  subscribe(request: SubscribeRequest): Promise<ProviderResult<SubscribeResponse>>;
  unsubscribe(subscriptionId: string): Promise<ProviderResult<UnsubscribeResponse>>;
}

// ----- Dispute Provider -----
export interface IDisputeProvider {
  resolveDispute(request: DisputeRequest): Promise<ProviderResult<DisputeResponse>>;
}

// ----- Payment Link Provider -----
export interface IPaymentLinkProvider {
  createPaymentLink(request: PaymentLinkRequest): Promise<ProviderResult<PaymentLinkResponse>>;
}

// ----- Invoice Provider -----
export interface IInvoiceProvider {
  createInvoice(request: InvoiceRequest): Promise<ProviderResult<InvoiceResponse>>;
}

// ----- Sync Provider -----
export interface ISyncProvider {
  sync(reference: string): Promise<ProviderResult<TransactionStatus>>;
}

// ===== The Full Provider Plugin Interface =====
// Combines all capability interfaces. Providers implement what they support.
// Optional methods are marked with `?` so providers can skip capabilities they don't support.

export interface IProviderPlugin
  extends
    ILifecycleProvider,
    IDiscoveryProvider,
    Partial<ICollectionProvider>,
    Partial<IPayoutProvider>,
    Partial<IRefundProvider>,
    Partial<IVirtualAccountProvider>,
    Partial<IIdentityProvider>,
    Partial<IWalletProvider>,
    Partial<IFXProvider>,
    Partial<IWebhookProvider>,
    Partial<ISettlementProvider>,
    Partial<ISubscriptionProvider>,
    Partial<IDisputeProvider>,
    Partial<IPaymentLinkProvider>,
    Partial<IInvoiceProvider>,
    Partial<ISyncProvider> {}

// ===== Canonical Types =====

export interface ProviderHealth {
  healthy: boolean;
  latencyMs: number;
  uptime: number;
  lastCheckedAt: string;
  lastSuccess?: string;
  lastFailure?: string;
  successRate: number;
  errorRate: number;
  webhookDelayMs?: number;
  authStatus: "AUTHENTICATED" | "EXPIRED" | "FAILED" | "NONE";
}

export interface ProviderCapability {
  name: string;
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
  | "STABLECOIN"
  | "APPLE_PAY"
  | "GOOGLE_PAY"
  | "PAYMENT_LINK"
  | "INVOICE"
  | "POS"
  | "CASH_PICKUP";

export interface ProviderLimits {
  minAmount: Record<string, number>;
  maxAmount: Record<string, number>;
  dailyVolume: number;
  monthlyVolume: number;
}

export interface ProviderFeeSchedule {
  percentageBps: number;
  fixedFee: Record<string, number>;
  crossBorderBps?: number;
}

// ===== Collection Types =====

export interface CollectRequest {
  reference: string;
  amount: number;
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

export interface AuthorizeResponse {
  providerReference: string;
  status: "AUTHORIZED" | "FAILED";
}

export interface CaptureResponse {
  providerReference: string;
  status: "CAPTURED" | "FAILED";
  amount: number;
}

export interface CancelResponse {
  providerReference: string;
  status: "CANCELLED" | "FAILED";
}

export interface VerifyResponse {
  status: "SUCCESS" | "FAILED" | "PENDING";
  amount: number;
  currency: string;
  fee?: number;
  settledAt?: string;
  customer?: { email?: string; phone?: string; name?: string };
}

// ===== Payout Types =====

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

export interface TransactionFilters {
  from?: string;
  to?: string;
  limit?: number;
  page?: number;
}

export interface TransactionListResponse {
  transactions: TransactionStatus[];
  total: number;
  hasMore: boolean;
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

// ===== Refund Types =====

export interface RefundRequest {
  reference: string;
  originalReference: string;
  amount?: number;
  reason?: string;
}

export interface RefundResponse {
  refundReference: string;
  status: "PENDING" | "SUCCESS" | "FAILED";
  amount: number;
}

// ===== Reverse Types =====

export interface ReverseResponse {
  reverseReference: string;
  status: "SUCCESS" | "FAILED";
}

// ===== Virtual Account Types =====

export interface VirtualAccountRequest {
  customerName: string;
  customerEmail: string;
  country: string;
  bvn?: string;
  nin?: string;
}

export interface VirtualAccountResponse {
  accountNumber: string;
  bankCode: string;
  bankName: string;
  providerReference: string;
}

// ===== Identity Types =====

export interface IdentityRequest {
  userId: string;
  country: string;
  idType: string;
  idValue: string;
}

export interface IdentityResponse {
  verified: boolean;
  tier: number;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface BusinessRequest {
  businessName: string;
  rcNumber?: string;
  tin?: string;
  country: string;
}

export interface BusinessResponse {
  verified: boolean;
  businessName?: string;
  status?: string;
}

// ===== Wallet Types =====

export interface WalletRequest {
  customerId: string;
  currency: string;
  operation: "CREATE" | "CREDIT" | "DEBIT" | "BALANCE";
  amount?: number;
  reference?: string;
}

export interface WalletResponse {
  walletId?: string;
  balance?: number;
  currency: string;
  status: string;
}

// ===== FX Types =====

export interface FXRequest {
  base: string;
  quote: string;
  amount?: number;
}

export interface FXResponse {
  rate: number;
  base: string;
  quote: string;
  fee?: number;
  expiresAt?: string;
}

// ===== Webhook Types =====

export interface WebhookEvent {
  eventId: string;
  eventType: string;
  reference: string;
  status: string;
  amount?: number;
  currency?: string;
  raw: unknown;
}

// ===== Settlement Types =====

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

// ===== Subscription Types =====

export interface SubscribeRequest {
  customerEmail: string;
  plan: string;
  amount: number;
  currency: string;
}

export interface SubscribeResponse {
  subscriptionId: string;
  status: "ACTIVE" | "PENDING";
}

export interface UnsubscribeResponse {
  status: "CANCELLED" | "FAILED";
}

// ===== Dispute Types =====

export interface DisputeRequest {
  disputeId: string;
  resolution: "ACCEPT" | "REJECT" | "EVIDENCE";
  evidence?: string;
}

export interface DisputeResponse {
  status: "RESOLVED" | "UNDER_REVIEW" | "FAILED";
}

// ===== Payment Link Types =====

export interface PaymentLinkRequest {
  title: string;
  amount?: number;
  currency: string;
  description?: string;
}

export interface PaymentLinkResponse {
  linkId: string;
  url: string;
  status: "ACTIVE";
}

// ===== Invoice Types =====

export interface InvoiceRequest {
  customerEmail: string;
  amount: number;
  currency: string;
  description: string;
  dueDate?: string;
}

export interface InvoiceResponse {
  invoiceId: string;
  status: "SENT" | "DRAFT";
  url?: string;
}

// ===== Provider Status =====

export interface ProviderStatus {
  operational: boolean;
  sandbox: boolean;
  version: string;
  features: string[];
  rateLimitRemaining?: number;
  rateLimitResetAt?: string;
  apiVersion?: string;
}
