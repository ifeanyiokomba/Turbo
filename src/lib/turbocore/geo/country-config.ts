// TurboCore georouting — country detection + per-country config cache.

import { db } from "@/lib/db";

export interface CountryConfig {
  code: string;
  name: string;
  currency: string;
  dialCode: string;
  flagEmoji: string;
  locale: string;
  rtl: boolean;
  paymentMethods: string[];
  billerCatalogKey?: string;
  kycRequirements: { tier2: string[]; tier3: string[] };
  providersPreferred: Record<string, string[]>;
  taxRateBps: number;
  regulatoryNotes?: string;
  enabled: boolean;
}

const DEFAULT_COUNTRIES: CountryConfig[] = [
  {
    code: "NG", name: "Nigeria", currency: "NGN", dialCode: "+234", flagEmoji: "🇳🇬",
    locale: "en", rtl: false, paymentMethods: ["CARD", "BANK_TRANSFER", "USSD", "VIRTUAL_ACCOUNT"],
    billerCatalogKey: "ng_baxi",
    kycRequirements: { tier2: ["NIN"], tier3: ["BVN"] },
    providersPreferred: {
      BANK_TRANSFER: ["paystack", "flutterwave"],
      BILL_PAYMENT: ["baxi", "remita", "quickteller", "paga"],
      AIRTIME: ["baxi", "quickteller"],
      VIRTUAL_ACCOUNT: ["monnify", "paystack"],
      MOBILE_MONEY: ["smartcash", "paga"],
      KYC: ["dojah", "paystack"],
    },
    taxRateBps: 750, regulatoryNotes: "CBN: fintechs route inbound via licensed IMTO partner",
    enabled: true,
  },
  {
    code: "KE", name: "Kenya", currency: "KES", dialCode: "+254", flagEmoji: "🇰🇪",
    locale: "sw", rtl: false, paymentMethods: ["CARD", "MOBILE_MONEY", "BANK_TRANSFER"],
    billerCatalogKey: "ke_kplc",
    kycRequirements: { tier2: ["KRA_PIN"], tier3: ["NATIONAL_ID"] },
    providersPreferred: { MOBILE_MONEY: ["mpesa", "airtel_money"], CARD_PAYMENT: ["flutterwave"] },
    taxRateBps: 0, regulatoryNotes: "CBK: M-Pesa STK push for collections",
    enabled: true,
  },
  {
    code: "GH", name: "Ghana", currency: "GHS", dialCode: "+233", flagEmoji: "🇬🇭",
    locale: "en", rtl: false, paymentMethods: ["CARD", "MOBILE_MONEY", "BANK_TRANSFER"],
    billerCatalogKey: "gh_ecg",
    kycRequirements: { tier2: ["GHANA_CARD"], tier3: ["DVLA"] },
    providersPreferred: { MOBILE_MONEY: ["mtn_momo", "airtel_money"], CARD_PAYMENT: ["flutterwave"] },
    taxRateBps: 0, regulatoryNotes: "BoG: MoMo via MTN MoMo API",
    enabled: true,
  },
  {
    code: "ZA", name: "South Africa", currency: "ZAR", dialCode: "+27", flagEmoji: "🇿🇦",
    locale: "en", rtl: false, paymentMethods: ["CARD", "BANK_TRANSFER", "VIRTUAL_ACCOUNT"],
    kycRequirements: { tier2: ["SA_ID"], tier3: ["PASSPORT"] },
    providersPreferred: { CARD_PAYMENT: ["stripe"], BANK_TRANSFER: ["flutterwave"] },
    taxRateBps: 1500, regulatoryNotes: "SARB: card-led market",
    enabled: true,
  },
  {
    code: "GB", name: "United Kingdom", currency: "GBP", dialCode: "+44", flagEmoji: "🇬🇧",
    locale: "en", rtl: false, paymentMethods: ["CARD", "BANK_TRANSFER"],
    kycRequirements: { tier2: ["PASSPORT"], tier3: ["DRIVING_LICENSE"] },
    providersPreferred: { CARD_PAYMENT: ["stripe"], INTERNATIONAL_TRANSFER: ["wise"] },
    taxRateBps: 2000, regulatoryNotes: "FCA: Wise for cross-border",
    enabled: true,
  },
  {
    code: "US", name: "United States", currency: "USD", dialCode: "+1", flagEmoji: "🇺🇸",
    locale: "en", rtl: false, paymentMethods: ["CARD", "BANK_TRANSFER"],
    kycRequirements: { tier2: ["SSN"], tier3: ["PASSPORT"] },
    providersPreferred: { CARD_PAYMENT: ["stripe"], INTERNATIONAL_TRANSFER: ["wise"] },
    taxRateBps: 0, regulatoryNotes: "Stripe for card payments",
    enabled: true,
  },
];

