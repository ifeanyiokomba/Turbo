// TurboCore GCR — capability groups list
//
// GET /api/admin/gcr/groups
//   Returns all 22 capability groups with their stats.

import { json, handleError } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { CAPABILITY_GROUPS, getGroupStats } = await import("@/lib/turbocore/gcr");
    await requirePermission(Permissions.CAPABILITIES_VIEW);
    const stats = getGroupStats();
    return json({
      groups: CAPABILITY_GROUPS.map((g) => ({
        ...g,
        stats: stats.find((s) => s.groupId === g.id),
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
