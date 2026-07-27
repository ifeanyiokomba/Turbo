// TurboCore — 11 provider contracts. Every method returns Promise<ProviderResult<T>>.

import type { ProviderResult, Bank, Biller, Network, DataPlan, InternationalBeneficiary, TimelineEvent } from "./result";

// Re-export ProviderResult so adapter files can import everything they need
// from a single module path.
export type { ProviderResult } from "./result";

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

  // ─── Deep methods (optional — implemented per provider) ────────────────────
  //
  // M-PESA (Daraja) — reversal, B2C status, C2B registration/simulation,
  // account balance, transaction status. B2C/Reversal/AccountBalance/
  // TransactionStatus require SecurityCredential (initiator's password
  // RSA-encrypted with M-Pesa's public cert); if not configured, adapters
  // should return mock data in non-prod or AUTH_FAILED in prod.

  /** POST /mpesa/reversal/v1/request — reverse a completed transaction. */
  reverseTransaction?(req: {
    transactionId: string;
    amountMinor?: number;
    receiverParty?: string;
    remarks?: string;
  }): Promise<ProviderResult<{ reversalRef: string; status: string }>>;

  /** POST /mpesa/transactionstatus/v1/query — query B2C transaction status. */
  getB2CStatus?(req: {
    commandID?: string;
    transactionID: string;
    partyA?: string;
    identifierType?: string;
    remarks?: string;
    occasion?: string;
  }): Promise<ProviderResult<{ status: string; conversationId?: string; originatorConversationId?: string }>>;

  /** POST /mpesa/c2b/v1/register/url — register C2B validation/confirmation URLs. */
  registerC2BUrl?(req: {
    validationURL: string;
    confirmationURL: string;
    responseType: "Completed" | "Cancelled";
    shortCode: string;
  }): Promise<ProviderResult<{ responseCode: string; responseDescription: string }>>;

  /** POST /mpesa/c2b/v1/simulate — simulate a C2B payment (sandbox only). */
  simulateC2B?(req: {
    commandID: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline";
    amountMinor: number;
    msisdn: string;
    billRefNumber: string;
    shortCode: string;
  }): Promise<ProviderResult<{ conversationId?: string; responseCode: string; responseDescription: string }>>;

  /** POST /mpesa/accountbalance/v1/query — query account balance (async via callback). */
  getAccountBalance?(req: {
    initiator?: string;
    commandID?: string;
    partyA?: string;
    identifierType?: string;
    remarks?: string;
  }): Promise<ProviderResult<{ conversationId?: string; responseCode: string; responseDescription: string; balanceMinor?: number; currency?: string }>>;

  /** POST /mpesa/transactionstatus/v1/query — generic transaction status query. */
  getTransactionStatus?(req: {
    commandID?: string;
    transactionID: string;
    partyA?: string;
    identifierType?: string;
    remarks?: string;
    occasion?: string;
  }): Promise<ProviderResult<{ status: string; conversationId?: string; originatorConversationId?: string }>>;

  // MTN MoMo — pre-approval, delivery notification, account holder info,
  // disbursement-specific transfer (separate token from collection).

  /** POST /collection/v2_0/preapproval — merchant pre-approves a payment from customer. */
  createPreApproval?(req: {
    payerId: string;
    payerIdType: "MSISDN" | "EMAIL" | "PARTY_CODE";
    currency: string;
    proposedAmountMinor: number;
    externalId?: string;
  }): Promise<ProviderResult<{ referenceId: string; status: string }>>;

  /** POST /collection/v2_0/deliverynotification/:referenceId — notify customer of delivery. */
  sendDeliveryNotification?(req: {
    referenceId: string;
    note?: string;
    message?: string;
  }): Promise<ProviderResult<{ status: string }>>;

  /** GET /collection/v2_0/accountholder/:type/:id/basicuserinfo — basic account holder info. */
  getAccountHolderBasicInfo?(req: {
    accountHolderId: string;
    accountHolderIdType: "MSISDN" | "EMAIL" | "PARTY_CODE";
  }): Promise<ProviderResult<{ name?: string; surname?: string; msisdn?: string; status?: string }>>;

  /** GET /collection/v2_0/accountholder/:type/:id/active — check account holder activity. */
  isAccountHolderActive?(req: {
    accountHolderId: string;
    accountHolderIdType: "MSISDN" | "EMAIL" | "PARTY_CODE";
  }): Promise<ProviderResult<{ active: boolean }>>;

  /** POST /disbursement/v2_0/transfer — disbursement-specific transfer (separate token). */
  disburseTransfer?(req: {
    amountMinor: number;
    currency: string;
    externalId: string;
    payee: { partyIdType: "MSISDN" | "EMAIL" | "PARTY_CODE"; partyId: string };
    payerMessage?: string;
    payeeNote?: string;
  }): Promise<ProviderResult<{ referenceId: string; status: string }>>;

  /** GET /disbursement/v2_0/transfer/:referenceId — disbursement transfer status. */
  getDisbursementTransferStatus?(referenceId: string): Promise<ProviderResult<{ status: string; financialTransactionId?: string }>>;

  /** GET /disbursement/v2_0/account/balance — disbursement account balance. */
  getDisbursementAccountBalance?(): Promise<ProviderResult<{ balanceMinor: number; currency: string; availableBalanceMinor?: number }>>;

  // AIRTEL MONEY — KYC verification, refund, merchant payment.

  /** POST /merchant/v1/kyc/verify — verify Airtel customer KYC. */
  verifyKyc?(req: {
    msisdn: string;
    first_name?: string;
    last_name?: string;
    address?: string;
  }): Promise<ProviderResult<{ verified: boolean; kycLevel?: string; msisdn?: string }>>;

  /** POST /merchant/v1/payments/:id/refund — refund a completed payment. */
  refundTransaction?(req: {
    payment_id: string;
    refund_amountMinor?: number;
    reference?: string;
  }): Promise<ProviderResult<{ refundId: string; status: string }>>;

  /** POST /merchant/v1/payments — merchant collect from customer (alternative collect flow). */
  merchantPayment?(req: {
    reference: string;
    subscriber: { country: string; currency: string; msisdn: string };
    transaction: { amountMinor: number; country: string; currency: string; id: string };
  }): Promise<ProviderResult<{ providerRef: string; status: string }>>;

  // SMARTCASH PSB — wallet transfer, account verification, transaction history.
  // (Bank transfer / airtime / bill payment are exposed via separate
  // IBankTransferProvider / IAirtimeProvider / IBillPaymentProvider exports.)

  /** POST /v1/transfers/wallet — Smartcash wallet-to-wallet transfer. */
  transferWallet?(req: {
    reference: string;
    fromPhone: string;
    toPhone: string;
    amountMinor: number;
    narration?: string;
  }): Promise<ProviderResult<{ providerRef: string; status: string }>>;

  /** GET /v1/accounts/verify?phone= — verify Smartcash account exists. */
  verifyAccount?(req: { phone: string }): Promise<ProviderResult<{ valid: boolean; accountName?: string; status?: string }>>;

  /** GET /v1/transactions/history — fetch transaction history for a phone. */
  getTransactionHistory?(req: {
    phone: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }): Promise<ProviderResult<{ transactions: Array<{ id: string; type: string; amountMinor: number; currency: string; status: string; timestamp: string }> }>>;
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

