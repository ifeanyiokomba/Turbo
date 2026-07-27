// TurboCore adapter auto-loader — registers all providers with the registry at import.
// Add a new provider by dropping a *.adapter.ts file and importing it here.

import { registry } from "../registry";
import { ContractName } from "../result";
import * as tp from "./turbopay.adapter";

// Register the turbopay mock provider for ALL contracts (sandbox fallback)
registry.register(ContractName.VIRTUAL_ACCOUNT, "turbopay", async () => tp.turbopayVirtualAccount, { priority: 10, sandbox: true });
registry.register(ContractName.CARD_PAYMENT, "turbopay", async () => tp.turbopayCardPayment, { priority: 10, sandbox: true });
registry.register(ContractName.BANK_TRANSFER, "turbopay", async () => tp.turbopayBankTransfer, { priority: 10, sandbox: true });
registry.register(ContractName.BILL_PAYMENT, "turbopay", async () => tp.turbopayBillPayment, { priority: 10, sandbox: true });
registry.register(ContractName.AIRTIME, "turbopay", async () => tp.turbopayAirtime, { priority: 10, sandbox: true });
registry.register(ContractName.KYC, "turbopay", async () => tp.turbopayKyc, { priority: 10, sandbox: true });
registry.register(ContractName.NOTIFICATION, "turbopay", async () => tp.turbopayNotification, { priority: 10, sandbox: true });
registry.register(ContractName.INTERNATIONAL_TRANSFER, "turbopay", async () => tp.turbopayIntl, { priority: 10, sandbox: true });
registry.register(ContractName.MOBILE_MONEY, "turbopay", async () => tp.turbopayMobileMoney, { priority: 10, sandbox: true });
registry.register(ContractName.EXCHANGE_RATE, "turbopay", async () => tp.turbopayExchangeRate, { priority: 10, sandbox: true });
registry.register(ContractName.VIRTUAL_CARD_ISSUER, "turbopay", async () => tp.turbopayCardIssuer, { priority: 10, sandbox: true });

