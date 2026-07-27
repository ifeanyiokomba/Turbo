// TurboCore — PIDA API (Chapter 13: Production Infrastructure & Deployment Architecture)

import { json, handleError } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePermission(Permissions.CAPABILITIES_VIEW);
    const {
      ENVIRONMENTS,
      PIPELINES,
      RECENT_DEPLOYMENTS,
      INFRA_COMPONENTS,
      REGIONS,
      BACKUP_CONFIGS,
      DR_TARGET,
      READINESS_CHECKS,
      AUTOSCALING_RULES,
      SECRET_CONFIGS,
      COST_PHASES,
      getPidaStats,
    } = await import("@/lib/turbocore/pida/deployment-data");

    return json({
      stats: getPidaStats(),
      environments: ENVIRONMENTS,
      pipelines: PIPELINES,
      deployments: RECENT_DEPLOYMENTS,
      infraComponents: INFRA_COMPONENTS,
      regions: REGIONS,
      backups: BACKUP_CONFIGS,
      drTarget: DR_TARGET,
      readinessChecks: READINESS_CHECKS,
      autoscalingRules: AUTOSCALING_RULES,
      secrets: SECRET_CONFIGS,
      costPhases: COST_PHASES,
    });
  } catch (e) {
    return handleError(e);
  }
}
