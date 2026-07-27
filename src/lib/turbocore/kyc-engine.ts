// TurboPay KYC Engine — Country-aware identity verification platform.
//
// Architecture: Country → Required KYC → Provider → Verification Flow
//
// The engine knows which countries we cover (same as our providers),
// what ID types each country requires per tier, which providers can
// verify those IDs, and how to execute the verification flow.
//
// No hardcoding of providers in application logic — the engine routes
// to the best available KYC provider based on country + ID type.

import { db } from "@/lib/db";
import { registry } from "@/lib/turbocore/registry";
import { ContractName } from "@/lib/turbocore/result";
import { route } from "@/lib/turbocore/routing-engine";
import { audit } from "@/lib/api";
import { validateKycId } from "@/lib/turbocore/compliance/screen";

// ===== Country KYC Configuration =====
//
// Each country defines:
// - Tier 2 requirements (basic identity — unlocks higher limits)
// - Tier 3 requirements (enhanced identity — unlocks premium limits)
// - Accepted ID types and their validation rules
// - Preferred KYC providers for that country

export interface CountryKycConfig {
  code: string;
  name: string;
  currency: string;
  flagEmoji: string;
  tiers: {
    tier2: {
      idTypes: IdTypeConfig[];
      label: string;
      singleTxLimitKobo: number;
      dailyLimitKobo: number;
      maxBalanceKobo: number;
    };
    tier3: {
      idTypes: IdTypeConfig[];
      label: string;
      singleTxLimitKobo: number;
      dailyLimitKobo: number;
      maxBalanceKobo: number;
    };
  };
}

export interface IdTypeConfig {
  type: string; // NIN | BVN | KRA_PIN | GHANA_CARD | SA_ID | PASSPORT | etc.
  label: string;
  description: string;
  format: string; // regex pattern for validation
  length?: number;
  preferredProviders: string[]; // provider codes that can verify this ID
  fields: { name: string; label: string; required: boolean; type?: string }[];
}

// ===== Country KYC Registry =====
// Maps each country to its KYC requirements.
// Countries are driven by provider coverage — if our providers serve
// a country, we add it here with the appropriate KYC config.

