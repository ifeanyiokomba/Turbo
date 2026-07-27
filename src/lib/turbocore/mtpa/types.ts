// TurboCore — MTPA Types (Chapter 11: Multi-Tenant Platform Architecture)
//
// "One TurboCore. Unlimited businesses."
//
// Every object carries a tenantId. Tenant context is mandatory.
// No tenant. No processing.

// ---------------------------------------------------------------------------
// Tenant lifecycle (Chapter 11)
// ---------------------------------------------------------------------------

export type TenantLifecycle =
  "CREATED" | "CONFIGURED" | "VERIFIED" | "ACTIVATED" | "SUSPENDED" | "ARCHIVED";

// ---------------------------------------------------------------------------
// Tenant environment (Chapter 11)
// ---------------------------------------------------------------------------

export type TenantEnvironment = "DEVELOPMENT" | "SANDBOX" | "UAT" | "PRODUCTION";

// ---------------------------------------------------------------------------
// Tenant tier (for billing + feature access)
// ---------------------------------------------------------------------------

export type TenantTier = "STARTER" | "GROWTH" | "ENTERPRISE" | "WHITE_LABEL";

// ---------------------------------------------------------------------------
// The Tenant object (Chapter 11)
// ---------------------------------------------------------------------------

export interface Tenant {
  id: string; // tenant_01H7...
  code: string; // "turbopay" | "bank_x" | "fintech_b"
  name: string;
  displayName: string;
  description: string;
  tier: TenantTier;
  lifecycle: TenantLifecycle;
  environment: TenantEnvironment;
  country: string;
  currency: string;
  domain: string | null;
  createdAt: string;
  activatedAt: string | null;
  suspendedAt: string | null;
  parentId: string | null; // for tenant hierarchy (organization → tenant)
}

// ---------------------------------------------------------------------------
// Tenant configuration (Chapter 11 — per-tenant config)
// ---------------------------------------------------------------------------

export interface TenantConfig {
  tenantId: string;
  // Provider configuration
  primaryProvider: string;
  secondaryProviders: string[];
  enabledProviders: string[];
  // Routing
  routingPriority: "LOWEST_COST" | "HIGHEST_SUCCESS" | "FASTEST" | "BALANCED";
  // Fees
  fees: {
    transferFeeMinor: number;
    transferFeeCurrency: string;
    paymentFeeBps: number;
    paymentFeeFixedMinor: number;
    payoutFeeBps: number;
    payoutFeeFixedMinor: number;
    fxSpreadBps: number;
  };
  // Limits
  limits: {
    dailyTransferLimitMinor: number;
    monthlyTransferLimitMinor: number;
    singleTransactionLimitMinor: number;
    dailyApiCalls: number;
  };
  // Risk
  risk: {
    maxRiskScore: number;
    requireMfaAbove: number; // amount in minor units
    velocityLimitPerHour: number;
  };
  // Compliance
  compliance: {
    kycRequired: boolean;
    kycTierRequired: number;
    amlScreening: boolean;
    sanctionsScreening: boolean;
    regulatoryBody: string | null;
  };
  // Features (per-tenant feature flags)
  features: Record<string, boolean>;
  // Branding (white-label)
  branding: TenantBranding;
  // Webhooks
  webhookConfig: {
    url: string | null;
    secretHash: string | null;
    events: string[];
    enabled: boolean;
  };
  // Team roles
  teamRoles: string[];
  // API keys
  apiKeys: {
    sandbox: { publicKey: string; privateKeyHash: string };
    production: { publicKey: string; privateKeyHash: string };
  };
  // Updated
  version: number;
  updatedAt: string;
  updatedBy: string | null;
}

// ---------------------------------------------------------------------------
// Tenant branding (Chapter 11 — white-label)
// ---------------------------------------------------------------------------

export interface TenantBranding {
  logoUrl: string | null;
  primaryColor: string; // hex
  secondaryColor: string;
  typography: string;
  emailTemplate: string | null;
  receiptTemplate: string | null;
  supportContact: string | null;
  customDomain: string | null;
}

// ---------------------------------------------------------------------------
// Tenant policy (Chapter 11 — Production Enhancement #3)
// ---------------------------------------------------------------------------

export interface TenantPolicy {
  id: string;
  tenantId: string;
  category: "TRANSFERS" | "REFUNDS" | "PAYOUTS" | "PAYMENTS" | "CARDS" | "COMPLIANCE";
  name: string;
  description: string;
  rules: TenantPolicyRule[];
  enabled: boolean;
  priority: number;
  updatedAt: string;
}

export interface TenantPolicyRule {
  field: string; // e.g. "amount", "currency", "country", "riskScore"
  operator: "GT" | "LT" | "GTE" | "LTE" | "EQ" | "IN";
  value: unknown;
  action: "REQUIRE_MFA" | "REQUIRE_APPROVAL" | "REQUIRE_DUAL_APPROVAL" | "BLOCK" | "FLAG";
  approverRole?: string;
}

// ---------------------------------------------------------------------------
// Tenant billing (Chapter 11)
// ---------------------------------------------------------------------------

export interface TenantBilling {
  tenantId: string;
  billingCycle: "MONTHLY" | "QUARTERLY" | "ANNUAL";
  currentPeriod: {
    start: string;
    end: string;
  };
  usage: {
    apiCalls: number;
    transactions: number;
    storageMb: number;
    documents: number;
    users: number;
    providers: number;
    settlementVolumeMinor: number;
    settlementVolumeCurrency: string;
  };
  charges: {
    baseFeeMinor: number;
    perTransactionFeeMinor: number;
    apiCallFeeMinor: number;
    storageFeeMinorPerMb: number;
    totalMinor: number;
    currency: string;
  };
}

// ---------------------------------------------------------------------------
// Tenant resolution (Chapter 11)
// ---------------------------------------------------------------------------

export interface TenantResolution {
  resolved: boolean;
  tenantId: string | null;
  tenantCode: string | null;
  source: "DOMAIN" | "API_KEY" | "JWT" | "HEADER" | "DEFAULT";
  error?: string;
}

// ---------------------------------------------------------------------------
// Cross-tenant operation (Chapter 11 — restricted + audited)
// ---------------------------------------------------------------------------

export interface CrossTenantOperation {
  id: string;
  operation: string;
  performedBy: string;
  targetTenants: string[];
  reason: string;
  timestamp: string;
  audited: boolean;
}

// ---------------------------------------------------------------------------
// Tenant stats
// ---------------------------------------------------------------------------

export interface TenantStats {
  totalTenants: number;
  byLifecycle: Record<TenantLifecycle, number>;
  byTier: Record<TenantTier, number>;
  byEnvironment: Record<TenantEnvironment, number>;
  activeTenants: number;
  suspendedTenants: number;
  totalCustomers: number;
  totalTransactions: number;
  totalVolumeMinor: number;
  totalVolumeCurrency: string;
}
