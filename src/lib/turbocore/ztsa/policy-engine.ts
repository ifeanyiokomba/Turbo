// TurboCore — Policy Engine (Chapter 10, Production Enhancement #1)
//
// "Use a centralized policy engine so authorization rules are versioned and
//  configurable rather than hardcoded."
//
// The Policy Engine combines RBAC (role-based) with ABAC (attribute-based)
// access control. RBAC handles coarse-grained access ("is this user a
// merchant?"), ABAC handles fine-grained access ("is this user in Nigeria,
// during business hours, with low risk, accessing their own resource?").
//
// Policies are evaluated in priority order. The first matching policy
// determines the decision. DENY policies always override ALLOW policies
// at the same priority level.

import type { AbacContext, AbacPolicy, AbacCondition, PolicyEvaluationResult } from "./types";

// ---------------------------------------------------------------------------
// Seeded policies (configurable at runtime via admin API)
// ---------------------------------------------------------------------------

let policies: AbacPolicy[] = [
  // ===== DENY policies (highest priority) =====
  {
    id: "deny-high-risk-country",
    name: "Deny High-Risk Countries",
    description: "Block access from sanctioned/high-risk countries.",
    effect: "DENY",
    priority: 100,
    enabled: true,
    conditions: [{ field: "country", operator: "IN", value: ["IR", "KP", "SY", "CU", "SD"] }],
  },
  {
    id: "deny-untrusted-device-critical",
    name: "Deny Critical Actions on Untrusted Devices",
    description: "Critical operations require a trusted device.",
    effect: "DENY",
    priority: 99,
    enabled: true,
    conditions: [{ field: "deviceTrusted", operator: "EQ", value: false }],
  },
  {
    id: "deny-outside-business-hours-finance",
    name: "Deny Finance Actions Outside Business Hours",
    description: "Finance operations only during business hours (configurable).",
    effect: "DENY",
    priority: 90,
    enabled: false, // disabled by default — enable for strict deployments
    conditions: [
      { field: "role", operator: "EQ", value: "FINANCE" },
      { field: "isBusinessHours", operator: "EQ", value: false },
    ],
  },
  {
    id: "deny-high-risk-score",
    name: "Deny High Risk Score Users",
    description: "Users with risk score > 80 are blocked from financial operations.",
    effect: "DENY",
    priority: 95,
    enabled: true,
    conditions: [{ field: "riskScore", operator: "GT", value: 80 }],
  },

  // ===== ALLOW policies (lower priority) =====
  {
    id: "allow-own-resource",
    name: "Allow Access to Own Resources",
    description: "Users can access their own resources.",
    effect: "ALLOW",
    priority: 50,
    enabled: true,
    conditions: [
      { field: "resourceOwnerId", operator: "EQ", value: "$userId" }, // $ prefix = context variable
    ],
  },
  {
    id: "allow-admin-full-access",
    name: "Allow Admin Full Access",
    description: "Admins have access to all resources (still audited).",
    effect: "ALLOW",
    priority: 40,
    enabled: true,
    conditions: [{ field: "role", operator: "EQ", value: "ADMIN" }],
  },
  {
    id: "allow-merchant-own-resources",
    name: "Allow Merchant Own Resources",
    description: "Merchants can access their own merchant resources.",
    effect: "ALLOW",
    priority: 45,
    enabled: true,
    conditions: [{ field: "role", operator: "EQ", value: "MERCHANT" }],
  },
  {
    id: "allow-compliance-audit",
    name: "Allow Compliance Team Audit Access",
    description: "Compliance officers can view audit logs.",
    effect: "ALLOW",
    priority: 40,
    enabled: true,
    conditions: [
      { field: "role", operator: "EQ", value: "COMPLIANCE" },
      { field: "action", operator: "IN", value: ["read", "view", "export"] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

function resolveValue(value: unknown, context: AbacContext): unknown {
  if (typeof value === "string" && value.startsWith("$")) {
    const key = value.slice(1);
    return (context as unknown as Record<string, unknown>)[key] ?? value;
  }
  return value;
}

function evaluateCondition(condition: AbacCondition, context: AbacContext): boolean {
  const ctx = context as unknown as Record<string, unknown>;
  const fieldValue = ctx[condition.field];
  const expectedValue = resolveValue(condition.value, context);

  switch (condition.operator) {
    case "EQ":
      return fieldValue === expectedValue;
    case "NE":
      return fieldValue !== expectedValue;
    case "GT":
      return (
        typeof fieldValue === "number" &&
        typeof expectedValue === "number" &&
        fieldValue > expectedValue
      );
    case "LT":
      return (
        typeof fieldValue === "number" &&
        typeof expectedValue === "number" &&
        fieldValue < expectedValue
      );
    case "GTE":
      return (
        typeof fieldValue === "number" &&
        typeof expectedValue === "number" &&
        fieldValue >= expectedValue
      );
    case "LTE":
      return (
        typeof fieldValue === "number" &&
        typeof expectedValue === "number" &&
        fieldValue <= expectedValue
      );
    case "IN":
      return Array.isArray(expectedValue) && expectedValue.includes(fieldValue);
    case "NOT_IN":
      return Array.isArray(expectedValue) && !expectedValue.includes(fieldValue);
    case "BETWEEN": {
      if (!Array.isArray(expectedValue) || expectedValue.length !== 2) return false;
      const [min, max] = expectedValue as [number, number];
      return typeof fieldValue === "number" && fieldValue >= min && fieldValue <= max;
    }
    default:
      return false;
  }
}

function checkPolicy(policy: AbacPolicy, context: AbacContext): boolean {
  if (!policy.enabled) return false;
  return policy.conditions.every((cond) => evaluateCondition(cond, context));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function evaluatePolicy(context: AbacContext): PolicyEvaluationResult {
  // Sort by priority descending (highest priority first)
  const sorted = [...policies].sort((a, b) => b.priority - a.priority);

  const matchedPolicies: string[] = [];
  let decision: "ALLOW" | "DENY" = "DENY"; // default deny (Zero Trust)
  let reason = "No matching policy — default DENY (Zero Trust)";

  for (const policy of sorted) {
    if (!policy.enabled) continue;
    if (checkPolicy(policy, context)) {
      matchedPolicies.push(policy.id);
      if (policy.effect === "DENY") {
        // DENY always wins — return immediately
        return {
          decision: "DENY",
          matchedPolicies,
          evaluatedPolicies: sorted.length,
          reason: `Denied by policy: ${policy.name}`,
          context,
        };
      }
      if (decision !== "ALLOW") {
        decision = "ALLOW";
        reason = `Allowed by policy: ${policy.name}`;
      }
    }
  }

  return {
    decision,
    matchedPolicies,
    evaluatedPolicies: sorted.length,
    reason,
    context,
  };
}

export function listPolicies(): AbacPolicy[] {
  return [...policies].sort((a, b) => b.priority - a.priority);
}

export function getPolicy(id: string): AbacPolicy | undefined {
  return policies.find((p) => p.id === id);
}

export function addPolicy(policy: AbacPolicy): void {
  if (!policies.find((p) => p.id === policy.id)) {
    policies.push(policy);
  }
}

export function updatePolicy(id: string, updates: Partial<AbacPolicy>): boolean {
  const idx = policies.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  policies[idx] = { ...policies[idx], ...updates };
  return true;
}

export function deletePolicy(id: string): boolean {
  const idx = policies.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  policies.splice(idx, 1);
  return true;
}

export function togglePolicy(id: string, enabled: boolean): boolean {
  return updatePolicy(id, { enabled });
}

export function getPolicyStats() {
  return {
    total: policies.length,
    enabled: policies.filter((p) => p.enabled).length,
    disabled: policies.filter((p) => !p.enabled).length,
    allowPolicies: policies.filter((p) => p.effect === "ALLOW").length,
    denyPolicies: policies.filter((p) => p.effect === "DENY").length,
  };
}
