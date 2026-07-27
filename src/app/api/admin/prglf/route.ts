// TurboCore — PRGLF API (Chapter 15: Production Readiness, Governance & Launch Framework)

import { json, handleError } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePermission(Permissions.CAPABILITIES_VIEW);
    const {
      DOMAIN_OWNERSHIP,
      ADRS,
      CHANGE_RECORDS,
      RELEASES,
      INCIDENTS,
      LAUNCH_CHECKLIST,
      POST_LAUNCH_PHASES,
      OPERATIONAL_METRICS,
      EXECUTIVE_DASHBOARD,
      EVOLUTION_STAGES,
      PROVIDER_GOVERNANCE,
      REGULATORY_REGISTERS,
      AI_GOVERNANCE_RULES,
      getPrglfStats,
    } = await import("@/lib/turbocore/prglf/governance-data");

    return json({
      stats: getPrglfStats(),
      domainOwnership: DOMAIN_OWNERSHIP,
      adrs: ADRS,
      changes: CHANGE_RECORDS,
      releases: RELEASES,
      incidents: INCIDENTS,
      launchChecklist: LAUNCH_CHECKLIST,
      postLaunchPhases: POST_LAUNCH_PHASES,
      operationalMetrics: OPERATIONAL_METRICS,
      executiveDashboard: EXECUTIVE_DASHBOARD,
      evolutionStages: EVOLUTION_STAGES,
      providerGovernance: PROVIDER_GOVERNANCE,
      regulatoryRegisters: REGULATORY_REGISTERS,
      aiGovernanceRules: AI_GOVERNANCE_RULES,
    });
  } catch (e) {
    return handleError(e);
  }
}