export const COUNTRY_KYC_CONFIGS: Record<string, CountryKycConfig> = {
  NG: {
    code: "NG",
    name: "Nigeria",
    currency: "NGN",
    flagEmoji: "🇳🇬",
    tiers: {
      tier2: {
        idTypes: [
          {
            type: "NIN",
            label: "National Identification Number",
            description: "11-digit NIN issued by NIMC",
            format: "^\\d{11}$",
            length: 11,
            preferredProviders: ["dojah", "paystack"],
            fields: [{ name: "nin", label: "NIN", required: true }],
          },
        ],
        label: "Verified",
        singleTxLimitKobo: 50_000_000,
        dailyLimitKobo: 200_000_000,
        maxBalanceKobo: 500_000_000,
      },
      tier3: {
        idTypes: [
          {
            type: "BVN",
            label: "Bank Verification Number",
            description: "11-digit BVN issued by CBN",
            format: "^\\d{11}$",
            length: 11,
            preferredProviders: ["paystack", "dojah"],
            fields: [
              { name: "bvn", label: "BVN", required: true },
              { name: "dob", label: "Date of Birth", required: false, type: "date" },
            ],
          },
        ],
        label: "Premium",
        singleTxLimitKobo: 500_000_000,
        dailyLimitKobo: 2_000_000_000,
        maxBalanceKobo: 10_000_000_000,
      },
    },
  },

  KE: {
    code: "KE",
    name: "Kenya",
    currency: "KES",
    flagEmoji: "🇰🇪",
    tiers: {
      tier2: {
        idTypes: [
          {
            type: "KRA_PIN",
            label: "KRA PIN",
            description: "Kenya Revenue Authority Personal Identification Number",
            format: "^[A-Z]\\d{9}[A-Z]$",
            length: 11,
            preferredProviders: ["dojah"],
            fields: [{ name: "kraPin", label: "KRA PIN", required: true }],
          },
        ],
        label: "Verified",
        singleTxLimitKobo: 5_000_000, // KES has no kobo — treat as cents
        dailyLimitKobo: 20_000_000,
        maxBalanceKobo: 50_000_000,
      },
      tier3: {
        idTypes: [
          {
            type: "NATIONAL_ID",
            label: "National ID",
            description: "Kenyan National ID card",
            format: "^\\d{8}$",
            length: 8,
            preferredProviders: ["dojah"],
            fields: [{ name: "idNumber", label: "ID Number", required: true }],
          },
        ],
        label: "Premium",
        singleTxLimitKobo: 50_000_000,
        dailyLimitKobo: 200_000_000,
        maxBalanceKobo: 500_000_000,
      },
    },
  },

  GH: {
    code: "GH",
    name: "Ghana",
    currency: "GHS",
    flagEmoji: "🇬🇭",
    tiers: {
      tier2: {
        idTypes: [
          {
            type: "GHANA_CARD",
            label: "Ghana Card",
            description: "Ghana National Identification card",
            format: "^GHA-\\d{9}-\\d$",
            length: 14,
            preferredProviders: ["dojah"],
            fields: [{ name: "ghanaCard", label: "Ghana Card Number", required: true }],
          },
        ],
        label: "Verified",
        singleTxLimitKobo: 5_000_000,
        dailyLimitKobo: 20_000_000,
        maxBalanceKobo: 50_000_000,
      },
      tier3: {
        idTypes: [
          {
            type: "PASSPORT",
            label: "Passport",
            description: "Ghanaian passport",
            format: "^[A-Z]\\d{7,9}$",
            preferredProviders: ["dojah"],
            fields: [
              { name: "passportNumber", label: "Passport Number", required: true },
              { name: "surname", label: "Surname", required: true },
            ],
          },
        ],
        label: "Premium",
        singleTxLimitKobo: 50_000_000,
        dailyLimitKobo: 200_000_000,
        maxBalanceKobo: 500_000_000,
      },
    },
  },

  UG: {
    code: "UG",
    name: "Uganda",
    currency: "UGX",
    flagEmoji: "🇺🇬",
    tiers: {
      tier2: {
        idTypes: [
          {
            type: "NATIONAL_ID",
            label: "National ID (NIN)",
            description: "Uganda National Identification Number",
            format: "^[A-Z0-9]{14}$",
            length: 14,
            preferredProviders: ["dojah"],
            fields: [{ name: "nin", label: "National ID Number", required: true }],
          },
        ],
        label: "Verified",
        singleTxLimitKobo: 5_000_000,
        dailyLimitKobo: 20_000_000,
        maxBalanceKobo: 50_000_000,
      },
      tier3: {
        idTypes: [
          {
            type: "PASSPORT",
            label: "Passport",
            description: "Ugandan passport",
            format: "^[A-Z]\\d{7,9}$",
            preferredProviders: ["dojah"],
            fields: [{ name: "passportNumber", label: "Passport Number", required: true }],
          },
        ],
        label: "Premium",
        singleTxLimitKobo: 50_000_000,
        dailyLimitKobo: 200_000_000,
        maxBalanceKobo: 500_000_000,
      },
    },
  },

  ZA: {
    code: "ZA",
    name: "South Africa",
    currency: "ZAR",
    flagEmoji: "🇿🇦",
    tiers: {
      tier2: {
        idTypes: [
          {
            type: "SA_ID",
            label: "South African ID",
            description: "13-digit SA ID number",
            format: "^\\d{13}$",
            length: 13,
            preferredProviders: ["dojah"],
            fields: [{ name: "idNumber", label: "ID Number", required: true }],
          },
        ],
        label: "Verified",
        singleTxLimitKobo: 5_000_000,
        dailyLimitKobo: 20_000_000,
        maxBalanceKobo: 50_000_000,
      },
      tier3: {
        idTypes: [
          {
            type: "PASSPORT",
            label: "Passport",
            description: "South African passport",
            format: "^[A-Z]\\d{7,9}$",
            preferredProviders: ["dojah"],
            fields: [{ name: "passportNumber", label: "Passport Number", required: true }],
          },
        ],
        label: "Premium",
        singleTxLimitKobo: 50_000_000,
        dailyLimitKobo: 200_000_000,
        maxBalanceKobo: 500_000_000,
      },
    },
  },

  GB: {
    code: "GB",
    name: "United Kingdom",
    currency: "GBP",
    flagEmoji: "🇬🇧",
    tiers: {
      tier2: {
        idTypes: [
          {
            type: "PASSPORT",
            label: "UK Passport",
            description: "British passport",
            format: "^\\d{9}$",
            length: 9,
            preferredProviders: ["stripe"],
            fields: [{ name: "passportNumber", label: "Passport Number", required: true }],
          },
          {
            type: "DRIVING_LICENSE",
            label: "Driving License",
            description: "UK driving licence number",
            format: "^[A-Z9]{5}\\d{6}[A-Z9]{2}\\d[A-Z]{2}$",
            preferredProviders: ["stripe"],
            fields: [{ name: "licenseNumber", label: "Licence Number", required: true }],
          },
        ],
        label: "Verified",
        singleTxLimitKobo: 5_000_000,
        dailyLimitKobo: 20_000_000,
        maxBalanceKobo: 50_000_000,
      },
      tier3: {
        idTypes: [
          {
            type: "PASSPORT",
            label: "UK Passport",
            description: "British passport (enhanced)",
            format: "^\\d{9}$",
            length: 9,
            preferredProviders: ["stripe"],
            fields: [
              { name: "passportNumber", label: "Passport Number", required: true },
              { name: "surname", label: "Surname", required: true },
            ],
          },
        ],
        label: "Premium",
        singleTxLimitKobo: 50_000_000,
        dailyLimitKobo: 200_000_000,
        maxBalanceKobo: 500_000_000,
      },
    },
  },

  US: {
    code: "US",
    name: "United States",
    currency: "USD",
    flagEmoji: "🇺🇸",
    tiers: {
      tier2: {
        idTypes: [
          {
            type: "SSN",
            label: "Social Security Number",
            description: "9-digit SSN (last 4 required)",
            format: "^\\d{4}$|^\\d{3}-?\\d{2}-?\\d{4}$",
            preferredProviders: ["stripe"],
            fields: [{ name: "ssn", label: "SSN (last 4 digits)", required: true }],
          },
        ],
        label: "Verified",
        singleTxLimitKobo: 5_000_000,
        dailyLimitKobo: 20_000_000,
        maxBalanceKobo: 50_000_000,
      },
      tier3: {
        idTypes: [
          {
            type: "PASSPORT",
            label: "US Passport",
            description: "US passport book number",
            format: "^\\d{9}$|^C\\d{8}$",
            preferredProviders: ["stripe"],
            fields: [{ name: "passportNumber", label: "Passport Number", required: true }],
          },
        ],
        label: "Premium",
        singleTxLimitKobo: 50_000_000,
        dailyLimitKobo: 200_000_000,
        maxBalanceKobo: 500_000_000,
      },
    },
  },

  TZ: {
    code: "TZ",
    name: "Tanzania",
    currency: "TZS",
    flagEmoji: "🇹🇿",
    tiers: {
      tier2: {
        idTypes: [
          {
            type: "NATIONAL_ID",
            label: "National ID (NIDA)",
            description: "Tanzania National Identification",
            format: "^[0-9]{8}$|^[0-9]{12}$",
            preferredProviders: ["dojah"],
            fields: [{ name: "idNumber", label: "NIDA Number", required: true }],
          },
        ],
        label: "Verified",
        singleTxLimitKobo: 5_000_000,
        dailyLimitKobo: 20_000_000,
        maxBalanceKobo: 50_000_000,
      },
      tier3: {
        idTypes: [
          {
            type: "PASSPORT",
            label: "Passport",
            description: "Tanzanian passport",
            format: "^[A-Z]\\d{7,9}$",
            preferredProviders: ["dojah"],
            fields: [{ name: "passportNumber", label: "Passport Number", required: true }],
          },
        ],
        label: "Premium",
        singleTxLimitKobo: 50_000_000,
        dailyLimitKobo: 200_000_000,
        maxBalanceKobo: 500_000_000,
      },
    },
  },

  RW: {
    code: "RW",
    name: "Rwanda",
    currency: "RWF",
    flagEmoji: "🇷🇼",
    tiers: {
      tier2: {
        idTypes: [
          {
            type: "NATIONAL_ID",
            label: "National ID",
            description: "Rwanda National Identification Card",
            format: "^[0-9]{16}$|^119\\d{10}$",
            preferredProviders: ["dojah"],
            fields: [{ name: "idNumber", label: "ID Number", required: true }],
          },
        ],
        label: "Verified",
        singleTxLimitKobo: 5_000_000,
        dailyLimitKobo: 20_000_000,
        maxBalanceKobo: 50_000_000,
      },
      tier3: {
        idTypes: [
          {
            type: "PASSPORT",
            label: "Passport",
            description: "Rwandan passport",
            format: "^[A-Z]\\d{7,9}$",
            preferredProviders: ["dojah"],
            fields: [{ name: "passportNumber", label: "Passport Number", required: true }],
          },
        ],
        label: "Premium",
        singleTxLimitKobo: 50_000_000,
        dailyLimitKobo: 200_000_000,
        maxBalanceKobo: 500_000_000,
      },
    },
  },
};

