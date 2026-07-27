// TurboCore — Global Capability Registry (GCR)
//
// Chapter 7 of the TurboPay Bible.
//
// Until now TurboCore knew about *providers*. The GCR is the platform's
// capability-first knowledge layer: TurboCore routes to **Capabilities**,
// never to providers. Providers merely implement them.
//
//   Financial Domain
//       ↓
//   Capability Group       (e.g. "Collections")
//       ↓
//   Capability             (e.g. "Card Payments")
//       ↓
//   Feature                (e.g. "Tokenization")
//       ↓
//   Provider Implementation (e.g. Stripe / Paystack)
//
// If tomorrow 200 new providers emerge, TurboCore does not change.
// Only the Capability Registry grows.
//
// This file is the single source of truth for every GCR type. The catalogue
// itself lives in `capability-tree.ts`; the dependency edges live in
// `knowledge-graph.ts`; the country/provider matrices live in
// `country-matrix.ts` / `provider-matrix.ts`.

// ---------------------------------------------------------------------------
// Capability status
// ---------------------------------------------------------------------------

export type CapabilityStatus =
  | "STABLE" // generally available, certified, production-routable
  | "BETA" // enabled in production but gated behind a flag
  | "EXPERIMENTAL" // sandbox only, not routable in production
  | "DEPRECATED" // superseded by a newer capability version
  | "PLANNED"; // declared in the catalogue but no provider implements it yet

// ---------------------------------------------------------------------------
// Capability metadata — the "what" (never the "who")
// ---------------------------------------------------------------------------

export interface CapabilityFeature {
  /** Stable slug, e.g. "tokenization" / "3ds" / "partial_refund". */
  slug: string;
  /** Human label. */
  name: string;
  /** Short description of what the feature unlocks. */
  description: string;
  /** Whether this feature is mandatory for the parent capability to be "STABLE". */
  mandatory?: boolean;
  /** Feature version, independent of the capability version. */
  version?: string;
}

export interface CapabilityVersion {
  version: string; // "v1" | "v2" | "v3"
  label: string; // "Simple Link"
  releaseNotes?: string;
  status: CapabilityStatus;
  /** Whether this version is the one the resolution engine should prefer. */
  current?: boolean;
}

export interface CapabilityDependency {
  /** Capability slug that this capability depends on. */
  capabilityId: string;
  /** Whether the dependency is hard (required) or soft (recommended). */
  kind: "REQUIRES" | "RECOMMENDS" | "OPTIONAL";
  /** Human explanation of why the dependency exists. */
  reason?: string;
}

export interface CapabilityCertification {
  /** Test slug — e.g. "full_refund" / "partial_refund" / "duplicate_refund". */
  slug: string;
  name: string;
  description: string;
  /** Whether the test is mandatory for certification. */
  mandatory: boolean;
  category: CertificationCategory;
}

export type CertificationCategory =
  "FUNCTIONAL" | "EDGE_CASE" | "FAILURE_MODE" | "COMPLIANCE" | "PERFORMANCE" | "SECURITY";

/**
 * Capability certification status — mirrors the provider-level
 * CertificationStatus in src/lib/turbocore/certification.ts. Re-declared here
 * so the GCR module is self-contained.
 */
export type CertificationStatus = "PENDING" | "IN_PROGRESS" | "CERTIFIED" | "FAILED";

export interface CapabilityDocumentation {
  /** Functional description — what this capability does. */
  functional: string;
  /** Business rules that govern when it can run. */
  businessRules: string[];
  /** Technical contract — request/response shape, error codes. */
  technicalContract: string;
  /** Permissions a caller must hold to invoke this capability. */
  requiredPermissions: string[];
  /** Compliance requirements (PCI, 3DS, AML, etc.). */
  complianceRequirements: string[];
  /** Expected failure scenarios. */
  failureScenarios: string[];
  /** UX expectations for the end customer. */
  uxExpectations: string;
}

// ---------------------------------------------------------------------------
// The Capability object — first-class citizen of TurboCore
// ---------------------------------------------------------------------------

