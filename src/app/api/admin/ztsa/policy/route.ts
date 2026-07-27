// TurboCore — ZTSA Policy Engine API
//
// GET  /api/admin/ztsa/policy — list all ABAC policies
// POST /api/admin/ztsa/policy — { action: "toggle", id, enabled } | { action: "add", policy } | { action: "delete", id }

import { json, handleError, audit, getClientIp } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePermission(Permissions.CAPABILITIES_VIEW);
    const { listPolicies, getPolicyStats } = await import("@/lib/turbocore/ztsa/policy-engine");
    return json({
      policies: listPolicies(),
      stats: getPolicyStats(),
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requirePermission(Permissions.CAPABILITIES_MANAGE);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    const { togglePolicy, addPolicy, deletePolicy } =
      await import("@/lib/turbocore/ztsa/policy-engine");

    let result: { success: boolean; message: string };

    if (action === "toggle") {
      const ok = togglePolicy(String(body.id), Boolean(body.enabled));
      result = ok
        ? { success: true, message: `Policy ${body.enabled ? "enabled" : "disabled"}` }
        : { success: false, message: "Policy not found" };
    } else if (action === "add") {
      addPolicy(body.policy);
      result = { success: true, message: "Policy added" };
    } else if (action === "delete") {
      const ok = deletePolicy(String(body.id));
      result = ok
        ? { success: true, message: "Policy deleted" }
        : { success: false, message: "Policy not found" };
    } else {
      return json({ error: "Invalid action. Use: toggle, add, delete" }, 400);
    }

    await audit({
      userId: user.id,
      action: "ZTSA_POLICY_MANAGEMENT",
      category: "ADMIN",
      ip: getClientIp(req),
      metadata: { action, ...body, success: result.success },
    });

    return json(result);
  } catch (e) {
    return handleError(e);
  }
}
