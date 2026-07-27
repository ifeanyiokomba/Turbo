// TurboCore — OMO API (Chapter 12: Observability, Monitoring & Operations)
//
// GET /api/admin/omo — returns the full observability platform data.

import { json, handleError } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePermission(Permissions.CAPABILITIES_VIEW);

    const { getRecentLogs, getMetrics, getMetricSummary, getTraces } =
      await import("@/lib/turbocore/omo/observability");
    const {
      getSLIs,
      getSLOs,
      getProviderHealthDashboard,
      getAlerts,
      getIncidents,
      getBusinessDashboard,
      getFraudDashboard,
      getReconciliationDashboard,
      getAuditDashboard,
      getOperationalKPIs,
      getOIEInsights,
    } = await import("@/lib/turbocore/omo/monitoring");

    const [auditDashboard] = await Promise.all([getAuditDashboard()]);

    return json({
      // Pillar 1: Structured Logging
      logs: getRecentLogs(20),
      logCount: getRecentLogs(500).length,

      // Pillar 2: Metrics
      metrics: getMetrics(20),
      metricSummary: getMetricSummary(),

      // Pillar 3: Tracing
      traces: getTraces(10),

      // Pillar 4: Health + SLI/SLO
      providerHealth: getProviderHealthDashboard(),
      slis: getSLIs(),
      slos: getSLOs(),

      // Pillar 5: Alerting + Incidents
      alerts: getAlerts(),
      incidents: getIncidents(),

      // Dashboards
      business: getBusinessDashboard(),
      fraud: getFraudDashboard(),
      reconciliation: getReconciliationDashboard(),
      audit: auditDashboard,

      // Operational KPIs
      kpis: getOperationalKPIs(),

      // OIE — Operations Intelligence Engine
      insights: getOIEInsights(),
    });
  } catch (e) {
    return handleError(e);
  }
}
