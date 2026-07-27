// TurboCore GCR — capability tree endpoint
//
// GET /api/admin/gcr/tree
//   Returns the full capability tree: groups → capabilities → features.
//   Used by the admin tree browser.

import { json, handleError } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { CAPABILITY_GROUPS, CAPABILITIES, getCapabilitiesByGroup } =
      await import("@/lib/turbocore/gcr");
    await requirePermission(Permissions.CAPABILITIES_VIEW);
    const tree = CAPABILITY_GROUPS.map((g) => ({
      ...g,
      capabilities: getCapabilitiesByGroup(g.id).map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        direction: c.direction,
        status: c.status,
        countries: c.countries,
        currencies: c.currencies,
        requiredKycTier: c.requiredKycTier,
        supportsRecurring: c.supportsRecurring,
        supportsRefunds: c.supportsRefunds,
        supportsChargeback: c.supportsChargeback,
        features: c.features,
        versions: c.versions,
        tags: c.tags,
      })),
    }));
    return json({
      groups: CAPABILITY_GROUPS.length,
      capabilities: CAPABILITIES.length,
      tree,
    });
  } catch (e) {
    return handleError(e);
  }
}