// 12. AML screening (Dojah AML, sanctions, PEPs, transaction screening)
export interface IAMLProvider {
  readonly contract: "AML";
  screenName(req: {
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
  }): Promise<ProviderResult<{ hit: boolean; matches?: AMLMatch[]; screeningId?: string }>>;
  screenTransaction(req: {
    amountMinor: number;
    currency: string;
    senderName: string;
    senderCountry?: string;
    beneficiaryName: string;
    beneficiaryCountry?: string;
  }): Promise<ProviderResult<{ hit: boolean; riskScore: number; matches?: AMLMatch[]; screeningId?: string }>>;
  getAMLPeps(req: { name: string; country?: string }): Promise<ProviderResult<{ matches: AMLMatch[] }>>;
  getAMLSanctions(req: { name: string; country?: string }): Promise<ProviderResult<{ matches: AMLMatch[] }>>;
}

// 13. Business KYC (Dojah CAC/TIN/business name verification)
export interface IBusinessKYCProvider {
  readonly contract: "BUSINESS_KYC";
  verifyRCNumber(req: {
    rcNumber: string;
    companyType?: string;
  }): Promise<ProviderResult<{ verified: boolean; companyName?: string; address?: string; status?: string; directors?: string[] }>>;
  verifyTIN(req: { tin: string }): Promise<ProviderResult<{ verified: boolean; companyName?: string; tin?: string; status?: string }>>;
  verifyBusinessName(req: { businessName: string }): Promise<ProviderResult<{ verified: boolean; matches?: BusinessMatch[] }>>;
}

