// TurboCore seed — providers, capabilities, country configs, FX config.

import { db } from "@/lib/db";
import { seedCountryConfigs } from "./geo/country-config";
import { ContractName } from "./result";

export async function seedTurboCore(): Promise<void> {
  await seedCountryConfigs();

  // Providers
  const providers = [
    { code: "turbopay", displayName: "Turbopay (Demo)", sandbox: true, enabled: true, priority: 10 },
    { code: "paystack", displayName: "Paystack", sandbox: false, enabled: true, priority: 80 },
    { code: "flutterwave", displayName: "Flutterwave", sandbox: false, enabled: true, priority: 75 },
    { code: "monnify", displayName: "Monnify", sandbox: false, enabled: true, priority: 70 },
    { code: "baxi", displayName: "Baxi (Interswitch)", sandbox: false, enabled: true, priority: 70 },
    { code: "remita", displayName: "Remita", sandbox: false, enabled: true, priority: 60 },
    { code: "quickteller", displayName: "Quickteller", sandbox: false, enabled: true, priority: 65 },
    { code: "paga", displayName: "Paga", sandbox: false, enabled: true, priority: 72 },
    { code: "mpesa", displayName: "M-Pesa", sandbox: false, enabled: true, priority: 90 },
    { code: "mtn_momo", displayName: "MTN MoMo", sandbox: false, enabled: true, priority: 80 },
    { code: "airtel_money", displayName: "Airtel Money", sandbox: false, enabled: true, priority: 78 },
    { code: "smartcash", displayName: "Smartcash PSB (Nigeria)", sandbox: false, enabled: true, priority: 82 },
    { code: "wise", displayName: "Wise", sandbox: false, enabled: true, priority: 85 },
    { code: "stripe", displayName: "Stripe", sandbox: false, enabled: true, priority: 85 },
    { code: "dojah", displayName: "Dojah KYC", sandbox: false, enabled: true, priority: 75 },
    { code: "termii", displayName: "Termii SMS", sandbox: false, enabled: true, priority: 75 },
    { code: "resend", displayName: "Resend Email", sandbox: false, enabled: true, priority: 80 },
  ];
  for (const p of providers) {
    await db.providerConfig.upsert({
      where: { code: p.code },
      create: { code: p.code, displayName: p.displayName, sandbox: p.sandbox, enabled: p.enabled, weightsJSON: "{}", defaultPriority: p.priority },
      update: {},
    });
  }

  // Capabilities (the matrix that drives routing + UI)
  const caps = [
    // Paystack — NG card, bank transfer, virtual account, KYC
    { providerCode: "paystack", contract: "CARD_PAYMENT", country: "NG", currency: "NGN", direction: "INBOUND", minAmountMinor: 10000, maxAmountMinor: 5000000, feeBps: 180, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "paystack", contract: "BANK_TRANSFER", country: "NG", currency: "NGN", direction: "OUTBOUND", minAmountMinor: 10000, maxAmountMinor: 5000000, feeBps: 0, feeFixedMinor: 5250, settleHours: 0 },
    { providerCode: "paystack", contract: "VIRTUAL_ACCOUNT", country: "NG", currency: "NGN", direction: "INBOUND", minAmountMinor: 0, maxAmountMinor: 0, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "paystack", contract: "KYC", country: "NG", currency: "NGN", direction: "INBOUND", minAmountMinor: 0, maxAmountMinor: 0, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    // Flutterwave — NG + KE + GH
    { providerCode: "flutterwave", contract: "CARD_PAYMENT", country: "NG", currency: "NGN", direction: "INBOUND", minAmountMinor: 10000, maxAmountMinor: 5000000, feeBps: 140, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "flutterwave", contract: "CARD_PAYMENT", country: "KE", currency: "KES", direction: "INBOUND", minAmountMinor: 1000, maxAmountMinor: 500000, feeBps: 140, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "flutterwave", contract: "BANK_TRANSFER", country: "NG", currency: "NGN", direction: "OUTBOUND", minAmountMinor: 10000, maxAmountMinor: 5000000, feeBps: 0, feeFixedMinor: 5250, settleHours: 0 },
    { providerCode: "flutterwave", contract: "INTERNATIONAL_TRANSFER", country: "NG", currency: "USD", direction: "OUTBOUND", minAmountMinor: 100, maxAmountMinor: 100000, feeBps: 100, feeFixedMinor: 0, settleHours: 24 },
    { providerCode: "flutterwave", contract: "MOBILE_MONEY", country: "KE", currency: "KES", direction: "INBOUND", minAmountMinor: 1000, maxAmountMinor: 500000, feeBps: 100, feeFixedMinor: 0, settleHours: 0 },
    // Monnify — NG virtual account + card
    { providerCode: "monnify", contract: "VIRTUAL_ACCOUNT", country: "NG", currency: "NGN", direction: "INBOUND", minAmountMinor: 0, maxAmountMinor: 0, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "monnify", contract: "CARD_PAYMENT", country: "NG", currency: "NGN", direction: "INBOUND", minAmountMinor: 10000, maxAmountMinor: 5000000, feeBps: 150, feeFixedMinor: 0, settleHours: 0 },
    // Baxi — NG bills + airtime
    { providerCode: "baxi", contract: "BILL_PAYMENT", country: "NG", currency: "NGN", direction: "OUTBOUND", minAmountMinor: 1000, maxAmountMinor: 5000000, feeBps: 0, feeFixedMinor: 1000, settleHours: 0, service: "BILL:ELECTRICITY" },
    { providerCode: "baxi", contract: "AIRTIME", country: "NG", currency: "NGN", direction: "OUTBOUND", minAmountMinor: 5000, maxAmountMinor: 5000000, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    // Remita — NG government/RRR
    { providerCode: "remita", contract: "BILL_PAYMENT", country: "NG", currency: "NGN", direction: "OUTBOUND", minAmountMinor: 1000, maxAmountMinor: 10000000, feeBps: 0, feeFixedMinor: 2500, settleHours: 0, service: "BILL:GOVERNMENT" },
    // Quickteller — NG bills + airtime
    { providerCode: "quickteller", contract: "BILL_PAYMENT", country: "NG", currency: "NGN", direction: "OUTBOUND", minAmountMinor: 1000, maxAmountMinor: 5000000, feeBps: 0, feeFixedMinor: 1500, settleHours: 0 },
    { providerCode: "quickteller", contract: "AIRTIME", country: "NG", currency: "NGN", direction: "OUTBOUND", minAmountMinor: 5000, maxAmountMinor: 5000000, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    // Paga — NG mobile money + bills
    { providerCode: "paga", contract: "MOBILE_MONEY", country: "NG", currency: "NGN", direction: "INBOUND", minAmountMinor: 1000, maxAmountMinor: 5000000, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "paga", contract: "MOBILE_MONEY", country: "NG", currency: "NGN", direction: "OUTBOUND", minAmountMinor: 1000, maxAmountMinor: 5000000, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "paga", contract: "BILL_PAYMENT", country: "NG", currency: "NGN", direction: "OUTBOUND", minAmountMinor: 1000, maxAmountMinor: 5000000, feeBps: 0, feeFixedMinor: 1000, settleHours: 0 },
    // M-Pesa — KE mobile money
    { providerCode: "mpesa", contract: "MOBILE_MONEY", country: "KE", currency: "KES", direction: "INBOUND", minAmountMinor: 1000, maxAmountMinor: 500000, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "mpesa", contract: "MOBILE_MONEY", country: "KE", currency: "KES", direction: "OUTBOUND", minAmountMinor: 1000, maxAmountMinor: 500000, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    // MTN MoMo — UG/GH/RW/CI/ZM/CM mobile money
    { providerCode: "mtn_momo", contract: "MOBILE_MONEY", country: "UG", currency: "UGX", direction: "INBOUND", minAmountMinor: 500, maxAmountMinor: 5000000, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "mtn_momo", contract: "MOBILE_MONEY", country: "UG", currency: "UGX", direction: "OUTBOUND", minAmountMinor: 500, maxAmountMinor: 5000000, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "mtn_momo", contract: "MOBILE_MONEY", country: "GH", currency: "GHS", direction: "INBOUND", minAmountMinor: 100, maxAmountMinor: 2000000, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "mtn_momo", contract: "MOBILE_MONEY", country: "GH", currency: "GHS", direction: "OUTBOUND", minAmountMinor: 100, maxAmountMinor: 2000000, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "mtn_momo", contract: "MOBILE_MONEY", country: "RW", currency: "RWF", direction: "INBOUND", minAmountMinor: 100, maxAmountMinor: 5000000, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "mtn_momo", contract: "MOBILE_MONEY", country: "CI", currency: "XOF", direction: "INBOUND", minAmountMinor: 100, maxAmountMinor: 5000000, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "mtn_momo", contract: "MOBILE_MONEY", country: "ZM", currency: "ZMW", direction: "INBOUND", minAmountMinor: 100, maxAmountMinor: 5000000, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "mtn_momo", contract: "MOBILE_MONEY", country: "CM", currency: "XAF", direction: "INBOUND", minAmountMinor: 100, maxAmountMinor: 5000000, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    // Airtel Money — UG/TZ/KE/RW/NG/IN mobile money
    { providerCode: "airtel_money", contract: "MOBILE_MONEY", country: "UG", currency: "UGX", direction: "INBOUND", minAmountMinor: 500, maxAmountMinor: 5000000, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "airtel_money", contract: "MOBILE_MONEY", country: "UG", currency: "UGX", direction: "OUTBOUND", minAmountMinor: 500, maxAmountMinor: 5000000, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "airtel_money", contract: "MOBILE_MONEY", country: "TZ", currency: "TZS", direction: "INBOUND", minAmountMinor: 500, maxAmountMinor: 5000000, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "airtel_money", contract: "MOBILE_MONEY", country: "KE", currency: "KES", direction: "INBOUND", minAmountMinor: 1000, maxAmountMinor: 500000, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "airtel_money", contract: "MOBILE_MONEY", country: "RW", currency: "RWF", direction: "INBOUND", minAmountMinor: 100, maxAmountMinor: 5000000, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    // Smartcash PSB — Nigeria mobile money (Airtel Nigeria)
    { providerCode: "smartcash", contract: "MOBILE_MONEY", country: "NG", currency: "NGN", direction: "INBOUND", minAmountMinor: 1000, maxAmountMinor: 5000000, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "smartcash", contract: "MOBILE_MONEY", country: "NG", currency: "NGN", direction: "OUTBOUND", minAmountMinor: 1000, maxAmountMinor: 5000000, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    // Wise — international
    { providerCode: "wise", contract: "INTERNATIONAL_TRANSFER", country: "NG", currency: "USD", direction: "OUTBOUND", minAmountMinor: 100, maxAmountMinor: 500000, feeBps: 80, feeFixedMinor: 0, settleHours: 48 },
    { providerCode: "wise", contract: "EXCHANGE_RATE", country: "ALL", currency: "ALL", direction: "INBOUND", minAmountMinor: 0, maxAmountMinor: 0, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    // Stripe — US/GB card
    { providerCode: "stripe", contract: "CARD_PAYMENT", country: "US", currency: "USD", direction: "INBOUND", minAmountMinor: 50, maxAmountMinor: 1000000, feeBps: 290, feeFixedMinor: 30, settleHours: 0 },
    { providerCode: "stripe", contract: "CARD_PAYMENT", country: "GB", currency: "GBP", direction: "INBOUND", minAmountMinor: 50, maxAmountMinor: 1000000, feeBps: 290, feeFixedMinor: 20, settleHours: 0 },
    // Dojah — KYC
    { providerCode: "dojah", contract: "KYC", country: "NG", currency: "NGN", direction: "INBOUND", minAmountMinor: 0, maxAmountMinor: 0, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    // Termii + Resend — notifications
    { providerCode: "termii", contract: "NOTIFICATION", country: "ALL", currency: "ALL", direction: "INBOUND", minAmountMinor: 0, maxAmountMinor: 0, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "resend", contract: "NOTIFICATION", country: "ALL", currency: "ALL", direction: "INBOUND", minAmountMinor: 0, maxAmountMinor: 0, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    // Turbopay mock — fallback for all countries/contracts
    { providerCode: "turbopay", contract: "CARD_PAYMENT", country: "ALL", currency: "ALL", direction: "INBOUND", minAmountMinor: 0, maxAmountMinor: 0, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "turbopay", contract: "BANK_TRANSFER", country: "ALL", currency: "ALL", direction: "OUTBOUND", minAmountMinor: 0, maxAmountMinor: 0, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "turbopay", contract: "VIRTUAL_ACCOUNT", country: "ALL", currency: "ALL", direction: "INBOUND", minAmountMinor: 0, maxAmountMinor: 0, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "turbopay", contract: "BILL_PAYMENT", country: "ALL", currency: "ALL", direction: "OUTBOUND", minAmountMinor: 0, maxAmountMinor: 0, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "turbopay", contract: "AIRTIME", country: "ALL", currency: "ALL", direction: "OUTBOUND", minAmountMinor: 0, maxAmountMinor: 0, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "turbopay", contract: "KYC", country: "ALL", currency: "ALL", direction: "INBOUND", minAmountMinor: 0, maxAmountMinor: 0, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "turbopay", contract: "INTERNATIONAL_TRANSFER", country: "ALL", currency: "ALL", direction: "OUTBOUND", minAmountMinor: 0, maxAmountMinor: 0, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "turbopay", contract: "MOBILE_MONEY", country: "ALL", currency: "ALL", direction: "INBOUND", minAmountMinor: 0, maxAmountMinor: 0, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "turbopay", contract: "MOBILE_MONEY", country: "ALL", currency: "ALL", direction: "OUTBOUND", minAmountMinor: 0, maxAmountMinor: 0, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
    { providerCode: "turbopay", contract: "VIRTUAL_CARD_ISSUER", country: "ALL", currency: "ALL", direction: "INBOUND", minAmountMinor: 0, maxAmountMinor: 0, feeBps: 0, feeFixedMinor: 0, settleHours: 0 },
  ];

  for (const c of caps) {
    const existing = await db.providerCapability.findFirst({
      where: { providerCode: c.providerCode, contract: c.contract, country: c.country, currency: c.currency, direction: c.direction, service: c.service ?? null },
    });
    if (!existing) {
      await db.providerCapability.create({ data: { ...c, service: c.service ?? null, enabled: true } });
    }
  }

  // FX config seed
  const fxConfigs = [
    { base: "NGN", quote: "USD", spreadBps: 150, markupBps: 50, feeFixedMinor: 0, feeBps: 0 },
    { base: "USD", quote: "NGN", spreadBps: 150, markupBps: 50, feeFixedMinor: 0, feeBps: 0 },
    { base: "NGN", quote: "KES", spreadBps: 200, markupBps: 50, feeFixedMinor: 0, feeBps: 0 },
    { base: "NGN", quote: "GHS", spreadBps: 200, markupBps: 50, feeFixedMinor: 0, feeBps: 0 },
    { base: "USD", quote: "KES", spreadBps: 100, markupBps: 30, feeFixedMinor: 0, feeBps: 0 },
    { base: "USD", quote: "GBP", spreadBps: 80, markupBps: 20, feeFixedMinor: 0, feeBps: 0 },
  ];
  for (const f of fxConfigs) {
    await db.fxConfig.upsert({
      where: { base_quote: { base: f.base, quote: f.quote } },
      create: f,
      update: {},
    });
  }
}
