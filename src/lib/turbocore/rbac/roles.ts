// TurboPay RBAC — Role catalog + role→permission mappings.
//
// 10 declared admin roles, each mapped to a non-empty list of permissions
// in `ROLE_PERMISSIONS`. SUPER_ADMIN receives ALL permissions (the master
// escalation role); ADMINISTRATOR is granted every permission EXCEPT
// `config:rollback` (the most destructive single action).
//
// The DB `User.role` column is a free-form String (no enum). To assign a
// new role to a user, set their `role` field to one of the literal values
// in `Roles` below — no schema migration required.

import { Permissions, type Permission } from "./permissions";

export const Roles = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMINISTRATOR: "ADMINISTRATOR",
  FINANCE_OFFICER: "FINANCE_OFFICER",
  COMPLIANCE_OFFICER: "COMPLIANCE_OFFICER",
  SUPPORT_OFFICER: "SUPPORT_OFFICER",
  OPERATIONS_OFFICER: "OPERATIONS_OFFICER",
  RISK_OFFICER: "RISK_OFFICER",
  DEVELOPER: "DEVELOPER",
  AUDITOR: "AUDITOR",
  READONLY_ANALYST: "READONLY_ANALYST",
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];

/**
 * Human-readable label + description for each role, used by the UI.
 * `tone` maps to a Tailwind badge color class (emerald / amber / sky / etc.).
 */
export const ROLE_META: Record<
  Role,
  {
    label: string;
    description: string;
    /** Tailwind classes for a colored Badge. */
    tone: string;
    /** Whether the role has access to the admin console at all. */
    admin: boolean;
  }
> = {
  SUPER_ADMIN: {
    label: "Super Admin",
    description:
      "Full system access. Can perform any action including config rollback and credential rotation.",
    tone: "bg-red-500/15 text-red-600 dark:text-red-400",
    admin: true,
  },
  ADMINISTRATOR: {
    label: "Administrator",
    description:
      "Day-to-day admin. Has every permission except config rollback (which is reserved for Super Admin).",
    tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    admin: true,
  },
  FINANCE_OFFICER: {
    label: "Finance Officer",
    description:
      "Reconciliation, settlements, fee/FX configuration, transaction review, analytics.",
    tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    admin: true,
  },
  COMPLIANCE_OFFICER: {
    label: "Compliance Officer",
    description:
      "Compliance cases, AML, sanctions screening, STR generation, KYC review + approval.",
    tone: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    admin: true,
  },
  SUPPORT_OFFICER: {
    label: "Support Officer",
    description:
      "Customer support — read access to users, transactions, KYC status, compliance view.",
    tone: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    admin: true,
  },
  OPERATIONS_OFFICER: {
    label: "Operations Officer",
    description:
      "Day-to-day ops — provider health, routing, capabilities, webhooks, monitoring.",
    tone: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    admin: true,
  },
  RISK_OFFICER: {
    label: "Risk Officer",
    description:
      "AML + sanctions monitoring, compliance cases, transaction surveillance, monitoring.",
    tone: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    admin: true,
  },
  DEVELOPER: {
    label: "Developer",
    description:
      "Read-only diagnostic access — provider health, circuit breaker reset, feature flags, monitoring.",
    tone: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
    admin: true,
  },
  AUDITOR: {
    label: "Auditor",
    description:
      "Read-only access to audit logs, transactions, config, compliance, finance, analytics. No mutations.",
    tone: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
    admin: true,
  },
  READONLY_ANALYST: {
    label: "Read-only Analyst",
    description:
      "Lightest role — analytics dashboards, transaction overview, monitoring. No mutations.",
    tone: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300",
    admin: true,
  },
};

/** Convenience: every permission in the catalog. */
const ALL_PERMISSIONS: Permission[] = Object.values(Permissions);

