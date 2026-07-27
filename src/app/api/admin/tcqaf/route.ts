// TurboCore — TCQAF API (Chapter 14: Testing, Certification & Quality Assurance Framework)

import { json, handleError } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePermission(Permissions.CAPABILITIES_VIEW);
    const {
      TEST_SUITES,
      CERTIFICATIONS,
      PROVIDER_SANDBOXES,
      QUALITY_METRICS,
      RELEASE_GATES,
      PROVIDER_SIMULATIONS,
      RELEASE_CERTIFICATION,
      LOAD_TESTS,
      CHAOS_EXPERIMENTS,
      getTcqafStats,
    } = await import("@/lib/turbocore/tcqaf/quality-data");

    return json({
      stats: getTcqafStats(),
      testSuites: TEST_SUITES,
      certifications: CERTIFICATIONS,
      providerSandboxes: PROVIDER_SANDBOXES,
      qualityMetrics: QUALITY_METRICS,
      releaseGates: RELEASE_GATES,
      providerSimulations: PROVIDER_SIMULATIONS,
      releaseCertification: RELEASE_CERTIFICATION,
      loadTests: LOAD_TESTS,
      chaosExperiments: CHAOS_EXPERIMENTS,
    });
  } catch (e) {
    return handleError(e);
  }
}