// 14. Fraud screening (Dojah phone/email/IP reputation + card BIN lookup)
export interface IFraudScreeningProvider {
  readonly contract: "FRAUD_SCREENING";
  screenPhone(req: { phone: string }): Promise<ProviderResult<{ riskScore: number; carrier?: string; country?: string; ported?: boolean; valid?: boolean }>>;
  screenEmail(req: { email: string }): Promise<ProviderResult<{ riskScore: number; deliverable?: boolean; breached?: boolean; breaches?: number }>>;
  screenIP(req: { ip: string }): Promise<ProviderResult<{ riskScore: number; country?: string; city?: string; proxy?: boolean; vpn?: boolean; isp?: string }>>;
  checkBIN(req: { bin: string }): Promise<ProviderResult<{ bank?: string; brand?: string; type?: string; country?: string }>>;
}

// 15. OTP delivery + verification (Termii OTP across SMS/Voice/WhatsApp/Email)
export interface IOTPProvider {
  readonly contract: "OTP";
  sendOTP(req: {
    to: string;
    channel?: "SMS" | "VOICE" | "WHATSAPP" | "EMAIL";
    messageType?: string;
    pinAttempts?: number;
    pinTimeToLive?: number;
    pinLength?: number;
    pinPlaceholder?: string;
    messageText?: string;
  }): Promise<ProviderResult<{ pinId: string; status: string; deliveredTo?: string }>>;
  verifyOTP(req: { pinId: string; pin: string }): Promise<ProviderResult<{ verified: boolean; status: string }>>;
  sendVoiceOTP(req: { to: string; pinAttempts?: number; pinTimeToLive?: number; pinLength?: number }): Promise<ProviderResult<{ pinId: string; status: string }>>;
  sendWhatsAppOTP(req: { to: string; pinAttempts?: number; pinTimeToLive?: number; pinLength?: number }): Promise<ProviderResult<{ pinId: string; status: string }>>;
}

// 16. International recipient CRUD (Wise recipients — create/list/get/update/delete)
export interface IRecipientProvider {
  readonly contract: "RECIPIENT";
  createRecipient(req: {
    profileId: string;
    currency: string;
    type: string; // iban | swift_code | sort_code | bsb_code | aba | iban | swift
    accountHolderName: string;
    bankDetails?: Record<string, unknown>;
  }): Promise<ProviderResult<{ recipientId: string; currency: string; type: string; active: boolean }>>;
  listRecipients(req: { profileId: string }): Promise<ProviderResult<{ recipients: RecipientSummary[] }>>;
  getRecipient(id: string): Promise<ProviderResult<{ id: string; name: string; currency: string; type: string; bankDetails?: Record<string, unknown> }>>;
  updateRecipient(id: string, req: Partial<{ accountHolderName: string; bankDetails: Record<string, unknown> }>): Promise<ProviderResult<{ id: string; updated: boolean }>>;
  deleteRecipient(id: string): Promise<ProviderResult<{ deleted: boolean }>>;
}

