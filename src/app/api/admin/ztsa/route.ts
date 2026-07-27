// TurboCore — Security Command Center API (Chapter 10)
//
// GET /api/admin/ztsa
//   Returns: feature risk profiles, ABAC policies, compliance targets,
//   incident runbooks, security monitoring metrics.

import { json, handleError } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePermission(Permissions.CAPABILITIES_VIEW);

    const { FEATURE_RISK_PROFILES, getRiskStats } =
      await import("@/lib/turbocore/ztsa/feature-risk-engine");
    const { listPolicies, getPolicyStats } = await import("@/lib/turbocore/ztsa/policy-engine");
    const { COMPLIANCE_TARGETS, getComplianceStats } =
      await import("@/lib/turbocore/ztsa/zero-trust");
    const { INCIDENT_RUNBOOKS } = await import("@/lib/turbocore/ztsa/incident-runbooks");
    const { verifySecurityPosture } = await import("@/lib/security-audit");

    const securityPosture = await verifySecurityPosture();

    return json({
      featureRisk: {
        profiles: FEATURE_RISK_PROFILES,
        stats: getRiskStats(),
      },
      policies: {
        list: listPolicies(),
        stats: getPolicyStats(),
      },
      compliance: {
        targets: COMPLIANCE_TARGETS,
        stats: getComplianceStats(),
      },
      incidentRunbooks: INCIDENT_RUNBOOKS,
      securityPosture,
      monitoring: {
        failedLogins24h: 0, // would query from audit logs in production
        permissionChanges24h: 0,
        providerAuthFailures24h: 0,
        webhookFailures24h: 0,
        suspiciousTransfers24h: 0,
        highRiskCountryAccess24h: 0,
        apiAbuseBlocked24h: 0,
        tokenRevocations24h: 0,
        activeSessions: 0,
        mfaEnrollments: 0,
        passkeyEnrollments: 0,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