// ===== KYC Verification Engine =====

export interface KycVerificationRequest {
  userId: string;
  country: string;
  tier: 2 | 3;
  idType: string;
  idValue: string;
  additionalFields?: Record<string, string>;
}

export interface KycVerificationResult {
  success: boolean;
  verified: boolean;
  tier: number;
  provider: string;
  reference: string;
  details?: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    dob?: string;
    raw?: unknown;
  };
  error?: string;
}

/**
 * Get the KYC configuration for a country.
 * Returns null if the country is not supported.
 */
export function getCountryKycConfig(country: string): CountryKycConfig | null {
  return COUNTRY_KYC_CONFIGS[country.toUpperCase()] ?? null;
}

/**
 * List all supported countries with their KYC requirements.
 */
export function listSupportedCountries(): CountryKycConfig[] {
  return Object.values(COUNTRY_KYC_CONFIGS);
}

/**
 * Get the available ID types for a country + tier.
 */
export function getIdTypesForTier(country: string, tier: 2 | 3): IdTypeConfig[] {
  const config = getCountryKycConfig(country);
  if (!config) return [];
  return tier === 2 ? config.tiers.tier2.idTypes : config.tiers.tier3.idTypes;
}

/**
 * Validate an ID value against its format pattern.
 */
export function validateIdFormat(
  idType: string,
  idValue: string,
  country: string,
  tier: 2 | 3
): { valid: boolean; error?: string } {
  const idTypes = getIdTypesForTier(country, tier);
  const idConfig = idTypes.find((t) => t.type === idType);
  if (!idConfig) return { valid: false, error: `Unknown ID type: ${idType}` };

  // Use the compliance screen validator for known types
  const complianceResult = validateKycId(country, idType, idValue);
  if (!complianceResult.valid) return complianceResult;

  // Also check against the format pattern
  if (idConfig.format) {
    const regex = new RegExp(idConfig.format);
    if (!regex.test(idValue)) {
      return { valid: false, error: `${idConfig.label} format is invalid` };
    }
  }

  return { valid: true };
}

