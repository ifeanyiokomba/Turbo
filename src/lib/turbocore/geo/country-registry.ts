// TurboCore Country Registry
//
// Do NOT hardcode country logic.
// The Country Registry is a structured, machine-readable map of:
//   Country → Currencies → Providers → Payment Methods → Banks → Regulations → KYC → Settlement → Taxes
//
// The routing engine reads this registry instead of embedding country logic in code.

import {
  getAllManifests,
  getProvidersForCountry,
  getProvidersForCapability,
} from "../manifest-registry";

export interface CountryRegistryEntry {
  code: string;
  name: string;
  flagEmoji: string;
  currency: string;
  currencySymbol: string;
  dialCode: string;

  // Providers that operate in this country (from manifests)
  providers: string[];

  // Payment methods available (derived from provider manifests)
  paymentMethods: string[];

  // KYC requirements (from the KYC engine)
  kyc: {
    tier2: { idTypes: string[]; label: string };
    tier3: { idTypes: string[]; label: string };
  };

  // Banking
  banks?: string; // catalog key (e.g., "ng_banks")

  // Regulations
  regulations: {
    maxSingleTransaction?: number;
    maxDailyTransaction?: number;
    maxBalance?: number;
    requiresBVN?: boolean;
    requiresNIN?: boolean;
    taxRateBps?: number;
    notes?: string;
  };

  // Settlement
  settlement: {
    cycle: "INSTANT" | "T_PLUS_1" | "T_PLUS_2";
    currency: string;
  };

  // Locale
  locale: string;
  rtl: boolean;
}

// ===== Static Country Registry =====
// This is the base configuration. The provider list is dynamically
// enriched from manifests at runtime via `getCountryRegistry()`.