// 17. Multi-currency balance (Wise Balance Accounts — wallets in 50+ currencies)
export interface IMultiCurrencyBalanceProvider {
  readonly contract: "MULTI_CURRENCY_BALANCE";
  getBalances(req: { profileId: string }): Promise<ProviderResult<{ balances: BalanceSummary[] }>>;
  getBalance(balanceId: string): Promise<ProviderResult<{ id: string; currency: string; amountMinor: number; type?: string; bankDetails?: Record<string, unknown> }>>;
}

// 18. Split payment subaccounts (Paystack, Flutterwave, Monnify)
//
// Multi-marketplace split settlement. A subaccount represents a counterparty
// (seller, vendor, marketplace merchant) that receives a slice of every charge.
/** Common summary shape returned by every split-payment provider. The fields
 *  beyond `subaccountCode` / `subaccountId` are optional because Monnify,
 *  Paystack and Flutterwave each expose a different subset. */
export interface ISubaccountSummary {
  subaccountCode: string;
  subaccountId: string;
  accountName?: string;
  bankCode?: string;
  accountNumber?: string;
  defaultPercentage?: number;
  // Paystack extras
  businessName?: string;
  currency?: string;
  percentageCharge?: number;
  settlementBank?: string;
  // Flutterwave extras
  splitType?: string;
  splitValue?: number;
}

export interface ISplitPaymentProvider {
  readonly contract: "SPLIT_PAYMENT";
  createSubaccount(req: {
    // Monnify variant (existing)
    currency?: string;
    bankCode?: string;
    email?: string;
    defaultPercentage?: number;
    // Paystack variant
    businessName?: string;
    settlementBank?: string;
    percentageCharge?: number;
    description?: string;
    // Flutterwave variant
    accountName?: string;
    accountBank?: string;
    splitType?: "PERCENTAGE" | "FLAT";
    splitValue?: number;
    // Shared
    accountNumber: string;
  }): Promise<ProviderResult<ISubaccountSummary>>;
  listSubaccounts(req?: { perPage?: number; page?: number }): Promise<ProviderResult<ISubaccountSummary[]>>;
  /** Paystack/Flutterwave: GET /subaccount/:id or /subaccounts/:id */
  fetchSubaccount?(id: string): Promise<ProviderResult<ISubaccountSummary>>;
  /** Paystack/Flutterwave: PUT /subaccount/:id or /subaccounts/:id */
  updateSubaccount?(id: string, req: Partial<{
    businessName: string;
    settlementBank: string;
    accountNumber: string;
    percentageCharge: number;
    splitType: string;
    splitValue: number;
    defaultPercentage: number;
  }>): Promise<ProviderResult<ISubaccountSummary>>;
  /** Paystack/Flutterwave: DELETE /subaccount/:id or /subaccounts/:id */
  deleteSubaccount?(id: string): Promise<ProviderResult<{ deleted: boolean }>>;
}

// 19. Invoices (Monnify, Paystack Payment Requests, Stripe, Remita e-Invoice)
//
// A billable document sent to a customer; the provider hosts the checkout and
// notifies the merchant when paid.
export interface IInvoiceProvider {
  readonly contract: "INVOICE";
  createInvoice(req: {
    amountMinor: number;
    description: string;
    customerName: string;
    customerEmail: string;
    expiryDate?: string;
    currency?: string;
  }): Promise<ProviderResult<{ invoiceReference: string; checkoutUrl?: string; status: string }>>;
  getInvoiceStatus(invoiceReference: string): Promise<ProviderResult<{ status: string; amountPaidMinor?: number }>>;
  getInvoiceDetails(invoiceReference: string): Promise<ProviderResult<{ status: string; amountMinor: number; customerEmail: string; description: string; createdAt: string; paidAt?: string }>>;
}

