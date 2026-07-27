// TurboCore — MTPA Tenant Registry (Chapter 11)
//
// The central registry of all tenants on the platform. Each tenant is an
// isolated organization with its own configuration, providers, fees,
// branding, and policies.
//
// "One TurboCore. Unlimited businesses."

import type {
  Tenant,
  TenantConfig,
  TenantStats,
  TenantLifecycle,
  TenantTier,
  TenantEnvironment,
} from "./types";
import { generateId } from "@/lib/turbocore/database/ids";

// ---------------------------------------------------------------------------
// Seeded tenants (the platform starts with TurboPay as the default tenant)
// ---------------------------------------------------------------------------

const NOW = new Date().toISOString();

export const TENANTS: Tenant[] = [
  {
    id: "tenant_turbopay",
    code: "turbopay",
    name: "TurboPay Consumer",
    displayName: "TurboPay",
    description: "The consumer-facing TurboPay app — wallet, transfers, bills, cards.",
    tier: "WHITE_LABEL",
    lifecycle: "ACTIVATED",
    environment: "PRODUCTION",
    country: "NG",
    currency: "NGN",
    domain: "turbopay.ng",
    createdAt: NOW,
    activatedAt: NOW,
    suspendedAt: null,
    parentId: null,
  },
  {
    id: "tenant_turbopay_business",
    code: "turbopay_business",
    name: "TurboPay Business",
    displayName: "TurboPay Business",
    description: "Business banking — merchant collections, payouts, settlements.",
    tier: "ENTERPRISE",
    lifecycle: "ACTIVATED",
    environment: "PRODUCTION",
    country: "NG",
    currency: "NGN",
    domain: "business.turbopay.ng",
    createdAt: NOW,
    activatedAt: NOW,
    suspendedAt: null,
    parentId: "tenant_turbopay",
  },
  {
    id: "tenant_bank_a",
    code: "bank_a",
    name: "Bank A — White Label",
    displayName: "Bank A Digital Banking",
    description: "White-label payment infrastructure for Bank A.",
    tier: "WHITE_LABEL",
    lifecycle: "ACTIVATED",
    environment: "PRODUCTION",
    country: "NG",
    currency: "NGN",
    domain: "payments.bank-a.com",
    createdAt: NOW,
    activatedAt: NOW,
    suspendedAt: null,
    parentId: null,
  },
  {
    id: "tenant_fintech_b",
    code: "fintech_b",
    name: "Fintech B — Embedded Finance",
    displayName: "Fintech B",
    description: "Embedded finance APIs for Fintech B's platform.",
    tier: "GROWTH",
    lifecycle: "ACTIVATED",
    environment: "PRODUCTION",
    country: "KE",
    currency: "KES",
    domain: "api.fintech-b.co.ke",
    createdAt: NOW,
    activatedAt: NOW,
    suspendedAt: null,
    parentId: null,
  },
  {
    id: "tenant_gov_c",
    code: "gov_c",
    name: "Government C — Payment Infrastructure",
    displayName: "GovPay",
    description: "Payment infrastructure for government collections and disbursements.",
    tier: "ENTERPRISE",
    lifecycle: "ACTIVATED",
    environment: "PRODUCTION",
    country: "NG",
    currency: "NGN",
    domain: "pay.gov.c.ng",
    createdAt: NOW,
    activatedAt: NOW,
    suspendedAt: null,
    parentId: null,
  },
  {
    id: "tenant_marketplace_d",
    code: "marketplace_d",
    name: "Marketplace D — Split Payments",
    displayName: "Marketplace D",
    description: "Marketplace payment splitting + escrow for Marketplace D.",
    tier: "GROWTH",
    lifecycle: "CONFIGURED",
    environment: "SANDBOX",
    country: "GH",
    currency: "GHS",
    domain: "pay.marketplace-d.com",
    createdAt: NOW,
    activatedAt: null,
    suspendedAt: null,
    parentId: null,
  },
  {
    id: "tenant_enterprise_e",
    code: "enterprise_e",
    name: "Enterprise E — Corporate Payouts",
    displayName: "Enterprise E",
    description: "Corporate payroll + vendor payouts for Enterprise E.",
    tier: "ENTERPRISE",
    lifecycle: "VERIFIED",
    environment: "UAT",
    country: "ZA",
    currency: "ZAR",
    domain: "pay.enterprise-e.co.za",
    createdAt: NOW,
    activatedAt: null,
    suspendedAt: null,
    parentId: null,
  },
];

// ---------------------------------------------------------------------------
// Default tenant configuration factory
// ---------------------------------------------------------------------------

