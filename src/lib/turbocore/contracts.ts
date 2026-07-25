// TurboCore — 11 provider contracts. Every method returns Promise<ProviderResult<T>>.

import type { ProviderResult, Bank, Biller, Network, DataPlan, InternationalBeneficiary, TimelineEvent } from "./result";

// 1. Virtual account issuance (Monnify, Paystack DVA)
export interface IVirtualAccountProvider {
  readonly contract: "VIRTUAL_ACCOUNT";
  listSupportedBanks(country: string): Promise<ProviderResult<Bank[]>>;
  createVirtualAccount(req: {
    userId: string;
    accountName: string;
    country: string;
    bvn?: string;
    nin?: string;
  }): Promise<ProviderResult<{ accountNumber: string; bankCode: string; bankName: string; providerRef: string }>>;
  getAccountStatus(providerRef: string): Promise<ProviderResult<{ status: string; accountNumber: string }>>;
  deactivateVirtualAccount(providerRef: string): Promise<ProviderResult<{ deactivated: boolean }>>;
  resolveAccountName(req: { accountNumber: string; bankCode: string; country: string }): Promise<ProviderResult<{ accountName: string; bankName: string }>>;
}

// 2. Card payments (Paystack, Flutterwave, Stripe)
export interface ICardPaymentProvider {
  readonly contract: "CARD_PAYMENT";
  initializeCharge(req: {
    amountMinor: number;
    currency: string;
    reference: string;
    customer: { email?: string; phone?: string; name?: string };
    metadata?: Record<string, unknown>;
  }): Promise<ProviderResult<{ providerRef: string; status: "PENDING" | "SUCCESS" | "3DS_REQUIRED"; authUrl?: string }>>;
  verifyCharge(providerRef: string): Promise<ProviderResult<{ status: string; amountSettledMinor: number; currency: string }>>;
  refund(req: { providerRef: string; amountMinor?: number; reason?: string }): Promise<ProviderResult<{ refundRef: string; status: string }>>;
}

// 3. Bank transfers (Paystack, Flutterwave, OnePipe)
export interface IBankTransferProvider {
  readonly contract: "BANK_TRANSFER";
  listBanks(country: string): Promise<ProviderResult<Bank[]>>;
  resolveAccountName(req: { accountNumber: string; bankCode: string; country: string }): Promise<ProviderResult<{ accountName: string; bankName: string }>>;
  initiateTransfer(req: {
    reference: string;
    amountMinor: number;
    currency: string;
    beneficiary: { name: string; accountNumber: string; bankCode: string };
    narration?: string;
  }): Promise<ProviderResult<{ providerRef: string; status: "PENDING" | "SUCCESS" | "FAILED" }>>;
  getTransferStatus(providerRef: string): Promise<ProviderResult<{ status: string; settlementTime?: string }>>;
  reverseTransfer(req: { providerRef: string; reason: string }): Promise<ProviderResult<{ reversalRef: string; status: string }>>;
}

// 4. Bill payments (Baxi, Remita, Quickteller)
export interface IBillPaymentProvider {
  readonly contract: "BILL_PAYMENT";
  listBillers(req: { country: string; category?: string }): Promise<ProviderResult<Biller[]>>;
  validateCustomer(req: { billerCode: string; customerRef: string; country: string }): Promise<ProviderResult<{ customerName: string; valid: boolean; metadata?: Record<string, unknown> }>>;
  payBill(req: {
    reference: string;
    billerCode: string;
    customerRef: string;
    amountMinor: number;
    currency: string;
    productCode?: string;
  }): Promise<ProviderResult<{ providerRef: string; status: string; token?: string; units?: string; receipt?: string }>>;
  queryBillPayment(providerRef: string): Promise<ProviderResult<{ status: string; token?: string }>>;
}

// 5. Airtime & data (Baxi, Quickteller, provider-direct)
export interface IAirtimeProvider {
  readonly contract: "AIRTIME";
  listNetworks(country: string): Promise<ProviderResult<Network[]>>;
  listDataPlans(req: { country: string; network: string }): Promise<ProviderResult<DataPlan[]>>;
  purchase(req: {
    reference: string;
    type: "AIRTIME" | "DATA";
    phone: string;
    network: string;
    amountMinor?: number;
    planCode?: string;
    currency: string;
  }): Promise<ProviderResult<{ providerRef: string; status: string }>>;
  getStatus(providerRef: string): Promise<ProviderResult<{ status: string }>>;
}