// 20. Direct debit mandates (Monnify, Remita, Paga)
//
// A mandate authorizes the merchant to debit a customer's account on a schedule
// without requiring a fresh authorization for each charge.
export interface IDirectDebitProvider {
  readonly contract: "DIRECT_DEBIT";
  createMandate(req: {
    mandateType?: string;
    payerName: string;
    payerEmail?: string;
    payerPhone?: string;
    amountMinor: number;
    currency?: string;
    startDate?: string;
    endDate?: string;
    frequency?: string; // DAILY | WEEKLY | MONTHLY | QUARTERLY | ANNUALLY
    accountNumber?: string;
    bankCode?: string;
    narration?: string;
  }): Promise<ProviderResult<{ mandateId: string; status: string; authUrl?: string }>>;
  getMandateStatus(mandateId: string): Promise<ProviderResult<{ status: string; mandateId: string }>>;
  debitMandate(req: { mandateId: string; amountMinor: number; narration?: string }): Promise<ProviderResult<{ providerRef: string; status: string }>>;
  stopMandate(mandateId: string): Promise<ProviderResult<{ status: string; mandateId: string }>>;
}

// 21. Card tokenization (Interswitch Quickteller)
//
// Exchanges a raw PAN for a single-use or multi-use token that can be charged
// later without re-entering card details.
export interface ICardTokenizationProvider {
  readonly contract: "CARD_TOKENIZATION";
  tokenizeCard(req: {
    pan: string;
    expiryDate: string; // MM/YY or MM/YYYY
    cvv: string;
    pin?: string;
    mobileNo?: string;
  }): Promise<ProviderResult<{ token: string; expiryDate?: string; maskedPan?: string }>>;
  chargeTokenizedCard(req: {
    token: string;
    amountMinor: number;
    currency: string;
    requestReference: string;
  }): Promise<ProviderResult<{ providerRef: string; status: string }>>;
}