function defaultConfig(tenant: Tenant): TenantConfig {
  const isWhiteLabel = tenant.tier === "WHITE_LABEL";
  const isEnterprise = tenant.tier === "ENTERPRISE";
  const isGovernment = tenant.code.startsWith("gov_");

  return {
    tenantId: tenant.id,
    primaryProvider: tenant.country === "KE" ? "mpesa" : "paystack",
    secondaryProviders:
      tenant.country === "KE" ? ["mtn-momo", "airtel-money"] : ["flutterwave", "monnify"],
    enabledProviders:
      tenant.country === "KE"
        ? ["mpesa", "mtn-momo", "airtel-money", "turbopay"]
        : ["paystack", "flutterwave", "monnify", "turbopay"],
    routingPriority: isEnterprise ? "HIGHEST_SUCCESS" : isGovernment ? "BALANCED" : "LOWEST_COST",
    fees: {
      transferFeeMinor: isEnterprise ? 0 : isGovernment ? 500 : 1000,
      transferFeeCurrency: tenant.currency,
      paymentFeeBps: isEnterprise ? 100 : isWhiteLabel ? 150 : 200,
      paymentFeeFixedMinor: isEnterprise ? 0 : 1000,
      payoutFeeBps: isEnterprise ? 50 : 100,
      payoutFeeFixedMinor: isEnterprise ? 0 : 500,
      fxSpreadBps: isEnterprise ? 100 : 200,
    },
    limits: {
      dailyTransferLimitMinor: isEnterprise
        ? 100_000_000_00
        : isGovernment
          ? 500_000_000_00
          : 5_000_000_00,
      monthlyTransferLimitMinor: isEnterprise
        ? 2_000_000_000_00
        : isGovernment
          ? 10_000_000_000_00
          : 50_000_000_00,
      singleTransactionLimitMinor: isEnterprise ? 10_000_000_00 : 1_000_000_00,
      dailyApiCalls: isEnterprise ? 1_000_000 : isWhiteLabel ? 500_000 : 100_000,
    },
    risk: {
      maxRiskScore: isEnterprise ? 80 : 60,
      requireMfaAbove: isEnterprise ? 1_000_000_00 : 500_000_00,
      velocityLimitPerHour: isEnterprise ? 1000 : 100,
    },
    compliance: {
      kycRequired: true,
      kycTierRequired: isEnterprise ? 3 : 2,
      amlScreening: true,
      sanctionsScreening: true,
      regulatoryBody:
        tenant.country === "NG"
          ? "CBN"
          : tenant.country === "KE"
            ? "CBK"
            : tenant.country === "GH"
              ? "BoG"
              : tenant.country === "ZA"
                ? "SARB"
                : null,
    },
    features: {
      stablecoins: !isGovernment,
      crypto: false,
      international_transfers: isEnterprise || isWhiteLabel,
      virtual_cards: true,
      mobile_money: tenant.country !== "NG" || tenant.code === "turbopay",
      marketplace: tenant.code.includes("marketplace"),
      escrow: tenant.code.includes("marketplace") || isEnterprise,
    },
    branding: {
      logoUrl: null,
      primaryColor: isWhiteLabel ? "#1a56db" : "#059669",
      secondaryColor: isWhiteLabel ? "#7c3aed" : "#d97706",
      typography: "Geist",
      emailTemplate: null,
      receiptTemplate: null,
      supportContact: `support@${tenant.domain ?? "turbopay.ng"}`,
      customDomain: tenant.domain,
    },
    webhookConfig: {
      url: tenant.domain ? `https://${tenant.domain}/webhooks` : null,
      secretHash: null,
      events: ["PAYMENT.COMPLETED", "PAYMENT.FAILED", "REFUND.COMPLETED", "SETTLEMENT.COMPLETED"],
      enabled: tenant.lifecycle === "ACTIVATED",
    },
    teamRoles: ["OWNER", "ADMIN", "FINANCE", "SUPPORT", "COMPLIANCE", "DEVELOPER", "AUDITOR"],
    apiKeys: {
      sandbox: {
        publicKey: `pk_test_${tenant.code}_${generateId("EVENT_STORE").slice(0, 16)}`,
        privateKeyHash: `hash_${generateId("EVENT_STORE").slice(0, 32)}`,
      },
      production: {
        publicKey: `pk_live_${tenant.code}_${generateId("EVENT_STORE").slice(0, 16)}`,
        privateKeyHash: `hash_${generateId("EVENT_STORE").slice(0, 32)}`,
      },
    },
    version: 1,
    updatedAt: NOW,
    updatedBy: null,
  };
}

// ---------------------------------------------------------------------------
// Tenant configuration store (with caching + versioning)
// ---------------------------------------------------------------------------

const configCache = new Map<string, TenantConfig>();

export function getTenantConfig(tenantId: string): TenantConfig | null {
  if (configCache.has(tenantId)) return configCache.get(tenantId)!;
  const tenant = TENANTS.find((t) => t.id === tenantId);
  if (!tenant) return null;
  const config = defaultConfig(tenant);
  configCache.set(tenantId, config);
  return config;
}

