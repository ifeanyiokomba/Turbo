// TurboCore GCR — Country Capability Matrix
//
// Every country has a capability profile. This matrix is the foundation for
// routing decisions: the resolution engine consults it before picking a
// provider.
//
// Support levels (per Chapter 7):
//   FULL          ✓  — generally available
//   LIMITED       partial — only some providers / some currencies
//   CONFIGURABLE  off by default but can be enabled via flag
//   DISABLED      ✗ — not available (regulatory / not implemented)
//   BETA          pilot / early-access

import { CAPABILITIES } from "./capability-tree";
import type { CountryCapabilityProfile, CountryCapabilitySupport } from "./types";

// ---------------------------------------------------------------------------
// Country profiles
// ---------------------------------------------------------------------------

interface CountrySeed {
  code: string;
  name: string;
  flag: string;
  currency: string;
  kycRequirements: string[];
  regulatoryNotes?: string;
  /** Map of capabilityId → support level. Capabilities not listed default to DISABLED. */
  capabilities: Record<string, CountryCapabilitySupport>;
}

const COUNTRY_SEEDS: CountrySeed[] = [
  {
    code: "NG",
    name: "Nigeria",
    flag: "🇳🇬",
    currency: "NGN",
    kycRequirements: ["BVN", "NIN"],
    regulatoryNotes: "CBN-regulated. BVN mandatory for tier 2+. Stablecoins require SEC approval.",
    capabilities: {
      "collections.cards": "FULL",
      "collections.bank_transfer": "FULL",
      "collections.virtual_account": "FULL",
      "collections.ussd": "FULL",
      "collections.qr": "FULL",
      "collections.payment_link": "FULL",
      "collections.invoice": "FULL",
      "collections.checkout": "FULL",
      "collections.apple_pay": "BETA",
      "collections.google_pay": "BETA",
      "collections.mobile_money": "LIMITED",
      "collections.stablecoins": "CONFIGURABLE",
      "collections.crypto": "DISABLED",
      "collections.pos": "PLANNED" as any,
      "disbursements.bank_transfer": "FULL",
      "disbursements.wallet_transfer": "FULL",
      "disbursements.mobile_money": "LIMITED",
      "disbursements.international": "BETA",
      "disbursements.bulk": "FULL",
      "disbursements.payroll": "FULL",
      "disbursements.stablecoin": "CONFIGURABLE",
      "wallets.deposit": "FULL",
      "wallets.withdraw": "FULL",
      "wallets.freeze": "FULL",
      "wallets.escrow": "FULL",
      "wallets.savings": "FULL",
      "wallets.interest": "FULL",
      "wallets.multi_currency": "FULL",
      "wallets.merchant_wallet": "FULL",
      "identity.bvn": "FULL",
      "identity.nin": "FULL",
      "identity.aml": "FULL",
      "identity.pep": "FULL",
      "identity.sanctions": "FULL",
      "identity.liveness": "FULL",
      "identity.face_match": "FULL",
      "identity.doc_ocr": "FULL",
      "fx.rates": "FULL",
      "fx.convert": "FULL",
      "fx.quote": "FULL",
      "merchant.checkout": "FULL",
      "merchant.payment_link": "FULL",
      "merchant.invoice": "FULL",
      "merchant.subscription": "FULL",
      "merchant.split": "FULL",
      "cards.tokenization": "FULL",
      "cards.authorization": "FULL",
      "cards.refund": "FULL",
      "cards.recurring": "FULL",
      "virtual_accounts.permanent": "FULL",
      "virtual_accounts.temporary": "FULL",
      "banking.account_verification": "FULL",
      "banking.transfer": "FULL",
      "banking.direct_debit": "FULL",
      "risk.velocity": "FULL",
      "risk.fraud_scoring": "FULL",
      "compliance.aml": "FULL",
      "compliance.kyc": "FULL",
      "compliance.kyb": "FULL",
      "settlement.schedule": "FULL",
      "settlement.fee_calc": "FULL",
      "settlement.merchant": "FULL",
      "notifications.email": "FULL",
      "notifications.sms": "FULL",
      "notifications.otp_delivery": "FULL",
    },
  },
  {
    code: "KE",
    name: "Kenya",
    flag: "🇰🇪",
    currency: "KES",
    kycRequirements: ["National ID", "KRA PIN"],
    regulatoryNotes: "CBK-regulated. M-Pesa dominant. Mobile money is primary rail.",
    capabilities: {
      "collections.cards": "FULL",
      "collections.bank_transfer": "FULL",
      "collections.virtual_account": "LIMITED",
      "collections.ussd": "DISABLED",
      "collections.qr": "FULL",
      "collections.payment_link": "FULL",
      "collections.invoice": "FULL",
      "collections.checkout": "FULL",
      "collections.mobile_money": "FULL",
      "collections.stablecoins": "CONFIGURABLE",
      "disbursements.bank_transfer": "FULL",
      "disbursements.wallet_transfer": "FULL",
      "disbursements.mobile_money": "FULL",
      "disbursements.international": "BETA",
      "disbursements.bulk": "FULL",
      "disbursements.payroll": "FULL",
      "wallets.deposit": "FULL",
      "wallets.withdraw": "FULL",
      "wallets.savings": "FULL",
      "wallets.multi_currency": "FULL",
      "identity.national_id": "FULL",
      "identity.aml": "FULL",
      "identity.sanctions": "FULL",
      "fx.rates": "FULL",
      "fx.convert": "FULL",
      "merchant.checkout": "FULL",
      "merchant.payment_link": "FULL",
      "cards.tokenization": "FULL",
      "cards.authorization": "FULL",
      "cards.refund": "FULL",
      "mobile_money.collection": "FULL",
      "mobile_money.payout": "FULL",
      "mobile_money.stk_push": "FULL",
      "mobile_money.request_to_pay": "FULL",
      "mobile_money.bill_payment": "FULL",
      "mobile_money.cash_in": "FULL",
      "mobile_money.cash_out": "FULL",
      "banking.account_verification": "FULL",
      "banking.transfer": "FULL",
      "risk.velocity": "FULL",
      "risk.fraud_scoring": "FULL",
      "compliance.aml": "FULL",
      "compliance.kyc": "FULL",
      "settlement.merchant": "FULL",
      "notifications.email": "FULL",
      "notifications.sms": "FULL",
      "notifications.otp_delivery": "FULL",
    },
  },
  {
    code: "GH",
    name: "Ghana",
    flag: "🇬🇭",
    currency: "GHS",
    kycRequirements: ["Ghana Card", "TIN"],
    regulatoryNotes: "BoG-regulated. Mobile money (MTN, AirtelTigo, Telecel) widely used.",
    capabilities: {
      "collections.cards": "FULL",
      "collections.bank_transfer": "FULL",
      "collections.virtual_account": "FULL",
      "collections.qr": "FULL",
      "collections.payment_link": "FULL",
      "collections.mobile_money": "FULL",
      "disbursements.bank_transfer": "FULL",
      "disbursements.mobile_money": "FULL",
      "wallets.deposit": "FULL",
      "wallets.withdraw": "FULL",
      "identity.national_id": "FULL",
      "identity.aml": "FULL",
      "fx.rates": "FULL",
      "fx.convert": "FULL",
      "merchant.payment_link": "FULL",
      "cards.tokenization": "FULL",
      "cards.authorization": "FULL",
      "mobile_money.collection": "FULL",
      "mobile_money.payout": "FULL",
      "mobile_money.stk_push": "FULL",
      "banking.account_verification": "FULL",
      "compliance.aml": "FULL",
      "compliance.kyc": "FULL",
      "notifications.sms": "FULL",
      "notifications.otp_delivery": "FULL",
    },
  },
  {
    code: "ZA",
    name: "South Africa",
    flag: "🇿🇦",
    currency: "ZAR",
    kycRequirements: ["SA ID", "FICA"],
    regulatoryNotes: "SARB-regulated. FICA compliance mandatory. Strong card penetration.",
    capabilities: {
      "collections.cards": "FULL",
      "collections.bank_transfer": "FULL",
      "collections.qr": "FULL",
      "collections.payment_link": "FULL",
      "collections.apple_pay": "FULL",
      "collections.google_pay": "FULL",
      "disbursements.bank_transfer": "FULL",
      "disbursements.international": "BETA",
      "wallets.deposit": "FULL",
      "wallets.withdraw": "FULL",
      "identity.national_id": "FULL",
      "identity.aml": "FULL",
      "identity.pep": "FULL",
      "fx.rates": "FULL",
      "fx.convert": "FULL",
      "merchant.payment_link": "FULL",
      "cards.tokenization": "FULL",
      "cards.authorization": "FULL",
      "cards.refund": "FULL",
      "banking.account_verification": "FULL",
      "banking.open_banking": "BETA",
      "compliance.aml": "FULL",
      "compliance.kyc": "FULL",
      "compliance.kyb": "FULL",
      "notifications.email": "FULL",
      "notifications.sms": "FULL",
    },
  },
  {
    code: "UG",
    name: "Uganda",
    flag: "🇺🇬",
    currency: "UGX",
    kycRequirements: ["National ID"],
    capabilities: {
      "collections.cards": "LIMITED",
      "collections.bank_transfer": "FULL",
      "collections.mobile_money": "FULL",
      "collections.payment_link": "FULL",
      "disbursements.bank_transfer": "FULL",
      "disbursements.mobile_money": "FULL",
      "wallets.deposit": "FULL",
      "wallets.withdraw": "FULL",
      "identity.national_id": "FULL",
      "mobile_money.collection": "FULL",
      "mobile_money.payout": "FULL",
      "mobile_money.stk_push": "FULL",
      "compliance.aml": "FULL",
      "notifications.sms": "FULL",
      "notifications.otp_delivery": "FULL",
    },
  },
  {
    code: "TZ",
    name: "Tanzania",
    flag: "🇹🇿",
    currency: "TZS",
    kycRequirements: ["NIDA ID"],
    capabilities: {
      "collections.cards": "LIMITED",
      "collections.bank_transfer": "FULL",
      "collections.mobile_money": "FULL",
      "disbursements.mobile_money": "FULL",
      "wallets.deposit": "FULL",
      "wallets.withdraw": "FULL",
      "mobile_money.collection": "FULL",
      "mobile_money.payout": "FULL",
      "mobile_money.stk_push": "FULL",
      "compliance.aml": "FULL",
      "notifications.sms": "FULL",
    },
  },
  {
    code: "RW",
    name: "Rwanda",
    flag: "🇷🇼",
    currency: "RWF",
    kycRequirements: ["National ID"],
    capabilities: {
      "collections.mobile_money": "FULL",
      "disbursements.mobile_money": "FULL",
      "wallets.deposit": "FULL",
      "mobile_money.collection": "FULL",
      "mobile_money.payout": "FULL",
      "compliance.aml": "FULL",
      "notifications.sms": "FULL",
    },
  },
  {
    code: "GB",
    name: "United Kingdom",
    flag: "🇬🇧",
    currency: "GBP",
    kycRequirements: ["Passport", "Proof of address"],
    regulatoryNotes: "FCA-regulated. PSD2 SCA mandatory. Open Banking mature.",
    capabilities: {
      "collections.cards": "FULL",
      "collections.bank_transfer": "FULL",
      "collections.payment_link": "FULL",
      "collections.apple_pay": "FULL",
      "collections.google_pay": "FULL",
      "disbursements.bank_transfer": "FULL",
      "disbursements.international": "FULL",
      "wallets.deposit": "FULL",
      "wallets.withdraw": "FULL",
      "wallets.multi_currency": "FULL",
      "identity.passport": "FULL",
      "identity.aml": "FULL",
      "identity.pep": "FULL",
      "identity.sanctions": "FULL",
      "fx.rates": "FULL",
      "fx.convert": "FULL",
      "merchant.checkout": "FULL",
      "merchant.subscription": "FULL",
      "cards.tokenization": "FULL",
      "cards.authorization": "FULL",
      "cards.refund": "FULL",
      "cards.recurring": "FULL",
      "cards.network_tokens": "BETA",
      "banking.open_banking": "FULL",
      "banking.account_verification": "FULL",
      "compliance.aml": "FULL",
      "compliance.kyc": "FULL",
      "compliance.travel_rule": "FULL",
      "notifications.email": "FULL",
    },
  },
  {
    code: "US",
    name: "United States",
    flag: "🇺🇸",
    currency: "USD",
    kycRequirements: ["SSN", "Driver License"],
    regulatoryNotes: "FinCEN-regulated. State-by-state money transmitter licenses.",
    capabilities: {
      "collections.cards": "FULL",
      "collections.bank_transfer": "FULL",
      "collections.payment_link": "FULL",
      "collections.apple_pay": "FULL",
      "collections.google_pay": "FULL",
      "collections.stablecoins": "FULL",
      "disbursements.bank_transfer": "FULL",
      "disbursements.international": "FULL",
      "disbursements.stablecoin": "FULL",
      "wallets.deposit": "FULL",
      "wallets.withdraw": "FULL",
      "wallets.multi_currency": "FULL",
      "identity.passport": "FULL",
      "identity.drivers_license": "FULL",
      "identity.aml": "FULL",
      "identity.sanctions": "FULL",
      "fx.rates": "FULL",
      "fx.convert": "FULL",
      "merchant.checkout": "FULL",
      "merchant.subscription": "FULL",
      "cards.tokenization": "FULL",
      "cards.authorization": "FULL",
      "cards.network_tokens": "FULL",
      "stablecoins.bridge": "FULL",
      "stablecoins.transfer": "FULL",
      "banking.account_verification": "FULL",
      "compliance.aml": "FULL",
      "compliance.kyc": "FULL",
      "compliance.travel_rule": "FULL",
      "notifications.email": "FULL",
    },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getCountryProfile(country: string): CountryCapabilityProfile {
  const seed = COUNTRY_SEEDS.find((c) => c.code === country.toUpperCase());
  if (!seed) {
    // Unknown country — every capability is DISABLED by default
    return {
      country: country.toUpperCase(),
      name: country.toUpperCase(),
      flagEmoji: "🏳️",
      currency: "USD",
      capabilities: {},
      kycRequirements: [],
      regulatoryNotes: "Unknown country — capabilities disabled by default.",
    };
  }
  // Expand: capabilities not explicitly listed default to DISABLED
  const expanded: Record<string, CountryCapabilitySupport> = {};
  for (const cap of CAPABILITIES) {
    expanded[cap.id] = seed.capabilities[cap.id] ?? "DISABLED";
  }
  return {
    country: seed.code,
    name: seed.name,
    flagEmoji: seed.flag,
    currency: seed.currency,
    capabilities: expanded,
    kycRequirements: seed.kycRequirements,
    regulatoryNotes: seed.regulatoryNotes,
  };
}

export function getAllCountryProfiles(): CountryCapabilityProfile[] {
  return COUNTRY_SEEDS.map((s) => getCountryProfile(s.code));
}

export function getCountryCapabilitySupport(
  country: string,
  capabilityId: string
): CountryCapabilitySupport {
  const profile = getCountryProfile(country);
  return profile.capabilities[capabilityId] ?? "DISABLED";
}

export function listSupportedCountries(): string[] {
  return COUNTRY_SEEDS.map((s) => s.code);
}
