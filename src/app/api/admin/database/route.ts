// TurboCore — Database Architecture API (Chapter 8)
//
// GET /api/admin/database
//   Returns the full domain catalog: 14+ domains, ~120 tables, relationships,
//   partitioning strategy, backup strategy, DR targets.
//
// GET /api/admin/database?domain=ledger
//   Returns a single domain's tables.
//
// GET /api/admin/database?stats=1
//   Returns just the summary stats.

import { json, handleError } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requirePermission(Permissions.CAPABILITIES_VIEW);
    const url = new URL(req.url);
    const domain = url.searchParams.get("domain");
    const statsOnly = url.searchParams.get("stats") === "1";

    const {
      DOMAINS,
      getDomain,
      getTableStats,
      CANONICAL_RELATIONSHIPS,
      PARTITION_STRATEGIES,
      BACKUP_STRATEGIES,
      DR_TARGETS,
      ID_PREFIXES,
    } = await import("@/lib/turbocore/database");

    if (statsOnly) {
      return json({
        stats: getTableStats(),
        drTargets: DR_TARGETS,
        backupStrategies: BACKUP_STRATEGIES,
        partitionStrategies: PARTITION_STRATEGIES,
        idPrefixCount: Object.keys(ID_PREFIXES).length,
      });
    }

    if (domain) {
      const d = getDomain(domain as any);
      if (!d) return json({ error: "Domain not found" }, 404);
      return json({ domain: d });
    }

    return json({
      domains: DOMAINS,
      stats: getTableStats(),
      relationships: CANONICAL_RELATIONSHIPS,
      partitionStrategies: PARTITION_STRATEGIES,
      backupStrategies: BACKUP_STRATEGIES,
      drTargets: DR_TARGETS,
      idPrefixes: ID_PREFIXES,
    });
  } catch (e) {
    return handleError(e);
  }
}