export interface Capability {
  /** Stable, unique slug, e.g. "collections.cards". */
  id: string;
  /** Human-friendly name. */
  name: string;
  /** Description for the developer portal. */
  description: string;
  /** Group this capability belongs to — e.g. "collections". */
  groupId: string;
  /** Direction of money/data flow. */
  direction: CapabilityDirection;
  /** Lifecycle status. */
  status: CapabilityStatus;
  /** ISO-3166 country codes this capability is meaningful in (["ALL"] = global). */
  countries: string[];
  /** ISO-4217 currencies this capability settles in (["ALL"] = any). */
  currencies: string[];
  /** KYC tier a customer must hold before this capability is unlocked. */
  requiredKycTier: KycTier;
  /** Behavioural flags — derived from the catalogue, not from providers. */
  supportsRecurring: boolean;
  supportsRefunds: boolean;
  supportsChargeback: boolean;
  supportsPartial: boolean;
  supportsSplit: boolean;
  /**
   * Providers that implement this capability — ATTACHED, not embedded.
   *
   * The spec is explicit: "Providers are attached. Not embedded." This field
   * is a list of provider codes (e.g. ["paystack", "flutterwave", "stripe"])
   * that the provider-matrix declares as implementing this capability. It is
   * populated at runtime by the provider-matrix — the catalogue itself never
   * hardcodes provider names (AI Agent Rule #2).
   *
   * When empty, the capability has no declared providers yet (PLANNED state).
   */
  providers: string[];
  /** Sub-features. */
  features: CapabilityFeature[];
  /** Declared versions. */
  versions: CapabilityVersion[];
  /** Declared dependencies (knowledge-graph edges). */
  dependencies: CapabilityDependency[];
  /** Certification suite a provider must pass to implement this capability. */
  certification: CapabilityCertification[];
  /** Documentation block. */
  documentation: CapabilityDocumentation;
  /** Audit metadata. */
  createdAt: string;
  updatedAt: string;
  /** Tags for the developer portal search. */
  tags: string[];
}

export type CapabilityDirection = "INBOUND" | "OUTBOUND" | "BOTH" | "NEUTRAL";

export type KycTier = 0 | 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Capability Group — second level of the pyramid
// ---------------------------------------------------------------------------

export interface CapabilityGroup {
  /** Stable slug, e.g. "collections" / "disbursements". */
  id: string;
  /** Display name. */
  name: string;
  /** One-line description. */
  description: string;
  /** Top-level financial domain this group belongs to. */
  domain: FinancialDomain;
  /** Icon (lucide icon name) for the admin UI. */
  icon: string;
  /** Sort order in the admin tree. */
  order: number;
  /** Accent colour for the admin UI (Tailwind class fragment, e.g. "emerald"). */
  accent: string;
}

export type FinancialDomain = "PAYMENTS";

// ---------------------------------------------------------------------------
// Country Capability Matrix
// ---------------------------------------------------------------------------

export type CountryCapabilitySupport =
  | "FULL" // ✓ — generally available
  | "LIMITED" // partial — only some providers / some currencies
  | "CONFIGURABLE" // off by default but can be enabled via flag
  | "DISABLED" // ✗ — not available (regulatory / not implemented)
  | "BETA"; // pilot / early-access

export interface CountryCapabilityEntry {
  country: string;
  capabilityId: string;
  support: CountryCapabilitySupport;
  /** Providers that implement this capability in this country (codes). */
  providers: string[];
  /** Notes — regulatory, limits, etc. */
  notes?: string;
}

export interface CountryCapabilityProfile {
  country: string;
  name: string;
  flagEmoji: string;
  currency: string;
  /** Map of capabilityId → support level. */
  capabilities: Record<string, CountryCapabilitySupport>;
  /** KYC requirements for this country. */
  kycRequirements: string[];
  /** Regulatory notes. */
  regulatoryNotes?: string;
}

// ---------------------------------------------------------------------------
// Provider Capability Matrix
// ---------------------------------------------------------------------------

export type ProviderCapabilityMaturity =
  | "NATIVE" // first-class, fully certified
  | "SUPPORTED" // implemented & certified
  | "LIMITED" // partial feature coverage
  | "BETA" // pilot
  | "PARKED" // implemented but disabled pending compliance
  | "ROADMAP"; // declared but not yet implemented