/**
 * Route a KYC verification to the best available provider.
 * Uses the provider routing engine + country-specific preferences.
 */
export async function routeKycVerification(
  country: string,
  idType: string,
  tier: 2 | 3
): Promise<string> {
  const config = getCountryKycConfig(country);
  if (!config) throw new Error(`Country not supported: ${country}`);

  const idTypes = tier === 2 ? config.tiers.tier2.idTypes : config.tiers.tier3.idTypes;
  const idConfig = idTypes.find((t) => t.type === idType);
  if (!idConfig) throw new Error(`ID type ${idType} not supported for ${country} tier ${tier}`);

  // Try preferred providers first
  for (const providerCode of idConfig.preferredProviders) {
    const decision = await route({
      contract: "KYC" as ContractName,
      country,
      currency: config.currency,
      amountMinor: 0,
      direction: "INBOUND",
      preferredProvider: providerCode,
    });
    if (decision.providerCode) return decision.providerCode;
  }

  // Fall back to any available KYC provider
  const decision = await route({
    contract: "KYC" as ContractName,
    country,
    currency: config.currency,
    amountMinor: 0,
    direction: "INBOUND",
  });
  return decision.providerCode || "turbopay";
}

/**
 * Execute a KYC verification.
 *
 * Flow:
 * 1. Validate the ID format
 * 2. Route to the best provider
 * 3. Call the provider's verifyIdentity method
 * 4. On success: update user KYC tier + create KycVerification record
 * 5. On failure: return error (no tier change)
 * 6. Audit the verification attempt
 */