/**
 * Role → permission mapping. EVERY role resolves to a non-empty list.
 * SUPER_ADMIN receives all permissions; ADMINISTRATOR receives all except
 * `config:rollback` (rollback is reserved for SUPER_ADMIN).
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: [...ALL_PERMISSIONS],

  ADMINISTRATOR: ALL_PERMISSIONS.filter(
    (p) => p !== Permissions.CONFIG_ROLLBACK,
  ),

  FINANCE_OFFICER: [
    Permissions.FINANCE_VIEW,
    Permissions.FINANCE_RECONCILIATION,
    Permissions.FINANCE_SETTLEMENTS,
    Permissions.FEES_MANAGE,
    Permissions.FX_MANAGE,
    Permissions.TX_VIEW_ALL,
    Permissions.TX_EXPORT,
    Permissions.ANALYTICS_VIEW,
    Permissions.AUDIT_VIEW,
  ],

  COMPLIANCE_OFFICER: [
    Permissions.COMPLIANCE_VIEW,
    Permissions.COMPLIANCE_MANAGE,
    Permissions.COMPLIANCE_CASES,
    Permissions.AML_VIEW,
    Permissions.AML_MANAGE,
    Permissions.SANCTIONS_SCREEN,
    Permissions.STR_GENERATE,
    Permissions.KYC_VIEW,
    Permissions.KYC_REVIEW,
    Permissions.KYC_APPROVE,
    Permissions.USERS_VIEW,
    Permissions.TX_VIEW_ALL,
    Permissions.AUDIT_VIEW,
  ],

  SUPPORT_OFFICER: [
    Permissions.USERS_VIEW,
    Permissions.TX_VIEW_ALL,
    Permissions.SUPPORT_VIEW,
    Permissions.SUPPORT_MANAGE,
    Permissions.KYC_VIEW,
    Permissions.COMPLIANCE_VIEW,
  ],

  OPERATIONS_OFFICER: [
    Permissions.USERS_VIEW,
    Permissions.USERS_MANAGE,
    Permissions.PROVIDERS_VIEW,
    Permissions.PROVIDERS_HEALTH,
    Permissions.ROUTING_VIEW,
    Permissions.CAPABILITIES_VIEW,
    Permissions.WEBHOOKS_VIEW,
    Permissions.MONITORING_VIEW,
    Permissions.AUDIT_VIEW,
  ],

  RISK_OFFICER: [
    Permissions.AML_VIEW,
    Permissions.AML_MANAGE,
    Permissions.COMPLIANCE_VIEW,
    Permissions.COMPLIANCE_CASES,
    Permissions.SANCTIONS_SCREEN,
    Permissions.TX_VIEW_ALL,
    Permissions.USERS_VIEW,
    Permissions.MONITORING_VIEW,
    Permissions.AUDIT_VIEW,
  ],

  DEVELOPER: [
    Permissions.PROVIDERS_VIEW,
    Permissions.PROVIDERS_HEALTH,
    Permissions.PROVIDERS_CIRCUIT_RESET,
    Permissions.CONFIG_VIEW,
    Permissions.FLAGS_VIEW,
    Permissions.FLAGS_MANAGE,
    Permissions.MONITORING_VIEW,
    Permissions.AUDIT_VIEW,
  ],

  AUDITOR: [
    Permissions.AUDIT_VIEW,
    Permissions.AUDIT_EXPORT,
    Permissions.TX_VIEW_ALL,
    Permissions.TX_EXPORT,
    Permissions.USERS_VIEW,
    Permissions.PROVIDERS_VIEW,
    Permissions.CONFIG_VIEW,
    Permissions.COMPLIANCE_VIEW,
    Permissions.FINANCE_VIEW,
    Permissions.ANALYTICS_VIEW,
  ],

  READONLY_ANALYST: [
    Permissions.ANALYTICS_VIEW,
    Permissions.ANALYTICS_EXPORT,
    Permissions.TX_VIEW_ALL,
    Permissions.USERS_VIEW,
    Permissions.PROVIDERS_VIEW,
    Permissions.MONITORING_VIEW,
    Permissions.AUDIT_VIEW,
  ],
};

/** All declared roles, in display order. */
export const ALL_ROLES: Role[] = Object.values(Roles);
