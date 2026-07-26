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
    ],
  },
  {
    code: "monnify",
    file: "./monnify.adapter",
    contracts: [
      { name: ContractName.VIRTUAL_ACCOUNT, exportName: "monnifyVirtualAccount" },
      { name: ContractName.CARD_PAYMENT, exportName: "monnifyCardPayment" },
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
    contracts: [{ name: ContractName.MOBILE_MONEY, exportName: "smartcashProvider" }],
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
    contracts: [{ name: ContractName.BILL_PAYMENT, exportName: "remitaBillPayment" }],
  },
  {
    code: "quickteller",
    file: "./quickteller.adapter",
    contracts: [
      { name: ContractName.BILL_PAYMENT, exportName: "quicktellerBillPayment" },
      { name: ContractName.AIRTIME, exportName: "quicktellerAirtime" },
    ],
  },
  {
    code: "paga",
    file: "./paga.adapter",
    contracts: [
      { name: ContractName.MOBILE_MONEY, exportName: "pagaMobileMoney" },
      { name: ContractName.BILL_PAYMENT, exportName: "pagaBillPayment" },
    ],
  },
  {
    code: "wise",
    file: "./wise.adapter",
    contracts: [
      { name: ContractName.INTERNATIONAL_TRANSFER, exportName: "wiseIntl" },
      { name: ContractName.EXCHANGE_RATE, exportName: "wiseExchangeRate" },
    ],
  },
  {
    code: "stripe",
    file: "./stripe.adapter",
    contracts: [
      { name: ContractName.CARD_PAYMENT, exportName: "stripeCardPayment" },
      { name: ContractName.VIRTUAL_CARD_ISSUER, exportName: "stripeIssuing" },
    ],
  },
  {
    code: "dojah",
    file: "./dojah.adapter",
    contracts: [{ name: ContractName.KYC, exportName: "dojahKyc" }],
  },
  {
    code: "termii",
    file: "./termii.adapter",
    contracts: [{ name: ContractName.NOTIFICATION, exportName: "termiiNotification" }],
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