// 22. Recurring billing — plans + subscriptions (Paystack, Flutterwave, Stripe)
//
// Subscriptions enable recurring card charges. Plans define the amount +
// interval; subscriptions bind a customer to a plan.
export interface IPlan {
  code: string;
  name: string;
  amountMinor: number;
  currency: string;
  interval: string; // DAILY | WEEKLY | MONTHLY | YEARLY
  invoiceLimit?: number;
}
export interface ISubscription {
  code: string;
  customer: string;
  plan: string;
  status: string;
  startDate?: string;
  items?: Array<{ price: string; quantity?: number }>;
}
export interface IRecurringBillingProvider {
  readonly contract: "RECURRING_BILLING";
  // Plans (Paystack: POST /plan, Flutterwave: POST /payment-plans)
  createPlan?(req: {
    name: string;
    amountMinor: number;
    interval: string;
    currency: string;
    invoiceLimit?: number;
  }): Promise<ProviderResult<IPlan>>;
  listPlans?(req?: { perPage?: number; page?: number }): Promise<ProviderResult<{ plans: IPlan[]; total?: number; meta?: Record<string, unknown> }>>;
  fetchPlan?(id: string): Promise<ProviderResult<IPlan>>;
  updatePlan?(id: string, req: Partial<{ name: string; amountMinor: number; interval: string }>): Promise<ProviderResult<IPlan>>;
  // Subscriptions (Paystack: POST /subscription, Stripe: POST /v1/subscriptions)
  createSubscription?(req: {
    customer: string;
    plan?: string;
    items?: Array<{ price: string; quantity?: number }>;
    authorization?: string;
    start_date?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ProviderResult<ISubscription>>;
  listSubscriptions?(req?: { perPage?: number; page?: number }): Promise<ProviderResult<{ subscriptions: ISubscription[]; total?: number; meta?: Record<string, unknown> }>>;
  fetchSubscription?(id: string): Promise<ProviderResult<ISubscription>>;
  /** Paystack: POST /subscription/disable */
  disableSubscription?(req: { code: string; token: string }): Promise<ProviderResult<{ status: string }>>;
  /** Paystack: POST /subscription/enable */
  enableSubscription?(req: { code: string; token: string }): Promise<ProviderResult<{ status: string }>>;
  /** Stripe: DELETE /v1/subscriptions/:id */
  cancelSubscription?(id: string): Promise<ProviderResult<{ status: string }>>;
  /** Stripe: POST /v1/subscriptions/:id */
  updateSubscription?(id: string, req: Record<string, unknown>): Promise<ProviderResult<ISubscription>>;
  // Flutterwave payment plans (variant)
  createPaymentPlan?(req: { name: string; amount: number; interval: string; duration?: number }): Promise<ProviderResult<{ code: string; status: string; id?: string }>>;
  listPaymentPlans?(req?: { page?: number }): Promise<ProviderResult<{ plans: unknown[]; meta?: Record<string, unknown> }>>;
  fetchPaymentPlan?(id: string): Promise<ProviderResult<{ plan: unknown }>>;
  /** Flutterwave: PUT /payment-plans/:id/cancel */
  cancelPaymentPlan?(id: string): Promise<ProviderResult<{ status: string }>>;
}

// 23. Checkout — hosted payment pages (Paystack Payment Pages)
export interface IPaymentPage {
  id: string;
  name: string;
  description?: string;
  amountMinor?: number;
  currency: string;
  slug?: string;
  splitCode?: string;
  url?: string;
}
export interface ICheckoutProvider {
  readonly contract: "CHECKOUT";
  createPaymentPage(req: {
    name: string;
    description?: string;
    amountMinor?: number;
    currency?: string;
    splitCode?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ProviderResult<IPaymentPage>>;
  listPaymentPages(req?: { perPage?: number; page?: number }): Promise<ProviderResult<{ pages: IPaymentPage[]; total?: number; meta?: Record<string, unknown> }>>;
  fetchPaymentPage(id: string): Promise<ProviderResult<IPaymentPage>>;
  updatePaymentPage(id: string, req: Partial<{ name: string; description: string; amountMinor: number; currency: string }>): Promise<ProviderResult<IPaymentPage>>;
}

// 24. USSD code generation (Paystack)
export interface IUssdCode {
  ussdCode: string;
  reference: string;
  amountMinor: number;
  currency: string;
  bank?: { name?: string; code?: string };
  expiresAt?: string;
}
export interface IUssdProvider {
  readonly contract: "USSD";
  generateUssd(req: {
    email: string;
    amountMinor: number;
    currency: string;
    reference?: string;
    bankCode?: string;
  }): Promise<ProviderResult<IUssdCode>>;
}

// 25. Customer CRUD (Stripe)
export interface ICustomer {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}
export interface ICustomerProvider {
  readonly contract: "CUSTOMER";
  createCustomer(req: {
    email: string;
    name?: string;
    phone?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ProviderResult<ICustomer>>;
  listCustomers(req?: { perPage?: number; page?: number }): Promise<ProviderResult<{ customers: ICustomer[]; total?: number; hasMore?: boolean }>>;
  fetchCustomer(id: string): Promise<ProviderResult<ICustomer>>;
  updateCustomer(id: string, req: Partial<{ email: string; name: string; phone: string; metadata: Record<string, unknown> }>): Promise<ProviderResult<ICustomer>>;
  deleteCustomer(id: string): Promise<ProviderResult<{ deleted: boolean }>>;
}

// 26. Payouts — bank-account payouts (Stripe)
export interface IPayout {
  id: string;
  amountMinor: number;
  currency: string;
  status: string;
  destination?: string;
  method?: string;
  arrivalDate?: string;
}
export interface IPayoutProvider {
  readonly contract: "PAYOUT";
  createPayout(req: {
    amountMinor: number;
    currency: string;
    destination?: string;
    method?: "STANDARD" | "INSTANT";
    metadata?: Record<string, unknown>;
  }): Promise<ProviderResult<IPayout>>;
  listPayouts(req?: { perPage?: number; page?: number }): Promise<ProviderResult<{ payouts: IPayout[]; total?: number; hasMore?: boolean }>>;
  cancelPayout(id: string): Promise<ProviderResult<{ status: string }>>;
}

// 27. Refund management — list/fetch/create beyond the single-refund on ICardPaymentProvider
export interface IRefundRecord {
  id: string;
  reference?: string;
  amountMinor?: number;
  currency?: string;
  status: string;
  reason?: string;
  createdAt?: string;
}
export interface IRefundProvider {
  readonly contract: "REFUND";
  listRefunds(req?: { reference?: string; currency?: string; perPage?: number; page?: number; paymentIntent?: string }): Promise<ProviderResult<{ refunds: IRefundRecord[]; total?: number; meta?: Record<string, unknown> }>>;
  fetchRefund(id: string): Promise<ProviderResult<IRefundRecord>>;
  createRefund?(req: { paymentIntent: string; amountMinor?: number; reason?: string; metadata?: Record<string, unknown> }): Promise<ProviderResult<IRefundRecord>>;
}

// 28. Settlements (Paystack)
export interface ISettlement {
  id: string;
  amountMinor: number;
  currency: string;
  status: string;
  settledAt?: string;
  bank?: string;
}
export interface ISettlementProvider {
  readonly contract: "SETTLEMENT";
  listSettlements(req?: { perPage?: number; page?: number; from?: string; to?: string }): Promise<ProviderResult<{ settlements: ISettlement[]; total?: number; meta?: Record<string, unknown> }>>;
  fetchSettlement?(id: string): Promise<ProviderResult<ISettlement>>;
}

// 29. Apple Pay (Paystack)
export interface IApplePayResult {
  providerRef: string;
  status: string;
  reference: string;
}
export interface IApplePayProvider {
  readonly contract: "APPLE_PAY";
  submitApplePay(req: {
    email: string;
    amountMinor: number;
    currency: string;
    applePayToken: string;
    reference?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ProviderResult<IApplePayResult>>;
}

// 30. Virtual card management (Flutterwave — distinct method surface from IVirtualCardIssuer)
export interface IVirtualCard {
  id: string;
  currency: string;
  amountMinor: number;
  billingName: string;
  billingAddress?: Record<string, unknown>;
  last4?: string;
  status?: string;
}
export interface IVirtualCardManagementProvider {
  readonly contract: "VIRTUAL_CARD_MGMT";
  createVirtualCard(req: {
    currency: string;
    amountMinor: number;
    billingName: string;
    billingAddress?: Record<string, unknown>;
  }): Promise<ProviderResult<IVirtualCard>>;
  getVirtualCard(id: string): Promise<ProviderResult<IVirtualCard>>;
  fundVirtualCard(id: string, req: { amountMinor: number; currency?: string }): Promise<ProviderResult<{ status: string; balanceMinor?: number }>>;
  terminateVirtualCard(id: string): Promise<ProviderResult<{ status: string }>>;
}

// 31. Bulk transfers (Flutterwave)
export interface IBulkTransferResult {
  batchId: string;
  status: string;
  totalCreditMinor?: number;
  totalDebitMinor?: number;
  entryCount?: number;
}
export interface IBulkTransferProvider {
  readonly contract: "BULK_TRANSFER";
  bulkTransfer(req: {
    title: string;
    bulkData: Array<{
      bankCode: string;
      accountNumber: string;
      amountMinor: number;
      narration?: string;
      currency?: string;
      reference?: string;
    }>;
    currency?: string;
  }): Promise<ProviderResult<IBulkTransferResult>>;
  fetchTransferFee(req: { amountMinor: number; currency: string }): Promise<ProviderResult<{ feeMinor: number; currency: string }>>;
}

// 32. Chargebacks (Flutterwave)
export interface IChargeback {
  id: string;
  amountMinor: number;
  currency: string;
  status: string;
  reason?: string;
  flwRef?: string;
  merchantId?: string;
  createdAt?: string;
}
export interface IChargebackProvider {
  readonly contract: "CHARGEBACK";
  listChargebacks(req?: { page?: number; perPage?: number }): Promise<ProviderResult<{ chargebacks: IChargeback[]; meta?: Record<string, unknown> }>>;
  fetchChargeback(id: string): Promise<ProviderResult<IChargeback>>;
}

// 33. Product catalog (Stripe Products)
export interface IProduct {
  id: string;
  name: string;
  description?: string;
  active?: boolean;
  createdAt?: string;
}
export interface IProductProvider {
  readonly contract: "PRODUCT";
  createProduct(req: { name: string; description?: string; metadata?: Record<string, unknown> }): Promise<ProviderResult<IProduct>>;
  listProducts(req?: { perPage?: number; page?: number }): Promise<ProviderResult<{ products: IProduct[]; hasMore?: boolean }>>;
}

// 34. Prices (Stripe Prices — recurring or one-time)
export interface IPrice {
  id: string;
  currency: string;
  amountMinor: number;
  recurring?: { interval: string; intervalCount?: number };
  product: string;
  active?: boolean;
}
export interface IPriceProvider {
  readonly contract: "PRICE";
  createPrice(req: {
    currency: string;
    amountMinor: number;
    recurring?: { interval: string; intervalCount?: number };
    product: string;
    nickname?: string;
  }): Promise<ProviderResult<IPrice>>;
  listPrices(req?: { perPage?: number; page?: number; product?: string }): Promise<ProviderResult<{ prices: IPrice[]; hasMore?: boolean }>>;
}

// 35. Webhook endpoints (Stripe)
export interface IWebhookEndpoint {
  id: string;
  url: string;
  enabledEvents: string[];
  status?: string;
  secret?: string;
}
export interface IWebhookEndpointProvider {
  readonly contract: "WEBHOOK_ENDPOINT";
  createWebhookEndpoint(req: { url: string; events: string[]; description?: string }): Promise<ProviderResult<IWebhookEndpoint>>;
  listWebhookEndpoints(): Promise<ProviderResult<{ endpoints: IWebhookEndpoint[]; hasMore?: boolean }>>;
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
  | IVirtualCardIssuer
  | IAMLProvider
  | IBusinessKYCProvider
  | IFraudScreeningProvider
  | IOTPProvider
  | IRecipientProvider
  | IMultiCurrencyBalanceProvider
  | ISplitPaymentProvider
  | IInvoiceProvider
  | IDirectDebitProvider
  | ICardTokenizationProvider
  | IRecurringBillingProvider
  | ICheckoutProvider
  | IUssdProvider
  | ICustomerProvider
  | IPayoutProvider
  | IRefundProvider
  | ISettlementProvider
  | IApplePayProvider
  | IVirtualCardManagementProvider
  | IBulkTransferProvider
  | IChargebackProvider
  | IProductProvider
  | IPriceProvider
  | IWebhookEndpointProvider;

// Shared types used by the new contracts
export interface AMLMatch {
  name: string;
  list?: string;
  country?: string;
  score?: number;
  position?: string;
  matchType?: string;
}
export interface BusinessMatch {
  name: string;
  rcNumber?: string;
  status?: string;
}
export interface RecipientSummary {
  id: string;
  name: string;
  currency: string;
  type: string;
  active?: boolean;
}
export interface BalanceSummary {
  id: string;
  currency: string;
  amountMinor: number;
  type?: string;
}