const COUNTRY_BASE: Record<string, Omit<CountryRegistryEntry, "providers" | "paymentMethods">> = {
  NG: {
    code: "NG",
    name: "Nigeria",
    flagEmoji: "🇳🇬",
    currency: "NGN",
    currencySymbol: "₦",
    dialCode: "+234",
    kyc: {
      tier2: { idTypes: ["NIN"], label: "Verified" },
      tier3: { idTypes: ["BVN"], label: "Premium" },
    },
    banks: "ng_banks",
    regulations: {
      maxSingleTransaction: 50_000_000,
      maxDailyTransaction: 200_000_000,
      maxBalance: 500_000_000,
      requiresBVN: true,
      requiresNIN: true,
      taxRateBps: 750,
      notes: "CBN: fintechs route inbound via licensed IMTO partner",
    },
    settlement: { cycle: "INSTANT", currency: "NGN" },
    locale: "en",
    rtl: false,
  },
  KE: {
    code: "KE",
    name: "Kenya",
    flagEmoji: "🇰🇪",
    currency: "KES",
    currencySymbol: "KSh",
    dialCode: "+254",
    kyc: {
      tier2: { idTypes: ["KRA_PIN"], label: "Verified" },
      tier3: { idTypes: ["NATIONAL_ID"], label: "Premium" },
    },
    regulations: { notes: "CBK: M-Pesa STK push for collections" },
    settlement: { cycle: "INSTANT", currency: "KES" },
    locale: "sw",
    rtl: false,
  },
  GH: {
    code: "GH",
    name: "Ghana",
    flagEmoji: "🇬🇭",
    currency: "GHS",
    currencySymbol: "GH₵",
    dialCode: "+233",
    kyc: {
      tier2: { idTypes: ["GHANA_CARD"], label: "Verified" },
      tier3: { idTypes: ["PASSPORT"], label: "Premium" },
    },
    regulations: { notes: "BoG: MoMo via MTN MoMo API" },
    settlement: { cycle: "INSTANT", currency: "GHS" },
    locale: "en",
    rtl: false,
  },
  UG: {
    code: "UG",
    name: "Uganda",
    flagEmoji: "🇺🇬",
    currency: "UGX",
    currencySymbol: "USh",
    dialCode: "+256",
    kyc: {
      tier2: { idTypes: ["NATIONAL_ID"], label: "Verified" },
      tier3: { idTypes: ["PASSPORT"], label: "Premium" },
    },
    regulations: {},
    settlement: { cycle: "INSTANT", currency: "UGX" },
    locale: "en",
    rtl: false,
  },
  ZA: {
    code: "ZA",
    name: "South Africa",
    flagEmoji: "🇿🇦",
    currency: "ZAR",
    currencySymbol: "R",
    dialCode: "+27",
    kyc: {
      tier2: { idTypes: ["SA_ID"], label: "Verified" },
      tier3: { idTypes: ["PASSPORT"], label: "Premium" },
    },
    regulations: { taxRateBps: 1500, notes: "SARB: card-led market" },
    settlement: { cycle: "T_PLUS_1", currency: "ZAR" },
    locale: "en",
    rtl: false,
  },
  GB: {
    code: "GB",
    name: "United Kingdom",
    flagEmoji: "🇬🇧",
    currency: "GBP",
    currencySymbol: "£",
    dialCode: "+44",
    kyc: {
      tier2: { idTypes: ["PASSPORT", "DRIVING_LICENSE"], label: "Verified" },
      tier3: { idTypes: ["PASSPORT"], label: "Premium" },
    },
    regulations: { taxRateBps: 2000, notes: "FCA: Wise for cross-border" },
    settlement: { cycle: "T_PLUS_1", currency: "GBP" },
    locale: "en",
    rtl: false,
  },
  US: {
    code: "US",
    name: "United States",
    flagEmoji: "🇺🇸",
    currency: "USD",
    currencySymbol: "$",
    dialCode: "+1",
    kyc: {
      tier2: { idTypes: ["SSN"], label: "Verified" },
      tier3: { idTypes: ["PASSPORT"], label: "Premium" },
    },
    regulations: { notes: "Stripe for card payments" },
    settlement: { cycle: "T_PLUS_2", currency: "USD" },
    locale: "en",
    rtl: false,
  },
  TZ: {
    code: "TZ",
    name: "Tanzania",
    flagEmoji: "🇹🇿",
    currency: "TZS",
    currencySymbol: "TSh",
    dialCode: "+255",
    kyc: {
      tier2: { idTypes: ["NATIONAL_ID"], label: "Verified" },
      tier3: { idTypes: ["PASSPORT"], label: "Premium" },
    },
    regulations: {},
    settlement: { cycle: "INSTANT", currency: "TZS" },
    locale: "sw",
    rtl: false,
  },
  RW: {
    code: "RW",
    name: "Rwanda",
    flagEmoji: "🇷🇼",
    currency: "RWF",
    currencySymbol: "FRw",
    dialCode: "+250",
    kyc: {
      tier2: { idTypes: ["NATIONAL_ID"], label: "Verified" },
      tier3: { idTypes: ["PASSPORT"], label: "Premium" },
    },
    regulations: {},
    settlement: { cycle: "INSTANT", currency: "RWF" },
    locale: "en",
    rtl: false,
  },
};

// ===== Dynamic Country Registry =====
// Enriches the base config with live provider data from manifests.

export function getCountryRegistry(country: string): CountryRegistryEntry | null {
  const base = COUNTRY_BASE[country.toUpperCase()];
  if (!base) return null;

  // Dynamically discover which providers operate in this country
  const providers = getProvidersForCountry(country).map((m) => m.provider);

  // Dynamically discover which payment methods are available
  const manifests = getProvidersForCountry(country);
  const methodSet = new Set<string>();
  for (const m of manifests) {
    for (const cap of m.capabilities) {
      if (cap.countries.includes(country) || cap.countries.includes("ALL")) {
        methodSet.add(cap.name);
      }
    }
  }

  return {
    ...base,
    providers,
    paymentMethods: Array.from(methodSet),
  };
}

export function getAllCountryRegistries(): CountryRegistryEntry[] {
  return Object.keys(COUNTRY_BASE)
    .map((code) => getCountryRegistry(code))
    .filter((c): c is CountryRegistryEntry => c !== null);
}

// ===== Capability-based provider lookup =====
// "Which providers can collect via CARD in Nigeria?"
export function getProvidersForCapabilityInCountry(
  country: string,
  capability: string,
  direction?: "INBOUND" | "OUTBOUND"
): string[] {
  return getProvidersForCapability(country, capability, direction).map((m) => m.provider);
}