// 6. KYC (Dojah, Smile ID, VerifyMe)
export interface IKYCProvider {
  readonly contract: "KYC";
  verifyIdentity(req: {
    userId: string;
    country: string;
    idType: string; // NIN | BVN | KRA_PIN | GHANA_CARD | SA_ID
    idValue: string;
  }): Promise<ProviderResult<{ tier: number; verified: boolean; firstName?: string; lastName?: string; phone?: string }>>;
}

// 7. Notifications (Termii, Resend, GetOTP, Firebase)
export interface INotificationProvider {
  readonly contract: "NOTIFICATION";
  send(req: {
    channel: "SMS" | "EMAIL" | "PUSH" | "WHATSAPP";
    to: string;
    templateId?: string;
    subject?: string;
    body: string;
    variables?: Record<string, string>;
  }): Promise<ProviderResult<{ messageId: string; status: string }>>;
  getDeliveryStatus(messageId: string): Promise<ProviderResult<{ status: string; deliveredAt?: string }>>;
}

// 8. International transfers (Wise, Flutterwave borderless)
export interface IInternationalTransferProvider {
  readonly contract: "INTERNATIONAL_TRANSFER";
  getQuote(req: {
    sourceCurrency: string;
    targetCurrency: string;
    amountMinor: number;
    direction: "OUTBOUND" | "INBOUND";
  }): Promise<ProviderResult<{ rate: number; feeMinor: number; totalMinor: number; expiresAt: string }>>;
  sendTransfer(req: {
    reference: string;
    beneficiary: InternationalBeneficiary;
    amountMinor: number;
    currency: string;
    narration?: string;
  }): Promise<ProviderResult<{ providerRef: string; status: string; estimatedDelivery?: string }>>;
  getTransferStatus(providerRef: string): Promise<ProviderResult<{ status: string; timeline: TimelineEvent[] }>>;
  cancelTransfer(providerRef: string): Promise<ProviderResult<{ status: string }>>;
}

// 9. Mobile money (M-Pesa, MTN MoMo, Airtel Money)
export interface IMobileMoneyProvider {
  readonly contract: "MOBILE_MONEY";
  getBalance(req: { walletProvider: string; phone: string }): Promise<ProviderResult<{ balanceMinor: number; currency: string }>>;
  collect(req: {
    reference: string;
    phone: string;
    walletProvider: string;
    amountMinor: number;
    currency: string;
    narration?: string;
  }): Promise<ProviderResult<{ providerRef: string; status: string }>>; // STK push
  disburse(req: {
    reference: string;
    phone: string;
    walletProvider: string;
    amountMinor: number;
    currency: string;
  }): Promise<ProviderResult<{ providerRef: string; status: string }>>; // B2C payout
  getStatus(providerRef: string): Promise<ProviderResult<{ status: string }>>;
}

// 10. Exchange rates (Paystack, Flutterwave, Wise, open-market)
export interface IExchangeRateProvider {
  readonly contract: "EXCHANGE_RATE";
  getRate(req: { base: string; quote: string }): Promise<ProviderResult<{ rate: number; source: string; timestamp: string }>>;
  listSupported(): Promise<ProviderResult<{ pairs: { base: string; quote: string }[] }>>;
}

// 11. Virtual card issuer (Stripe Issuing, Turbopay-Cards mock)
export interface IVirtualCardIssuer {
  readonly contract: "VIRTUAL_CARD_ISSUER";
  issueCard(req: {
    userId: string;
    cardholder: string;
    currency: string;
    type: "VISA" | "MASTERCARD";
    spendingLimitMinor: number;
  }): Promise<ProviderResult<{ providerRef: string; panEnc: string; cvvEnc: string; last4: string; expiry: string }>>;
  fundCard(req: { providerRef: string; amountMinor: number; currency: string }): Promise<ProviderResult<{ status: string }>>;
  withdrawCard(req: { providerRef: string; amountMinor: number }): Promise<ProviderResult<{ status: string }>>;
  freezeCard(providerRef: string): Promise<ProviderResult<{ status: string }>>;
  unfreezeCard(providerRef: string): Promise<ProviderResult<{ status: string }>>;
  terminateCard(providerRef: string): Promise<ProviderResult<{ status: string; refundedMinor?: number }>>;
}

// Union of all contract interfaces for registry typing
export type AnyContract =
  | IVirtualAccountProvider
  | ICardPaymentProvider
  | IBankTransferProvider
  | IBillPaymentProvider
  | IAirtimeProvider
  | IKYCProvider
  | INotificationProvider
  | IInternationalTransferProvider
  | IMobileMoneyProvider
  | IExchangeRateProvider
  | IVirtualCardIssuer;
