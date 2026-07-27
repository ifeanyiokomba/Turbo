// TurboCore — MTPA API (Chapter 11: Multi-Tenant Platform Architecture)
//
// GET /api/admin/mtpa
//   Returns: all tenants, tenant configs, policies, stats, billing, cross-tenant ops.
//
// GET /api/admin/mtpa?tenantId=X
//   Returns: single tenant detail + config + policies + billing.

import { json, handleError } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requirePermission(Permissions.CAPABILITIES_VIEW);
    const url = new URL(req.url);
    const tenantId = url.searchParams.get("tenantId");

    const { TENANTS, getTenant, getTenantConfig, getTenantStats, resolveTenant } =
      await import("@/lib/turbocore/mtpa/tenant-registry");
    const { listTenantPolicies, getPolicyStats } =
      await import("@/lib/turbocore/mtpa/tenant-policy-engine");
    const { getTenantBilling, getCrossTenantOps } =
      await import("@/lib/turbocore/mtpa/tenant-context");

    const stats = getTenantStats();
    const policies = listTenantPolicies();
    const policyStats = getPolicyStats();
    const crossTenantOps = getCrossTenantOps(20);

    if (tenantId) {
      const tenant = getTenant(tenantId);
      if (!tenant) return json({ error: "Tenant not found" }, 404);
      const config = getTenantConfig(tenantId);
      const tenantPolicies = listTenantPolicies(tenantId);
      const billing = await getTenantBilling(tenantId);
      return json({ tenant, config, policies: tenantPolicies, billing });
    }

    // Return all tenants with their configs + billing summaries
    const tenantsWithData = await Promise.all(
      TENANTS.map(async (t) => ({
        ...t,
        config: getTenantConfig(t.id),
        billing: await getTenantBilling(t.id),
      }))
    );

    return json({
      tenants: tenantsWithData,
      stats,
      policies,
      policyStats,
      crossTenantOps,
      resolution: resolveTenant({ domain: url.searchParams.get("domain") }),
    });
  } catch (e) {
    return handleError(e);
  }
}
