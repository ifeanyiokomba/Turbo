// TurboCore — MTPA Tenant Policy Engine (Chapter 11, Production Enhancement #3)
//
// "Every tenant defines policies. Business behaviour becomes policy-driven
//  rather than hardcoded."
//
// Example:
//   Transfers:
//     requireMFAAbove: ₦500,000
//   Refunds:
//     requireFinanceApproval: true
//   Payouts:
//     dualApprovalAbove: ₦5,000,000

import type { TenantPolicy, TenantPolicyRule } from "./types";
import { generateId } from "@/lib/turbocore/database/ids";

// ---------------------------------------------------------------------------
// Seeded tenant policies (per-tenant)
// ---------------------------------------------------------------------------

const policies: TenantPolicy[] = [
  // TurboPay Consumer policies
  {
    id: generateId("EVENT_STORE"),
    tenantId: "tenant_turbopay",
    category: "TRANSFERS",
    name: "MFA Required Above ₦500,000",
    description: "Transfers above ₦500,000 require MFA verification.",
    rules: [{ field: "amount", operator: "GT", value: 50_000_000, action: "REQUIRE_MFA" }],
    enabled: true,
    priority: 100,
    updatedAt: new Date().toISOString(),
  },
  {
    id: generateId("EVENT_STORE"),
    tenantId: "tenant_turbopay",
    category: "PAYOUTS",
    name: "Dual Approval Above ₦5,000,000",
    description: "Payouts above ₦5,000,000 require dual approval.",
    rules: [
      {
        field: "amount",
        operator: "GT",
        value: 500_000_000,
        action: "REQUIRE_DUAL_APPROVAL",
        approverRole: "FINANCE",
      },
    ],
    enabled: true,
    priority: 90,
    updatedAt: new Date().toISOString(),
  },
  // Bank A policies (stricter)
  {
    id: generateId("EVENT_STORE"),
    tenantId: "tenant_bank_a",
    category: "TRANSFERS",
    name: "MFA Required Above ₦100,000",
    description: "Bank A requires MFA for all transfers above ₦100,000.",
    rules: [{ field: "amount", operator: "GT", value: 10_000_000, action: "REQUIRE_MFA" }],
    enabled: true,
    priority: 100,
    updatedAt: new Date().toISOString(),
  },
  {
    id: generateId("EVENT_STORE"),
    tenantId: "tenant_bank_a",
    category: "COMPLIANCE",
    name: "Block High-Risk Countries",
    description: "Block transactions from sanctioned countries.",
    rules: [
      { field: "country", operator: "IN", value: ["IR", "KP", "SY", "CU", "SD"], action: "BLOCK" },
    ],
    enabled: true,
    priority: 110,
    updatedAt: new Date().toISOString(),
  },
  // Enterprise E policies
  {
    id: generateId("EVENT_STORE"),
    tenantId: "tenant_enterprise_e",
    category: "PAYOUTS",
    name: "Finance Approval Above R100,000",
    description: "Corporate payouts above R100,000 require finance approval.",
    rules: [
      {
        field: "amount",
        operator: "GT",
        value: 10_000_000,
        action: "REQUIRE_APPROVAL",
        approverRole: "FINANCE",
      },
    ],
    enabled: true,
    priority: 95,
    updatedAt: new Date().toISOString(),
  },
  // Government C policies
  {
    id: generateId("EVENT_STORE"),
    tenantId: "tenant_gov_c",
    category: "REFUNDS",
    name: "All Refunds Require Approval",
    description: "Government refunds always require compliance approval.",
    rules: [
      {
        field: "amount",
        operator: "GT",
        value: 0,
        action: "REQUIRE_APPROVAL",
        approverRole: "COMPLIANCE",
      },
    ],
    enabled: true,
    priority: 100,
    updatedAt: new Date().toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Policy evaluation
// ---------------------------------------------------------------------------

export interface PolicyEvaluationContext {
  tenantId: string;
  category: string;
  amount?: number;
  currency?: string;
  country?: string;
  riskScore?: number;
}

export interface PolicyEvaluationResult {
  decision:
    "ALLOW" | "REQUIRE_MFA" | "REQUIRE_APPROVAL" | "REQUIRE_DUAL_APPROVAL" | "BLOCK" | "FLAG";
  matchedPolicies: string[];
  reason: string;
}

function evaluateRule(rule: TenantPolicyRule, ctx: PolicyEvaluationContext): boolean {
  const fieldValue = (ctx as unknown as Record<string, unknown>)[rule.field];
  switch (rule.operator) {
    case "GT":
      return (
        typeof fieldValue === "number" && typeof rule.value === "number" && fieldValue > rule.value
      );
    case "LT":
      return (
        typeof fieldValue === "number" && typeof rule.value === "number" && fieldValue < rule.value
      );
    case "GTE":
      return (
        typeof fieldValue === "number" && typeof rule.value === "number" && fieldValue >= rule.value
      );
    case "LTE":
      return (
        typeof fieldValue === "number" && typeof rule.value === "number" && fieldValue <= rule.value
      );
    case "EQ":
      return fieldValue === rule.value;
    case "IN":
      return Array.isArray(rule.value) && rule.value.includes(fieldValue);
    default:
      return false;
  }
}

export function evaluateTenantPolicies(ctx: PolicyEvaluationContext): PolicyEvaluationResult {
  const tenantPolicies = policies
    .filter((p) => p.tenantId === ctx.tenantId && p.category === ctx.category && p.enabled)
    .sort((a, b) => b.priority - a.priority);

  const matchedPolicies: string[] = [];
  let decision: PolicyEvaluationResult["decision"] = "ALLOW";
  let reason = "No matching policy — default ALLOW";

  for (const policy of tenantPolicies) {
    for (const rule of policy.rules) {
      if (evaluateRule(rule, ctx)) {
        matchedPolicies.push(policy.id);
        // BLOCK always wins
        if (rule.action === "BLOCK") {
          return {
            decision: "BLOCK",
            matchedPolicies,
            reason: `Blocked by policy: ${policy.name}`,
          };
        }
        // Pick the most restrictive action
        const actionPriority: Record<string, number> = {
          ALLOW: 0,
          FLAG: 1,
          REQUIRE_MFA: 2,
          REQUIRE_APPROVAL: 3,
          REQUIRE_DUAL_APPROVAL: 4,
          BLOCK: 5,
        };
        if (actionPriority[rule.action] > actionPriority[decision]) {
          decision = rule.action;
          reason = `${rule.action} required by policy: ${policy.name}`;
        }
      }
    }
  }

  return { decision, matchedPolicies, reason };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function listTenantPolicies(tenantId?: string): TenantPolicy[] {
  if (tenantId) return policies.filter((p) => p.tenantId === tenantId);
  return [...policies].sort((a, b) => b.priority - a.priority);
}

export function addTenantPolicy(policy: Omit<TenantPolicy, "id" | "updatedAt">): TenantPolicy {
  const newPolicy: TenantPolicy = {
    ...policy,
    id: generateId("EVENT_STORE"),
    updatedAt: new Date().toISOString(),
  };
  policies.push(newPolicy);
  return newPolicy;
}

export function toggleTenantPolicy(id: string, enabled: boolean): boolean {
  const policy = policies.find((p) => p.id === id);
  if (!policy) return false;
  policy.enabled = enabled;
  policy.updatedAt = new Date().toISOString();
  return true;
}

export function deleteTenantPolicy(id: string): boolean {
  const idx = policies.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  policies.splice(idx, 1);
  return true;
}

export function getPolicyStats() {
  return {
    total: policies.length,
    enabled: policies.filter((p) => p.enabled).length,
    disabled: policies.filter((p) => !p.enabled).length,
    byCategory: policies.reduce(
      (acc, p) => {
        acc[p.category] = (acc[p.category] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ),
  };
}