export interface ProviderCapabilityEntry {
  providerCode: string;
  capabilityId: string;
  maturity: ProviderCapabilityMaturity;
  /** Sub-features the provider implements (feature slugs). */
  features: string[];
  /** Version the provider implements. */
  version?: string;
  /** Countries the provider implements this capability in. */
  countries: string[];
  /** Notes / known limitations. */
  notes?: string;
}

// ---------------------------------------------------------------------------
// Capability Resolution Engine
// ---------------------------------------------------------------------------

export interface ResolutionRequest {
  country: string;
  capabilityId: string;
  currency?: string;
  amountMinor?: number;
  direction?: CapabilityDirection;
  /** KYC tier of the calling customer. */
  kycTier?: KycTier;
  /** Merchant ID (for per-merchant flags). */
  merchantId?: string;
  /** Environment override — defaults to process.env.NODE_ENV. */
  environment?: "development" | "production";
}

export interface ResolutionCandidate {
  providerCode: string;
  maturity: ProviderCapabilityMaturity;
  score: number;
  reasons: string[];
  features: string[];
  version?: string;
}

export interface ResolutionResult {
  request: ResolutionRequest;
  resolved: boolean;
  candidates: ResolutionCandidate[];
  /** Ordered failover chain (best first). */
  failoverChain: string[];
  /** Why resolution failed (when resolved=false). */
  reason?: string;
  /** Capability object that was resolved. */
  capability: Capability;
  /** Dependencies that were validated (and any that were missing). */
  dependenciesChecked: Array<{ capabilityId: string; satisfied: boolean; reason: string }>;
  /** Total resolution time in milliseconds. */
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Capability Flags
// ---------------------------------------------------------------------------

export type CapabilityFlagScope =
  "GLOBAL" | "COUNTRY" | "MERCHANT" | "USER_TIER" | "ENVIRONMENT" | "REGULATORY";

export interface CapabilityFlag {
  id: string;
  capabilityId: string;
  scope: CapabilityFlagScope;
  /** Target identifier — country code / merchant id / tier number / "development"|"production". */
  target: string;
  enabled: boolean;
  /** Reason for the override (audit trail). */
  reason?: string;
  updatedAt: string;
  updatedBy?: string;
}

// ---------------------------------------------------------------------------
// Capability Knowledge Graph
// ---------------------------------------------------------------------------

export interface KnowledgeGraphNode {
  id: string; // capability id
  label: string;
  group: string;
  status: CapabilityStatus;
  direction: CapabilityDirection;
}

export interface KnowledgeGraphEdge {
  from: string;
  to: string;
  kind: "REQUIRES" | "RECOMMENDS" | "OPTIONAL";
  reason?: string;
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

export interface DependencyPath {
  /** Start capability. */
  from: string;
  /** End capability. */
  to: string;
  /** Ordered path of capability ids. */
  path: string[];
  /** Edge kinds traversed. */
  edges: Array<{ from: string; to: string; kind: CapabilityDependency["kind"] }>;
  /** Whether all hard dependencies are satisfied. */
  satisfied: boolean;
  /** Human-readable explanation. */
  explanation: string;
}

// ---------------------------------------------------------------------------
// Registry statistics — powers the admin overview
// ---------------------------------------------------------------------------

export interface GcrStats {
  totalGroups: number;
  totalCapabilities: number;
  stableCapabilities: number;
  betaCapabilities: number;
  experimentalCapabilities: number;
  deprecatedCapabilities: number;
  plannedCapabilities: number;
  totalFeatures: number;
  totalDependencies: number;
  totalVersions: number;
  totalCertificationTests: number;
  countriesProfiled: number;
  providersMapped: number;
  flagsConfigured: number;
  flagsEnabled: number;
}

export interface GroupStats {
  groupId: string;
  groupName: string;
  totalCapabilities: number;
  stableCapabilities: number;
  betaCapabilities: number;
  inbound: number;
  outbound: number;
  both: number;
  totalFeatures: number;
  totalDependencies: number;
}
