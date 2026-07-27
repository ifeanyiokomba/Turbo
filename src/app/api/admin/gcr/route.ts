// TurboCore GCR — overview endpoint
//
// GET /api/admin/gcr
//   Returns the top-level stats + group summary + capability count by status.
//   Powers the admin "Overview" sub-tab.

import { json, handleError } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { getGcrStats, getGroupStats, getProviderMatrixStats } =
      await import("@/lib/turbocore/gcr");
    await requirePermission(Permissions.CAPABILITIES_VIEW);
    const stats = getGcrStats();
    const groups = getGroupStats();
    const providerMatrix = getProviderMatrixStats();
    return json({
      stats,
      groups,
      providerMatrix,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return handleError(e);
  }
}