export function updateTenantConfig(
  tenantId: string,
  updates: Partial<TenantConfig>,
  updatedBy: string
): boolean {
  const current = getTenantConfig(tenantId);
  if (!current) return false;
  const updated: TenantConfig = {
    ...current,
    ...updates,
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
  configCache.set(tenantId, updated);
  return true;
}

// ---------------------------------------------------------------------------
// Tenant resolution (Chapter 11 — every request resolves a tenant)
// ---------------------------------------------------------------------------

export function resolveTenant(params: {
  domain?: string | null;
  apiKey?: string | null;
  tenantCode?: string | null;
  tenantId?: string | null;
}): {
  resolved: boolean;
  tenantId: string | null;
  tenantCode: string | null;
  source: string;
  error?: string;
} {
  // 1. Direct tenantId
  if (params.tenantId) {
    const tenant = TENANTS.find((t) => t.id === params.tenantId);
    if (tenant)
      return { resolved: true, tenantId: tenant.id, tenantCode: tenant.code, source: "HEADER" };
  }

  // 2. Tenant code
  if (params.tenantCode) {
    const tenant = TENANTS.find((t) => t.code === params.tenantCode);
    if (tenant)
      return { resolved: true, tenantId: tenant.id, tenantCode: tenant.code, source: "HEADER" };
  }

  // 3. Domain
  if (params.domain) {
    const tenant = TENANTS.find(
      (t) => t.domain === params.domain || t.domain?.includes(params.domain!)
    );
    if (tenant)
      return { resolved: true, tenantId: tenant.id, tenantCode: tenant.code, source: "DOMAIN" };
  }

  // 4. API key
  if (params.apiKey) {
    for (const t of TENANTS) {
      const config = getTenantConfig(t.id);
      if (
        config &&
        (config.apiKeys.sandbox.publicKey === params.apiKey ||
          config.apiKeys.production.publicKey === params.apiKey)
      ) {
        return { resolved: true, tenantId: t.id, tenantCode: t.code, source: "API_KEY" };
      }
    }
  }

  // 5. Default tenant (TurboPay)
  const defaultTenant = TENANTS[0];
  return {
    resolved: true,
    tenantId: defaultTenant.id,
    tenantCode: defaultTenant.code,
    source: "DEFAULT",
  };
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function getTenant(id: string): Tenant | undefined {
  return TENANTS.find((t) => t.id === id);
}

export function getTenantByCode(code: string): Tenant | undefined {
  return TENANTS.find((t) => t.code === code);
}

export function getTenantsByParent(parentId: string): Tenant[] {
  return TENANTS.filter((t) => t.parentId === parentId);
}

export function getTenantsByTier(tier: TenantTier): Tenant[] {
  return TENANTS.filter((t) => t.tier === tier);
}

export function getTenantsByLifecycle(lifecycle: TenantLifecycle): Tenant[] {
  return TENANTS.filter((t) => t.lifecycle === lifecycle);
}

export function getTenantsByEnvironment(env: TenantEnvironment): Tenant[] {
  return TENANTS.filter((t) => t.environment === env);
}

// ---------------------------------------------------------------------------
// Lifecycle management
// ---------------------------------------------------------------------------

export function transitionLifecycle(tenantId: string, newLifecycle: TenantLifecycle): boolean {
  const tenant = TENANTS.find((t) => t.id === tenantId);
  if (!tenant) return false;
  // Validate transition
  const validTransitions: Record<TenantLifecycle, TenantLifecycle[]> = {
    CREATED: ["CONFIGURED"],
    CONFIGURED: ["VERIFIED", "ARCHIVED"],
    VERIFIED: ["ACTIVATED", "ARCHIVED"],
    ACTIVATED: ["SUSPENDED", "ARCHIVED"],
    SUSPENDED: ["ACTIVATED", "ARCHIVED"],
    ARCHIVED: [],
  };
  if (!validTransitions[tenant.lifecycle]?.includes(newLifecycle)) return false;
  tenant.lifecycle = newLifecycle;
  if (newLifecycle === "ACTIVATED" && !tenant.activatedAt)
    tenant.activatedAt = new Date().toISOString();
  if (newLifecycle === "SUSPENDED") tenant.suspendedAt = new Date().toISOString();
  return true;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function getTenantStats(): TenantStats {
  const byLifecycle = {} as Record<TenantLifecycle, number>;
  const byTier = {} as Record<TenantTier, number>;
  const byEnvironment = {} as Record<TenantEnvironment, number>;
  for (const t of TENANTS) {
    byLifecycle[t.lifecycle] = (byLifecycle[t.lifecycle] ?? 0) + 1;
    byTier[t.tier] = (byTier[t.tier] ?? 0) + 1;
    byEnvironment[t.environment] = (byEnvironment[t.environment] ?? 0) + 1;
  }
  return {
    totalTenants: TENANTS.length,
    byLifecycle,
    byTier,
    byEnvironment,
    activeTenants: TENANTS.filter((t) => t.lifecycle === "ACTIVATED").length,
    suspendedTenants: TENANTS.filter((t) => t.lifecycle === "SUSPENDED").length,
    totalCustomers: 0, // would query DB in production
    totalTransactions: 0,
    totalVolumeMinor: 0,
    totalVolumeCurrency: "NGN",
  };
}
