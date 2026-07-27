// TurboCore — MTPA Tenant Lifecycle API
//
// POST /api/admin/mtpa/lifecycle — { tenantId, lifecycle }
//   Transitions a tenant through its lifecycle: CREATED → CONFIGURED → VERIFIED → ACTIVATED → SUSPENDED → ARCHIVED

import { json, handleError, audit, getClientIp } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requirePermission(Permissions.CAPABILITIES_MANAGE);
    const body = await req.json().catch(() => ({}));
    const tenantId = String(body.tenantId ?? "");
    const lifecycle = String(body.lifecycle ?? "");

    if (!tenantId || !lifecycle) {
      return json({ error: "tenantId and lifecycle are required" }, 400);
    }

    const { transitionLifecycle, getTenant } = await import("@/lib/turbocore/mtpa/tenant-registry");
    const ok = transitionLifecycle(tenantId, lifecycle as any);
    if (!ok) {
      return json({ error: "Invalid lifecycle transition" }, 400);
    }

    const tenant = getTenant(tenantId);
    await audit({
      userId: user.id,
      action: "TENANT_LIFECYCLE_TRANSITION",
      category: "ADMIN",
      severity: "WARN",
      ip: getClientIp(req),
      metadata: { tenantId, tenantCode: tenant?.code, newLifecycle: lifecycle },
    });

    return json({ success: true, message: `Tenant transitioned to ${lifecycle}`, tenant });
  } catch (e) {
    return handleError(e);
  }
}