export async function verifyIdentity(req: KycVerificationRequest): Promise<KycVerificationResult> {
  const { userId, country, tier, idType, idValue, additionalFields } = req;

  // 1. Validate format
  const formatCheck = validateIdFormat(idType, idValue, country, tier);
  if (!formatCheck.valid) {
    return {
      success: false,
      verified: false,
      tier,
      provider: "",
      reference: "",
      error: formatCheck.error,
    };
  }

  // 2. Route to provider
  let providerCode: string;
  try {
    providerCode = await routeKycVerification(country, idType, tier);
  } catch (e) {
    return {
      success: false,
      verified: false,
      tier,
      provider: "",
      reference: "",
      error: e instanceof Error ? e.message : "KYC routing failed",
    };
  }

  // 3. Call provider
  const reference = `KYC-${userId.slice(0, 8)}-${Date.now().toString(36)}`;
  let providerResult: any = null;

  try {
    const adapter = await registry.resolve("KYC" as ContractName, providerCode);
    providerResult = await adapter.verifyIdentity({
      userId,
      country,
      idType,
      idValue,
    });
  } catch (e) {
    // If provider fails, fall back to mock verification (dev mode)
    if (process.env.NODE_ENV !== "production") {
      providerResult = {
        ok: true,
        data: { tier, verified: true, firstName: "Verified", lastName: "User" },
        providerRequestId: `mock-${reference}`,
      };
    } else {
      return {
        success: false,
        verified: false,
        tier,
        provider: providerCode,
        reference,
        error: "KYC provider unavailable",
      };
    }
  }

  // 4. Process result
  if (providerResult?.ok && providerResult.data?.verified) {
    const data = providerResult.data;

    // Update user
    await db.user.update({
      where: { id: userId },
      data: {
        kycTier: tier,
        kycStatus: "VERIFIED",
        ...(idType === "NIN" ? { nin: idValue } : {}),
        ...(idType === "BVN" ? { bvn: idValue } : {}),
      },
    });

    // Create verification record
    await db.kycVerification.create({
      data: {
        userId,
        tier,
        status: "VERIFIED",
        provider: providerCode,
        nin: idType === "NIN" ? idValue : null,
        bvn: idType === "BVN" ? idValue : null,
        payload: JSON.stringify({
          idType,
          idValue,
          ...additionalFields,
          providerRef: providerResult.providerRequestId,
          details: data,
        }),
        verifiedAt: new Date(),
      },
    });

    // Audit
    await audit({
      userId,
      action: `KYC_TIER_${tier}_VERIFIED`,
      category: "KYC",
      metadata: { country, idType, provider: providerCode, reference },
    });

    return {
      success: true,
      verified: true,
      tier,
      provider: providerCode,
      reference,
      details: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
      },
    };
  }

  // 5. Failure — record the attempt
  await db.kycVerification.create({
    data: {
      userId,
      tier,
      status: "FAILED",
      provider: providerCode,
      nin: idType === "NIN" ? idValue : null,
      bvn: idType === "BVN" ? idValue : null,
      payload: JSON.stringify({
        idType,
        idValue,
        error: providerResult?.error?.message ?? "Verification failed",
      }),
    },
  });

  await audit({
    userId,
    action: `KYC_TIER_${tier}_FAILED`,
    category: "KYC",
    severity: "WARN",
    metadata: {
      country,
      idType,
      provider: providerCode,
      reference,
      error: providerResult?.error?.message,
    },
  });

  return {
    success: false,
    verified: false,
    tier,
    provider: providerCode,
    reference,
    error: providerResult?.error?.message ?? "Identity verification failed",
  };
}

/**
 * Get the user's current KYC status including available upgrades.
 */
export async function getUserKycStatus(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { kycTier: true, kycStatus: true, country: true },
  });
  if (!user) throw new Error("User not found");

  const country = user.country || "NG";
  const config = getCountryKycConfig(country);
  if (!config) {
    return {
      country,
      currentTier: user.kycTier,
      kycStatus: user.kycStatus,
      availableUpgrades: [],
      countryConfig: null,
    };
  }

  const verifications = await db.kycVerification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Determine available upgrades
  const availableUpgrades: {
    tier: 2 | 3;
    idTypes: IdTypeConfig[];
    label: string;
    limits: { singleTx: number; daily: number; maxBalance: number };
  }[] = [];

  if (user.kycTier < 2) {
    availableUpgrades.push({
      tier: 2,
      idTypes: config.tiers.tier2.idTypes,
      label: config.tiers.tier2.label,
      limits: {
        singleTx: config.tiers.tier2.singleTxLimitKobo,
        daily: config.tiers.tier2.dailyLimitKobo,
        maxBalance: config.tiers.tier2.maxBalanceKobo,
      },
    });
  }
  if (user.kycTier < 3) {
    availableUpgrades.push({
      tier: 3,
      idTypes: config.tiers.tier3.idTypes,
      label: config.tiers.tier3.label,
      limits: {
        singleTx: config.tiers.tier3.singleTxLimitKobo,
        daily: config.tiers.tier3.dailyLimitKobo,
        maxBalance: config.tiers.tier3.maxBalanceKobo,
      },
    });
  }

  return {
    country,
    currentTier: user.kycTier,
    kycStatus: user.kycStatus,
    countryConfig: {
      code: config.code,
      name: config.name,
      currency: config.currency,
      flagEmoji: config.flagEmoji,
    },
    availableUpgrades,
    verificationHistory: verifications,
  };
}
