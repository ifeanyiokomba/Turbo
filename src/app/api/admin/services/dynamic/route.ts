// TurboCore — Dynamic Service Registry API
//
// The spec: "Instead of manually coding 'Virtual Cards Page', create:
//   Capability = Virtual Cards → Get Providers Supporting Capability →
//   Run Health Check → Choose Best Provider → Display Feature.
//   The page should work forever. Even if ten providers are added later."
//
// This endpoint returns the dynamically-resolved services for a given country +
// customer context. No hardcoded service lists — everything is capability-driven.
//
// GET /api/admin/services/dynamic?country=NG&kycTier=2
//   Returns: all available services for this customer, each with:
//     - capability id + name
//     - best provider (healthiest)
//     - failover chain
//     - health score
//     - estimated cost + latency

import { json, handleError } from "@/lib/api";
import { requirePermission } from "@/lib/turbocore/rbac";
import { Permissions } from "@/lib/turbocore/rbac/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requirePermission(Permissions.CAPABILITIES_VIEW);
    const url = new URL(req.url);
    const country = (url.searchParams.get("country") ?? "NG").toUpperCase();
    const kycTier = Number(url.searchParams.get("kycTier") ?? "1");
    const currency = url.searchParams.get("currency") ?? undefined;
    const groupId = url.searchParams.get("groupId") ?? undefined;

    const { CAPABILITIES } = await import("@/lib/turbocore/gcr/capability-tree");
    const { getCountryCapabilitySupport } = await import("@/lib/turbocore/gcr/country-matrix");
    const { getProvidersForCapabilityInCountry } =
      await import("@/lib/turbocore/gcr/provider-matrix");
    const { getBreakerStates, registry } = await import("@/lib/turbocore/registry");

    const breakerStates = getBreakerStates();

    // Filter capabilities by group if specified
    let capabilities = CAPABILITIES;
    if (groupId) {
      capabilities = capabilities.filter((c) => c.groupId === groupId);
    }

    // For each capability, resolve the best provider + failover chain
    const services = capabilities
      .map((cap) => {
        // Check country support
        const countrySupport = getCountryCapabilitySupport(country, cap.id);
        if (countrySupport === "DISABLED") return null;

        // Get providers that implement this capability in this country
        const providerEntries = getProvidersForCapabilityInCountry(cap.id, country);
        if (providerEntries.length === 0) return null;

        // Filter by KYC tier
        if (kycTier < cap.requiredKycTier) return null;

        // Build provider candidates with health + scoring
        const candidates = providerEntries
          .filter((e) => e.maturity !== "PARKED" && e.maturity !== "ROADMAP")
          .map((entry) => {
            const breaker = breakerStates[entry.providerCode];
            const health = registry.getHealth(entry.providerCode);
            const isHealthy = !breaker || breaker.state !== "OPEN";

            const maturityScore =
              entry.maturity === "NATIVE"
                ? 40
                : entry.maturity === "SUPPORTED"
                  ? 30
                  : entry.maturity === "BETA"
                    ? 15
                    : entry.maturity === "LIMITED"
                      ? 10
                      : 0;

            const countryScore =
              countrySupport === "FULL" ? 30 : countrySupport === "BETA" ? 15 : 10;
            const healthScore = isHealthy ? 30 : 0;
            const score = maturityScore + countryScore + healthScore;

            return {
              providerCode: entry.providerCode,
              maturity: entry.maturity,
              score,
              healthScore: health.score,
              healthStatus: isHealthy ? "HEALTHY" : "CIRCUIT_OPEN",
              circuitState: breaker?.state ?? "CLOSED",
              isPrimary: false,
            };
          })
          .sort((a, b) => {
            if (a.healthStatus === "CIRCUIT_OPEN" && b.healthStatus !== "CIRCUIT_OPEN") return 1;
            if (a.healthStatus !== "CIRCUIT_OPEN" && b.healthStatus === "CIRCUIT_OPEN") return -1;
            return b.score - a.score;
          });

        if (candidates.length === 0) return null;

        // Primary = best healthy candidate; failover = rest of healthy candidates
        const healthy = candidates.filter((c) => c.healthStatus === "HEALTHY");
        const primary = healthy[0] ?? candidates[0];
        if (primary) primary.isPrimary = true;
        const failoverChain = healthy.filter((c) => !c.isPrimary).map((c) => c.providerCode);

        return {
          capabilityId: cap.id,
          capabilityName: cap.name,
          description: cap.description,
          groupId: cap.groupId,
          direction: cap.direction,
          status: cap.status,
          countrySupport,
          requiredKycTier: cap.requiredKycTier,
          supportsRecurring: cap.supportsRecurring,
          supportsRefunds: cap.supportsRefunds,
          supportsChargeback: cap.supportsChargeback,
          bestProvider: primary.providerCode,
          bestProviderScore: primary.score,
          bestProviderHealth: primary.healthScore,
          failoverChain,
          totalProviders: candidates.length,
          candidates,
        };
      })
      .filter((s) => s !== null) as Array<NonNullable<ReturnType<typeof Object>>>;

    // Group by capability group for the UI
    const { CAPABILITY_GROUPS } = await import("@/lib/turbocore/gcr/capability-tree");
    const grouped = CAPABILITY_GROUPS.map((g) => ({
      groupId: g.id,
      groupName: g.name,
      description: g.description,
      icon: g.icon,
      accent: g.accent,
      services: services.filter((s) => s.groupId === g.id),
    })).filter((g) => g.services.length > 0);

    return json({
      country,
      kycTier,
      currency: currency ?? "auto",
      totalServices: services.length,
      totalGroups: grouped.length,
      groups: grouped,
      services,
    });
  } catch (e) {
    return handleError(e);
  }
}