// Dynamically register real provider adapters (lazy resolvers that import on first use)
// Each real adapter is a separate file; registered here so the orchestrator can route to them.
const REAL_PROVIDERS: { code: string; file: string; contracts: { name: ContractName; exportName: string }[] }[] = [
  {
    code: "paystack",
    file: "./paystack.adapter",
    contracts: [
      { name: ContractName.CARD_PAYMENT, exportName: "paystackCardPayment" },
      { name: ContractName.BANK_TRANSFER, exportName: "paystackBankTransfer" },
      { name: ContractName.VIRTUAL_ACCOUNT, exportName: "paystackVirtualAccount" },
      { name: ContractName.KYC, exportName: "paystackKyc" },
      // Deep services (Task DEEP-1)
      { name: ContractName.SPLIT_PAYMENT, exportName: "paystackSubaccounts" },
      // RECURRING_BILLING is registered under paystackSubscriptions; paystackPlans
      // (also implements IRecurringBillingProvider) is exported from the adapter
      // module but NOT registered separately — the registry only allows one
      // resolver per `${contract}:${providerCode}`. Callers needing plan CRUD
      // can `import { paystackPlans } from "./paystack.adapter"` directly.
      { name: ContractName.RECURRING_BILLING, exportName: "paystackSubscriptions" },
      { name: ContractName.CHECKOUT, exportName: "paystackPaymentPages" },
      { name: ContractName.USSD, exportName: "paystackUssd" },
      { name: ContractName.REFUND, exportName: "paystackRefunds" },
      { name: ContractName.SETTLEMENT, exportName: "paystackSettlements" },
      { name: ContractName.APPLE_PAY, exportName: "paystackApplePay" },
    ],
  },
  {
    code: "flutterwave",
    file: "./flutterwave.adapter",
    contracts: [
      { name: ContractName.CARD_PAYMENT, exportName: "flutterwaveCardPayment" },
      { name: ContractName.BANK_TRANSFER, exportName: "flutterwaveBankTransfer" },
      { name: ContractName.INTERNATIONAL_TRANSFER, exportName: "flutterwaveIntl" },
      { name: ContractName.MOBILE_MONEY, exportName: "flutterwaveMobileMoney" },
      // Deep services (Task DEEP-1)
      { name: ContractName.SPLIT_PAYMENT, exportName: "flutterwaveSubaccounts" },
      { name: ContractName.RECURRING_BILLING, exportName: "flutterwavePaymentPlans" },
      { name: ContractName.VIRTUAL_CARD_MGMT, exportName: "flutterwaveVirtualCards" },
      { name: ContractName.BULK_TRANSFER, exportName: "flutterwaveTransfersToBank" },
      { name: ContractName.BILL_PAYMENT, exportName: "flutterwaveBillsPayment" },
      { name: ContractName.CHARGEBACK, exportName: "flutterwaveChargebacks" },
    ],
  },
  {
    code: "monnify",
    file: "./monnify.adapter",
    contracts: [
      { name: ContractName.VIRTUAL_ACCOUNT, exportName: "monnifyVirtualAccount" },
      { name: ContractName.CARD_PAYMENT, exportName: "monnifyCardPayment" },
      { name: ContractName.SPLIT_PAYMENT, exportName: "monnifySubaccounts" },
      { name: ContractName.INVOICE, exportName: "monnifyInvoice" },
      { name: ContractName.DIRECT_DEBIT, exportName: "monnifyDirectDebit" },
    ],
  },
  {
    code: "mpesa",
    file: "./mpesa.adapter",
    contracts: [{ name: ContractName.MOBILE_MONEY, exportName: "mpesaProvider" }],
  },
  {
    code: "mtn_momo",
    file: "./mtn-momo.adapter",
    contracts: [{ name: ContractName.MOBILE_MONEY, exportName: "mtnMomoProvider" }],
  },
  {
    code: "airtel_money",
    file: "./airtel-money.adapter",
    contracts: [{ name: ContractName.MOBILE_MONEY, exportName: "airtelMoneyProvider" }],
  },
  {
    code: "smartcash",
    file: "./smartcash.adapter",
    contracts: [
      { name: ContractName.MOBILE_MONEY, exportName: "smartcashProvider" },
      { name: ContractName.BANK_TRANSFER, exportName: "smartcashBankTransfer" },
      { name: ContractName.AIRTIME, exportName: "smartcashAirtime" },
      { name: ContractName.BILL_PAYMENT, exportName: "smartcashBillPayment" },
    ],
  },
  {
    code: "baxi",
    file: "./baxi.adapter",
    contracts: [
      { name: ContractName.BILL_PAYMENT, exportName: "baxiBillPayment" },
      { name: ContractName.AIRTIME, exportName: "baxiAirtime" },
    ],
  },
  {
    code: "remita",
    file: "./remita.adapter",
    contracts: [
      { name: ContractName.BILL_PAYMENT, exportName: "remitaBillPayment" },
      { name: ContractName.DIRECT_DEBIT, exportName: "remitaMandate" },
    ],
  },
  {
    code: "quickteller",
    file: "./quickteller.adapter",
    contracts: [
      { name: ContractName.BILL_PAYMENT, exportName: "quicktellerBillPayment" },
      { name: ContractName.AIRTIME, exportName: "quicktellerAirtime" },
      { name: ContractName.CARD_TOKENIZATION, exportName: "quicktellerCardTokenization" },
    ],
  },
  {
    code: "paga",
    file: "./paga.adapter",
    contracts: [
      { name: ContractName.MOBILE_MONEY, exportName: "pagaMobileMoney" },
      { name: ContractName.BILL_PAYMENT, exportName: "pagaBillPayment" },
      { name: ContractName.BANK_TRANSFER, exportName: "pagaBankTransfer" },
      { name: ContractName.AIRTIME, exportName: "pagaAirtime" },
    ],
  },
  {
    code: "wise",
    file: "./wise.adapter",
    contracts: [
      { name: ContractName.INTERNATIONAL_TRANSFER, exportName: "wiseIntl" },
      { name: ContractName.EXCHANGE_RATE, exportName: "wiseExchangeRate" },
      { name: ContractName.RECIPIENT, exportName: "wiseRecipients" },
      { name: ContractName.MULTI_CURRENCY_BALANCE, exportName: "wiseBalances" },
    ],
  },
  {
    code: "stripe",
    file: "./stripe.adapter",
    contracts: [
      { name: ContractName.CARD_PAYMENT, exportName: "stripeCardPayment" },
      { name: ContractName.VIRTUAL_CARD_ISSUER, exportName: "stripeIssuing" },
      // Deep services (Task DEEP-1)
      { name: ContractName.CUSTOMER, exportName: "stripeCustomers" },
      // RECURRING_BILLING is registered under stripeSubscriptions; stripePrices
      // (also implements IPriceProvider — separate contract) is registered under
      // PRICE separately. Stripe has no plan CRUD equivalent.
      { name: ContractName.RECURRING_BILLING, exportName: "stripeSubscriptions" },
      { name: ContractName.PRODUCT, exportName: "stripeProducts" },
      { name: ContractName.PRICE, exportName: "stripePrices" },
      { name: ContractName.PAYOUT, exportName: "stripePayouts" },
      { name: ContractName.REFUND, exportName: "stripeRefunds" },
      { name: ContractName.WEBHOOK_ENDPOINT, exportName: "stripeWebhookEndpoints" },
    ],
  },
  {
    code: "dojah",
    file: "./dojah.adapter",
    contracts: [
      { name: ContractName.KYC, exportName: "dojahKyc" },
      { name: ContractName.AML, exportName: "dojahAML" },
      { name: ContractName.BUSINESS_KYC, exportName: "dojahBusinessKYC" },
      { name: ContractName.FRAUD_SCREENING, exportName: "dojahFraudScreening" },
    ],
  },
  {
    code: "termii",
    file: "./termii.adapter",
    contracts: [
      { name: ContractName.NOTIFICATION, exportName: "termiiNotification" },
      { name: ContractName.OTP, exportName: "termiiOTP" },
    ],
  },
  {
    code: "resend",
    file: "./resend.adapter",
    contracts: [{ name: ContractName.NOTIFICATION, exportName: "resendNotification" }],
  },
];

// Register lazy resolvers — adapter module is imported on first resolve()
for (const p of REAL_PROVIDERS) {
  for (const c of p.contracts) {
    registry.register(c.name, p.code, async () => {
      const mod = await import(p.file);
      return mod[c.exportName];
    }, { priority: 50 });
  }
}

// Ensure the module side-effect (registration) runs
export const adaptersLoaded = true;
