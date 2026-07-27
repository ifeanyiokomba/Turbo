// TurboCore — MTPA Tenant Policy API
//
// GET  /api/admin/mtpa/policy?tenantId=X — list policies for a tenant
// POST /api/admin/mtpa/policy — { action: "toggle", id, enabled } | { action: "add", policy } | { action: "delete", id }

import { json, handleError, audit, getClientIp } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requirePermission(Permissions.CAPABILITIES_VIEW);
    const url = new URL(req.url);
    const tenantId = url.searchParams.get("tenantId") ?? undefined;
    const { listTenantPolicies, getPolicyStats } =
      await import("@/lib/turbocore/mtpa/tenant-policy-engine");
    return json({ policies: listTenantPolicies(tenantId), stats: getPolicyStats() });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requirePermission(Permissions.CAPABILITIES_MANAGE);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const { toggleTenantPolicy, addTenantPolicy, deleteTenantPolicy } =
      await import("@/lib/turbocore/mtpa/tenant-policy-engine");

    let result: { success: boolean; message: string };
    if (action === "toggle") {
      const ok = toggleTenantPolicy(String(body.id), Boolean(body.enabled));
      result = ok
        ? { success: true, message: "Policy toggled" }
        : { success: false, message: "Policy not found" };
    } else if (action === "add") {
      addTenantPolicy(body.policy);
      result = { success: true, message: "Policy added" };
    } else if (action === "delete") {
      const ok = deleteTenantPolicy(String(body.id));
      result = ok
        ? { success: true, message: "Policy deleted" }
        : { success: false, message: "Policy not found" };
    } else {
      return json({ error: "Invalid action" }, 400);
    }

    await audit({
      userId: user.id,
      action: "MTPA_POLICY_MANAGEMENT",
      category: "ADMIN",
      ip: getClientIp(req),
      metadata: { action, success: result.success },
    });
    return json(result);
  } catch (e) {
    return handleError(e);
  }
}