let cache: { ts: number; configs: Map<string, CountryConfig> } | null = null;
const CACHE_TTL = 5 * 60_000;

export async function getCountryConfig(code: string): Promise<CountryConfig> {
  const all = await loadAll();
  return all.get(code) ?? all.get("NG")!;
}

export async function getAllCountryConfigs(): Promise<CountryConfig[]> {
  const all = await loadAll();
  return Array.from(all.values());
}

async function loadAll(): Promise<Map<string, CountryConfig>> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.configs;
  const map = new Map<string, CountryConfig>();
  try {
    const rows = await db.countryConfig.findMany({ where: { enabled: true } });
    if (rows.length > 0) {
      for (const r of rows) {
        map.set(r.code, dbRowToConfig(r));
      }
    } else {
      for (const c of DEFAULT_COUNTRIES) map.set(c.code, c);
    }
  } catch {
    for (const c of DEFAULT_COUNTRIES) map.set(c.code, c);
  }
  cache = { ts: Date.now(), configs: map };
  return map;
}

function dbRowToConfig(r: any): CountryConfig {
  return {
    code: r.code,
    name: r.name,
    currency: r.currency,
    dialCode: r.dialCode,
    flagEmoji: r.flagEmoji,
    locale: r.locale,
    rtl: r.rtl,
    paymentMethods: JSON.parse(r.paymentMethodsJSON || "[]"),
    billerCatalogKey: r.billerCatalogKey ?? undefined,
    kycRequirements: JSON.parse(r.kycRequirementsJSON || "{}"),
    providersPreferred: JSON.parse(r.providersPreferredJSON || "{}"),
    taxRateBps: r.taxRateBps,
    regulatoryNotes: r.regulatoryNotes ?? undefined,
    enabled: r.enabled,
  };
}

export function detectCountryFromHeaders(headers: Headers, fallback = "NG"): string {
  // 1. x-geoip-country (set by CDN/proxy in prod)
  const geo = headers.get("x-geoip-country");
  if (geo) return geo.toUpperCase();
  // 2. accept-language heuristic
  const lang = headers.get("accept-language") ?? "";
  if (lang.toLowerCase().startsWith("sw")) return "KE";
  if (lang.toLowerCase().startsWith("fr")) return "GH"; // francophone africa fallback
  if (lang.toLowerCase().startsWith("ar")) return "EG";
  return fallback;
}

export async function seedCountryConfigs(): Promise<void> {
  for (const c of DEFAULT_COUNTRIES) {
    await db.countryConfig.upsert({
      where: { code: c.code },
      create: {
        code: c.code,
        name: c.name,
        currency: c.currency,
        dialCode: c.dialCode,
        flagEmoji: c.flagEmoji,
        locale: c.locale,
        rtl: c.rtl,
        paymentMethodsJSON: JSON.stringify(c.paymentMethods),
        billerCatalogKey: c.billerCatalogKey ?? null,
        kycRequirementsJSON: JSON.stringify(c.kycRequirements),
        providersPreferredJSON: JSON.stringify(c.providersPreferred),
        taxRateBps: c.taxRateBps,
        regulatoryNotes: c.regulatoryNotes ?? null,
      },
      // Sync the consolidated providersPreferred list on every seed so the
      // country-config.ts constant stays the single source of truth. Other
      // columns are left untouched so admins can still tweak locale, tax,
      // regulatory notes etc. without being clobbered by re-seeds.
      update: {
        providersPreferredJSON: JSON.stringify(c.providersPreferred),
        paymentMethodsJSON: JSON.stringify(c.paymentMethods),
      },
    });
  }
}
