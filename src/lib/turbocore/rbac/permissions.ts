// TurboPay RBAC — Granular permission catalog.
//
// All permissions are dotted "<domain>:<action>" strings. They are referenced by:
//   - Role mappings in `roles.ts` (ROLE_PERMISSIONS)
//   - Admin API routes via `requirePermission(Permissions.XXX)`
//   - The Roles & Permissions UI (admin/roles-tab.tsx)
//
// Adding a new permission:
//   1. Add it here in `Permissions`.
//   2. Add it to the relevant category in `PERMISSION_CATEGORIES` below.
//   3. Grant it to one or more roles in `roles.ts`.
//
// NEVER grant a permission by string literal in API routes — always import from here
// so the type checker catches drift.

export const Permissions = {
  // ─── User management ──────────────────────────────────────────────
  USERS_VIEW: "users:view",
  USERS_MANAGE: "users:manage",
  USERS_FREEZE: "users:freeze",
  USERS_CLOSE: "users:close",

  // ─── Transaction management ──────────────────────────────────────
  TX_VIEW_ALL: "tx:view:all",
  TX_REVERSE: "tx:reverse",
  TX_EXPORT: "tx:export",

  // ─── Provider management ─────────────────────────────────────────
  PROVIDERS_VIEW: "providers:view",
  PROVIDERS_MANAGE: "providers:manage",
  PROVIDERS_CREDENTIALS: "providers:credentials",
  PROVIDERS_HEALTH: "providers:health",
  PROVIDERS_CIRCUIT_RESET: "providers:circuit:reset",

  // ─── Routing ─────────────────────────────────────────────────────
  ROUTING_VIEW: "routing:view",
  ROUTING_MANAGE: "routing:manage",

  // ─── Capabilities ───────────────────────────────────────────────
  CAPABILITIES_VIEW: "capabilities:view",
  CAPABILITIES_MANAGE: "capabilities:manage",

  // ─── Compliance ─────────────────────────────────────────────────
  COMPLIANCE_VIEW: "compliance:view",
  COMPLIANCE_MANAGE: "compliance:manage",
  COMPLIANCE_CASES: "compliance:cases",
  AML_VIEW: "aml:view",
  AML_MANAGE: "aml:manage",
  SANCTIONS_SCREEN: "sanctions:screen",
  STR_GENERATE: "str:generate",

  // ─── KYC ────────────────────────────────────────────────────────
  KYC_VIEW: "kyc:view",
  KYC_REVIEW: "kyc:review",
  KYC_APPROVE: "kyc:approve",

  // ─── Finance ────────────────────────────────────────────────────
  FINANCE_VIEW: "finance:view",
  FINANCE_RECONCILIATION: "finance:reconciliation",
  FINANCE_SETTLEMENTS: "finance:settlements",
  FEES_MANAGE: "fees:manage",
  FX_MANAGE: "fx:manage",

  // ─── Webhooks ───────────────────────────────────────────────────
  WEBHOOKS_VIEW: "webhooks:view",
  WEBHOOKS_MANAGE: "webhooks:manage",

  // ─── Feature flags ──────────────────────────────────────────────
  FLAGS_VIEW: "flags:view",
  FLAGS_MANAGE: "flags:manage",

  // ─── Config ─────────────────────────────────────────────────────
  CONFIG_VIEW: "config:view",
  CONFIG_MANAGE: "config:manage",
  CONFIG_ROLLBACK: "config:rollback",

  // ─── Team ───────────────────────────────────────────────────────
  TEAM_VIEW: "team:view",
  TEAM_MANAGE: "team:manage",
  TEAM_INVITE: "team:invite",

  // ─── Audit ──────────────────────────────────────────────────────
  AUDIT_VIEW: "audit:view",
  AUDIT_EXPORT: "audit:export",

  // ─── Support ────────────────────────────────────────────────────
  SUPPORT_VIEW: "support:view",
  SUPPORT_MANAGE: "support:manage",

  // ─── Analytics ──────────────────────────────────────────────────
  ANALYTICS_VIEW: "analytics:view",
  ANALYTICS_EXPORT: "analytics:export",

  // ─── Monitoring ─────────────────────────────────────────────────
  MONITORING_VIEW: "monitoring:view",

  // ─── Virtual cards ──────────────────────────────────────────────
  CARDS_VIEW: "cards:view",
  CARDS_MANAGE: "cards:manage",

  // ─── Savings & investments ─────────────────────────────────────
  SAVINGS_VIEW: "savings:view",
  SAVINGS_MANAGE: "savings:manage",
  INVESTMENTS_VIEW: "investments:view",
  INVESTMENTS_MANAGE: "investments:manage",

  // ─── Vouchers ──────────────────────────────────────────────────
  VOUCHERS_VIEW: "vouchers:view",
  VOUCHERS_MANAGE: "vouchers:manage",
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

/**
 * Permission categories — used by the Roles & Permissions UI to group
 * permissions into visual sections (User Mgmt, Transactions, Providers, etc.).
 *
 * The order of categories here is the order they appear in the UI.
 */
export const PERMISSION_CATEGORIES: {
  label: string;
  description: string;
  permissions: Permission[];
}[] = [
  {
    label: "User Management",
    description: "View and manage customer accounts, freeze/close bad actors.",
    permissions: [
      Permissions.USERS_VIEW,
      Permissions.USERS_MANAGE,
      Permissions.USERS_FREEZE,
      Permissions.USERS_CLOSE,
    ],
  },
  {
    label: "Transactions",
    description: "Inspect all transactions, reverse erroneous ones, export data.",
    permissions: [
      Permissions.TX_VIEW_ALL,
      Permissions.TX_REVERSE,
      Permissions.TX_EXPORT,
    ],
  },
  {
    label: "Providers",
    description: "Manage PSP/bank providers, rotate credentials, monitor health, reset breakers.",
    permissions: [
      Permissions.PROVIDERS_VIEW,
      Permissions.PROVIDERS_MANAGE,
      Permissions.PROVIDERS_CREDENTIALS,
      Permissions.PROVIDERS_HEALTH,
      Permissions.PROVIDERS_CIRCUIT_RESET,
    ],
  },
  {
    label: "Routing & Capabilities",
    description: "Configure provider routing rules and capability matrix.",
    permissions: [
      Permissions.ROUTING_VIEW,
      Permissions.ROUTING_MANAGE,
      Permissions.CAPABILITIES_VIEW,
      Permissions.CAPABILITIES_MANAGE,
    ],
  },
  {
    label: "Compliance & AML",
    description: "Manage compliance cases, AML flags, sanctions screening, STRs.",
    permissions: [
      Permissions.COMPLIANCE_VIEW,
      Permissions.COMPLIANCE_MANAGE,
      Permissions.COMPLIANCE_CASES,
      Permissions.AML_VIEW,
      Permissions.AML_MANAGE,
      Permissions.SANCTIONS_SCREEN,
      Permissions.STR_GENERATE,
    ],
  },
  {
    label: "KYC",
    description: "Review and approve customer identity verification.",
    permissions: [
      Permissions.KYC_VIEW,
      Permissions.KYC_REVIEW,
      Permissions.KYC_APPROVE,
    ],
  },
  {
    label: "Finance",
    description: "Reconciliation, settlements, fee + FX configuration.",
    permissions: [
      Permissions.FINANCE_VIEW,
      Permissions.FINANCE_RECONCILIATION,
      Permissions.FINANCE_SETTLEMENTS,
      Permissions.FEES_MANAGE,
      Permissions.FX_MANAGE,
    ],
  },
  {
    label: "Webhooks",
    description: "View and manage outbound webhook endpoints.",
    permissions: [
      Permissions.WEBHOOKS_VIEW,
      Permissions.WEBHOOKS_MANAGE,
    ],
  },
  {
    label: "Feature Flags",
    description: "View and toggle feature flags + per-user overrides.",
    permissions: [
      Permissions.FLAGS_VIEW,
      Permissions.FLAGS_MANAGE,
    ],
  },
  {
    label: "Config History",
    description: "View config snapshots and roll back to prior versions.",
    permissions: [
      Permissions.CONFIG_VIEW,
      Permissions.CONFIG_MANAGE,
      Permissions.CONFIG_ROLLBACK,
    ],
  },
  {
    label: "Team",
    description: "View team members, invite new ones, manage roles.",
    permissions: [
      Permissions.TEAM_VIEW,
      Permissions.TEAM_MANAGE,
      Permissions.TEAM_INVITE,
    ],
  },
  {
    label: "Audit Log",
    description: "Read audit trail and export it for external review.",
    permissions: [
      Permissions.AUDIT_VIEW,
      Permissions.AUDIT_EXPORT,
    ],
  },
  {
    label: "Support",
    description: "View and manage customer support tickets.",
    permissions: [
      Permissions.SUPPORT_VIEW,
      Permissions.SUPPORT_MANAGE,
    ],
  },
  {
    label: "Analytics",
    description: "View analytics dashboards and export reports.",
    permissions: [
      Permissions.ANALYTICS_VIEW,
      Permissions.ANALYTICS_EXPORT,
    ],
  },
  {
    label: "Monitoring",
    description: "Real-time system KPIs, live tx feed, queue health.",
    permissions: [Permissions.MONITORING_VIEW],
  },
  {
    label: "Virtual Cards",
    description: "View and manage virtual card issuance.",
    permissions: [
      Permissions.CARDS_VIEW,
      Permissions.CARDS_MANAGE,
    ],
  },
  {
    label: "Savings & Investments",
    description: "Manage savings products, investment portfolios.",
    permissions: [
      Permissions.SAVINGS_VIEW,
      Permissions.SAVINGS_MANAGE,
      Permissions.INVESTMENTS_VIEW,
      Permissions.INVESTMENTS_MANAGE,
    ],
  },
  {
    label: "Vouchers",
    description: "View and manage promotional voucher codes.",
    permissions: [
      Permissions.VOUCHERS_VIEW,
      Permissions.VOUCHERS_MANAGE,
    ],
  },
];

/** Total number of permissions in the catalog (used by the UI for "X of Y" badges). */
export const TOTAL_PERMISSIONS: number = Object.keys(Permissions).length;
